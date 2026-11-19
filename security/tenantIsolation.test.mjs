import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

// Tenant isolation through the browser SDK: an account of one organization can
// never read or write another organization. Local, disposable emulators only.
function localEmulatorPort(variable) {
  const match = /^127\.0\.0\.1:(\d{2,5})$/.exec(process.env[variable] || "");
  assert.ok(match, `Tenant isolation tests require a local ${variable}`);
  return Number(match[1]);
}
assert.equal(process.env.GCLOUD_PROJECT, "demo-cleanflow", "Tenant isolation tests require the demo project");
const firestorePort = localEmulatorPort("FIRESTORE_EMULATOR_HOST");
const storagePort = localEmulatorPort("FIREBASE_STORAGE_EMULATOR_HOST");

const organizations = ["org-a", "org-b"];
const password = { firebase: { sign_in_provider: "password" } };
const jpeg = { contentType: "image/jpeg" };
let environment;

const root = (org) => `organizations/${org}`;
const suffix = (org) => org.slice(-1);
const managerUid = (org) => `manager-${suffix(org)}`;
const inactiveManagerUid = (org) => `inactive-manager-${suffix(org)}`;
const cleanerUid = (org) => `cleaner-account-${suffix(org)}`;
const proofPath = (org) => `${root(org)}/payouts/payout-1/proof/payment-proof`;

function cleanerClaims(org, overrides = {}) {
  return { organizationId: org, cleanerId: "cleaner-1", sessionId: "session-1", ...overrides };
}

/**
 * One document in every collection the Rules name under an organization.
 * `collection` is the name as the Rules write it; the completeness test below
 * fails when the Rules gain a collection this table does not cover.
 */
function records(org) {
  const stamp = { organizationId: org, fixture: true };
  return [
    { collection: "members", path: `members/${managerUid(org)}`, data: { role: "MANAGER", active: true } },
    { collection: "members", path: `members/${inactiveManagerUid(org)}`, data: { role: "MANAGER", active: false } },
    { collection: "members", path: `members/${cleanerUid(org)}`,
      data: { role: "CLEANER", active: true, organizationId: org, cleanerId: "cleaner-1", sessionIds: ["session-1"] } },
    { collection: "cleaners", path: "cleaners/cleaner-1", data: { ...stamp, name: "Example Cleaner", active: true } },
    { collection: "cleanerAgenda", path: "cleanerAgenda/entry-1", data: { ...stamp, cleanerId: "cleaner-1", kind: "ASSIGNED" },
      filter: ["cleanerId", "==", "cleaner-1"] },
    { collection: "cleanerHubAccess", path: "cleanerHubAccess/cleaner-1", data: { ...stamp, state: "LINKED" } },
    { collection: "managerPageLoadEvents", path: "managerPageLoadEvents/event-1", data: { ...stamp, page: "jobs" } },
    { collection: "managerOperationEvents", path: "managerOperationEvents/event-1", data: { ...stamp, page: "job-detail" } },
    { collection: "clients", path: "clients/client-1", data: { ...stamp, name: "Example Client" } },
    { collection: "properties", path: "properties/property-1", data: { ...stamp, name: "Example House" } },
    { collection: "jobs", path: "jobs/job-1", data: { ...stamp, propertyName: "Example House", operationalStatus: "UNASSIGNED" } },
    { collection: "payouts", path: "payouts/payout-1", data: { ...stamp, amount: 100 } },
    { collection: "offers", path: "jobs/job-1/offers/offer-1", data: { ...stamp, cleanerId: "cleaner-1", status: "PENDING" } },
    { collection: "assignments", path: "jobs/job-1/assignments/assignment-1", data: { ...stamp, cleanerId: "cleaner-1", isActive: true } },
    { collection: "issues", path: "jobs/job-1/issues/issue-1", data: { ...stamp, status: "OPEN" } },
  ];
}

const collectionOf = (record) => record.path.slice(0, record.path.lastIndexOf("/"));

function manager(org, claims = {}) {
  return environment.authenticatedContext(managerUid(org), { ...password, ...claims });
}
function inactiveManager(org) {
  return environment.authenticatedContext(inactiveManagerUid(org), password);
}
function cleaner(org, claims = cleanerClaims(org)) {
  return environment.authenticatedContext(cleanerUid(org), { firebase: { sign_in_provider: "custom" }, cleanerHub: claims });
}
function anonymousAccount() {
  return environment.authenticatedContext("anonymous-account", { firebase: { sign_in_provider: "anonymous" } });
}

/** get, list, create, update and delete of every record of `org` are all refused. */
async function assertNoAccess(context, org, { skip = () => false } = {}) {
  const db = context.firestore();
  for (const record of records(org)) {
    if (skip(record)) continue;
    const document = db.doc(`${root(org)}/${record.path}`);
    const collection = db.collection(`${root(org)}/${collectionOf(record)}`);
    const where = `${org}/${record.path}`;
    await assert.doesNotReject(assertFails(document.get()), `get ${where}`);
    await assert.doesNotReject(assertFails(collection.get()), `list ${where}`);
    if (record.filter) await assert.doesNotReject(assertFails(collection.where(...record.filter).get()), `filtered list ${where}`);
    await assert.doesNotReject(assertFails(collection.doc("intruder").set(record.data)), `create ${where}`);
    await assert.doesNotReject(assertFails(document.update({ tampered: true })), `update ${where}`);
    await assert.doesNotReject(assertFails(document.set(record.data)), `overwrite ${where}`);
    await assert.doesNotReject(assertFails(document.delete()), `delete ${where}`);
  }
  const proof = context.storage().ref(proofPath(org));
  await assert.doesNotReject(assertFails(proof.getMetadata()), `storage read ${org}`);
  await assert.doesNotReject(assertFails(proof.getDownloadURL()), `storage download ${org}`);
  await assert.doesNotReject(assertFails(proof.put(new Uint8Array([9]), jpeg)), `storage write ${org}`);
  await assert.doesNotReject(assertFails(proof.delete()), `storage delete ${org}`);
}

/** The other organization's records and proof are exactly as seeded. */
async function assertUntouched(org) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const record of records(org)) {
      const snapshot = await db.doc(`${root(org)}/${record.path}`).get();
      assert.deepEqual(snapshot.data(), record.data, `${org}/${record.path} changed`);
      const intruder = await db.doc(`${root(org)}/${collectionOf(record)}/intruder`).get();
      assert.equal(intruder.exists, false, `${org}/${collectionOf(record)}/intruder was created`);
    }
    const metadata = await context.storage().ref(proofPath(org)).getMetadata();
    assert.equal(metadata.size, 3, `${org} proof changed`);
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-cleanflow",
    firestore: { host: "127.0.0.1", port: firestorePort, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: storagePort, rules: await readFile("storage.rules", "utf8") },
  });
});
after(async () => { await environment?.cleanup(); });

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = db.batch();
    for (const org of organizations) {
      batch.set(db.doc(root(org)), { name: `Example Company ${suffix(org).toUpperCase()}` });
      for (const record of records(org)) batch.set(db.doc(`${root(org)}/${record.path}`), record.data);
    }
    await batch.commit();
    for (const org of organizations) await context.storage().ref(proofPath(org)).put(new Uint8Array([1, 2, 3]), jpeg);
  });
});

for (const [own, other] of [["org-a", "org-b"], ["org-b", "org-a"]]) {
  test(`a manager of ${own} cannot read or write anything in ${other}`, async () => {
    await assertNoAccess(manager(own), other);
    await assertUntouched(other);
  });

  test(`a cleaner of ${own} cannot read or write anything in ${other}`, async () => {
    await assertNoAccess(cleaner(own), other);
    await assertUntouched(other);
  });

  test(`a manager of ${own} whose token claims ${other} is still refused there: a claim is not a membership`, async () => {
    await assertNoAccess(manager(own, { organizationId: other }), other);
    await assertUntouched(other);
  });

  test(`a cleaner of ${own} whose token claims ${other} is still refused there`, async () => {
    await assertNoAccess(cleaner(own, cleanerClaims(other)), other);
    await assertUntouched(other);
  });

  test(`an inactive manager of ${own} is refused in ${own}`, async () => {
    // Reading one's own membership stays allowed: the app needs it to say that access was turned off.
    const ownMembership = (record) => record.path === `members/${inactiveManagerUid(own)}`;
    await assertNoAccess(inactiveManager(own), own, { skip: ownMembership });
    const db = inactiveManager(own).firestore();
    const membership = await assertSucceeds(db.doc(`${root(own)}/members/${inactiveManagerUid(own)}`).get());
    assert.equal(membership.data().active, false);
    await assertFails(db.doc(`${root(own)}/members/${inactiveManagerUid(own)}`).update({ active: true }));
    await assertFails(db.doc(`${root(own)}/members/${inactiveManagerUid(own)}`).delete());
    await assertFails(db.collection(`${root(own)}/members`).get());
    await assertUntouched(own);
  });

  // Positive controls: a typo that denies everything cannot make this suite pass.
  test(`positive control: the manager of ${own} reads and writes ${own}`, async () => {
    const db = manager(own).firestore();
    const managerReadable = new Set([
      "cleaners", "cleanerHubAccess", "managerPageLoadEvents", "managerOperationEvents",
      "clients", "properties", "jobs", "payouts", "offers", "assignments", "issues",
    ]);
    for (const record of records(own).filter(({ collection }) => managerReadable.has(collection))) {
      const snapshot = await assertSucceeds(db.doc(`${root(own)}/${record.path}`).get());
      assert.deepEqual(snapshot.data(), record.data);
      const list = await assertSucceeds(db.collection(`${root(own)}/${collectionOf(record)}`).get());
      assert.equal(list.size, 1, `list ${own}/${collectionOf(record)}`);
    }
    const membership = await assertSucceeds(db.doc(`${root(own)}/members/${managerUid(own)}`).get());
    assert.equal(membership.data().role, "MANAGER");

    for (const name of ["clients", "properties", "cleaners", "payouts"]) {
      const created = db.doc(`${root(own)}/${name}/created-by-manager`);
      await assertSucceeds(created.set({ organizationId: own, fixture: true }));
      await assertSucceeds(created.update({ archivedAt: new Date(0) }));
      await assertFails(created.delete());
      assert.equal((await assertSucceeds(created.get())).data().archivedAt.toMillis(), 0);
    }
    const issue = db.doc(`${root(own)}/jobs/job-1/issues/created-by-manager`);
    await assertSucceeds(issue.set({ organizationId: own, status: "OPEN" }));
    await assertSucceeds(issue.update({ status: "RESOLVED" }));
    await assertFails(issue.delete());
    assert.equal((await assertSucceeds(issue.get())).data().status, "RESOLVED");

    const proof = manager(own).storage().ref(proofPath(own));
    assert.equal((await assertSucceeds(proof.getMetadata())).size, 3);
    await assertSucceeds(proof.put(new Uint8Array([4, 5]), jpeg));
  });

  test(`positive control: the cleaner of ${own} reads only her own agenda in ${own}`, async () => {
    const db = cleaner(own).firestore();
    const entry = await assertSucceeds(db.doc(`${root(own)}/cleanerAgenda/entry-1`).get());
    assert.equal(entry.data().cleanerId, "cleaner-1");
    const mine = await assertSucceeds(db.collection(`${root(own)}/cleanerAgenda`).where("cleanerId", "==", "cleaner-1").get());
    assert.equal(mine.size, 1);
    const membership = await assertSucceeds(db.doc(`${root(own)}/members/${cleanerUid(own)}`).get());
    assert.equal(membership.data().role, "CLEANER");
    // The same cleaner has no manager data, even in her own organization.
    await assertFails(db.doc(`${root(own)}/jobs/job-1`).get());
    await assertFails(db.doc(`${root(own)}/clients/client-1`).get());
    await assertFails(db.doc(`${root(own)}/payouts/payout-1`).get());
  });
}

test("an account without sign-in, or signed in anonymously, is refused everywhere", async () => {
  for (const org of organizations) {
    await assertNoAccess(environment.unauthenticatedContext(), org);
    await assertNoAccess(anonymousAccount(), org);
    await assertUntouched(org);
  }
});

test("a manager cannot access feedback reports from the browser, including in her own organization", async () => {
  for (const org of organizations) {
    const path = `${root(org)}/feedbackReports`;
    await environment.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`${path}/example`).set({ status: "NEW" }));
    const report = manager(org, { organizationId: org }).firestore().collection(path);
    await assertFails(report.doc("example").get());
    await assertFails(report.get());
    await assertFails(report.doc("another").set({ status: "NEW" }));
    await assertFails(report.doc("example").update({ status: "CLOSED" }));
    await assertFails(report.doc("example").delete());
  }
});

test("the organization document itself and unnamed paths are closed to every account", async () => {
  for (const context of [manager("org-a"), cleaner("org-a"), anonymousAccount(), environment.unauthenticatedContext()]) {
    const db = context.firestore();
    for (const org of organizations) {
      await assertFails(db.doc(root(org)).get());
      await assertFails(db.doc(root(org)).set({ name: "Renamed" }));
      await assertFails(db.doc(`${root(org)}/settings/current`).get());
      await assertFails(db.doc(`${root(org)}/jobs/job-1/checklistRuns/initial`).get());
    }
    await assertFails(db.collection("organizations").get());
    await assertFails(db.collectionGroup("members").get());
    await assertFails(db.collectionGroup("jobs").get());
    await assertFails(db.collectionGroup("offers").get());
  }
});

test("asking for one's own membership in another organization reveals nothing", async () => {
  // The Rules let an account look up its own membership path anywhere; in an
  // organization it does not belong to, the answer is an empty document.
  const snapshot = await assertSucceeds(manager("org-a").firestore().doc(`${root("org-b")}/members/${managerUid("org-a")}`).get());
  assert.equal(snapshot.exists, false);
  await assertFails(manager("org-a").firestore().doc(`${root("org-b")}/members/${managerUid("org-a")}`)
    .set({ role: "MANAGER", active: true }));
  await assertUntouched("org-b");
});

test("completeness: every collection the Rules name under an organization is in the table", async () => {
  const rules = await readFile("firestore.rules", "utf8");
  const start = rules.indexOf("match /organizations/{orgId} {");
  const end = rules.indexOf("match /{document=**}");
  assert.ok(start > 0 && end > start, "the organization block of firestore.rules was not found");
  const block = rules.slice(start + "match /organizations/{orgId} {".length, end);

  const named = new Set();
  for (const [, path] of block.matchAll(/match\s+(\/\S+)\s*\{/g)) {
    for (const segment of path.split("/").filter(Boolean)) {
      if (!segment.startsWith("{")) named.add(segment);
    }
  }
  // Wildcard matches name their collections in conditions such as `collectionName in ['clients', …]`.
  for (const [, list] of block.matchAll(/collectionName\s+in\s+\[([^\]]*)\]/g)) {
    for (const [, name] of list.matchAll(/'([^']+)'/g)) named.add(name);
  }
  for (const [, name] of block.matchAll(/collectionName\s*[!=]=\s*'([^']+)'/g)) named.add(name);

  const covered = new Set(records("org-a").map(({ collection }) => collection));
  assert.ok(named.size >= 13, `expected the Rules to name at least 13 collections, found ${named.size}`);
  assert.deepEqual([...named].filter((name) => !covered.has(name)).sort(), [],
    "firestore.rules names a collection that the tenant isolation table does not cover");

  const storageRules = await readFile("storage.rules", "utf8");
  const storageMatches = [...storageRules.matchAll(/match\s+(\/organizations\/\S+)\s*\{/g)].map(([, path]) => path);
  assert.deepEqual(storageMatches, ["/organizations/{orgId}/payouts/{payoutId}/proof/payment-proof"],
    "storage.rules names an organization path that the tenant isolation suite does not cover");
});
