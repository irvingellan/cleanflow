import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

// Cleaner Hub V1 boundary tests against isolated local emulators only.
const expected = {
  GCLOUD_PROJECT: "demo-cleanflow",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:18180",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19180",
};
for (const [name, value] of Object.entries(expected)) {
  assert.equal(process.env[name], value, `Cleaner Hub security tests require local ${name}`);
}

const { initializeApp } = await import("firebase-admin/app");
initializeApp({ projectId: "demo-cleanflow" });
const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
const functionsIndex = await import("../functions/src/index.js");
const {
  assignCleanerDirectly,
  createChecklistRun,
  issueChecklistCapability,
  issueCleanerAccessCode,
  openMyChecklist,
  redeemCleanerAccessCode,
  rescheduleJob,
  respondToMyOffer,
  revokeCleanerHubAccess,
} = functionsIndex;
const { syncCleanerAgendaForJob } = await import("../functions/src/cleanerAgenda.js");
const { cleanerAccountUid, hashCleanerAccessCode } = await import("../functions/src/cleanerHubAccess.js");

const admin = getFirestore();
const functionDatabase = createRequire(new URL("../functions/src/index.js", import.meta.url))(
  "firebase-admin/firestore",
).getFirestore();
const org = "cleanflow-demo";
const root = `organizations/${org}`;
const uidA = cleanerAccountUid(org, "cleaner-a");
const uidB = cleanerAccountUid(org, "cleaner-b");
let environment;

function managerRequest(data) {
  return { auth: { uid: "manager", token: { firebase: { sign_in_provider: "password" } } }, data };
}
function cleanerRequest(uid, data) {
  return { auth: { uid, token: { firebase: { sign_in_provider: "custom" } } }, data };
}
function cleanerDb(uid) {
  return environment.authenticatedContext(uid, { firebase: { sign_in_provider: "custom" } }).firestore();
}
function dateKey(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
async function sync(jobId, orgId = org) {
  // Stands in for the three Firestore triggers; the E2E suite runs the real ones.
  return syncCleanerAgendaForJob(functionDatabase, { organizationId: orgId, jobId });
}
async function link(cleanerId) {
  const { code } = await issueCleanerAccessCode.run(managerRequest({ cleanerId }));
  const { token } = await redeemCleanerAccessCode.run({ data: { code } });
  return { code, token };
}
async function agendaFor(cleanerId) {
  const snapshot = await admin.collection(`${root}/cleanerAgenda`).where("cleanerId", "==", cleanerId).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
async function createJob(jobId, extra = {}) {
  await admin.doc(`${root}/jobs/${jobId}`).set({
    organizationId: org,
    schemaVersion: 2,
    propertyId: "property",
    propertyName: "Maple Example House",
    clientName: "Synthetic Client",
    clientPrice: 250,
    cleanerPayout: 150,
    notes: "private-manager-note",
    guestName: "private-guest",
    scheduledDate: dateKey(3),
    scheduledStart: "10:30",
    operationalStatus: "UNASSIGNED",
    assignedCleanerIds: [],
    checklistContextRevision: 0,
    ...extra,
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-cleanflow",
    firestore: { host: "127.0.0.1", port: 18180, rules: await readFile("firestore.rules", "utf8") },
  });
});
after(async () => { await environment?.cleanup(); });

beforeEach(async () => {
  await environment.clearFirestore();
  await fetch("http://127.0.0.1:19180/emulator/v1/projects/demo-cleanflow/accounts", { method: "DELETE" });
  const batch = admin.batch();
  batch.set(admin.doc(`${root}/members/manager`), { role: "MANAGER", active: true });
  batch.set(admin.doc(`${root}/properties/property`), {
    organizationId: org, name: "Maple Example House", keyCodeInfo: "private-door-code", accessInstructions: "private-access",
  });
  for (const [id, name] of [["cleaner-a", "Ana Example"], ["cleaner-b", "Bia Example"]]) {
    batch.set(admin.doc(`${root}/cleaners/${id}`), { organizationId: org, name, active: true, preferredLanguage: "pt" });
  }
  batch.set(admin.doc(`${root}/cleaners/archived`), { organizationId: org, name: "Old Example", active: true, archivedAt: Timestamp.now() });
  batch.set(admin.doc("organizations/other-org/members/other-manager"), { role: "MANAGER", active: true });
  batch.set(admin.doc("organizations/other-org/jobs/other-job"), {
    organizationId: "other-org", schemaVersion: 2, propertyName: "Other Org House", scheduledDate: dateKey(1),
    operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"],
  });
  await batch.commit();
});

test("manager-issued code links one CLEANER account once; code is hashed and single-use", async () => {
  await assert.rejects(issueCleanerAccessCode.run(cleanerRequest(uidA, { cleanerId: "cleaner-a" })), { code: "permission-denied" });
  await assert.rejects(issueCleanerAccessCode.run({ data: { cleanerId: "cleaner-a" } }), { code: "unauthenticated" });
  await assert.rejects(issueCleanerAccessCode.run(managerRequest({ cleanerId: "archived" })), { code: "failed-precondition" });

  const { code, expiresAt } = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-a" }));
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(new Date(expiresAt).getTime() > Date.now() + 70 * 3600 * 1000);
  const raw = code.replaceAll("-", "");
  const stored = await admin.collection("cleanerAccessCodes").get();
  assert.equal(stored.size, 1);
  assert.equal(stored.docs[0].id, hashCleanerAccessCode(raw));
  assert.ok(!JSON.stringify(stored.docs[0].data()).includes(raw));

  const { token } = await redeemCleanerAccessCode.run({ data: { code: code.toLowerCase().replaceAll("-", " ") } });
  assert.equal(typeof token, "string");
  const member = (await admin.doc(`${root}/members/${uidA}`).get()).data();
  assert.deepEqual(
    { role: member.role, active: member.active, cleanerId: member.cleanerId, displayName: member.displayName },
    { role: "CLEANER", active: true, cleanerId: "cleaner-a", displayName: "Ana" },
  );
  // The custom token signs in on the Auth emulator and carries only org/cleaner scope.
  const response = await fetch("http://127.0.0.1:19180/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }),
  });
  const session = await response.json();
  assert.ok(session.idToken && session.refreshToken);
  const claims = JSON.parse(Buffer.from(session.idToken.split(".")[1], "base64url").toString());
  assert.equal(claims.user_id, uidA);
  assert.deepEqual(claims.cleanerHub, { organizationId: org, cleanerId: "cleaner-a" });

  await assert.rejects(redeemCleanerAccessCode.run({ data: { code } }), { code: "failed-precondition" });
  await assert.rejects(redeemCleanerAccessCode.run({ data: { code: "AAAA-BBBB-CCCC" } }), { code: "failed-precondition" });
  // A new code replaces an unused earlier one.
  const first = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-b" }));
  const second = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-b" }));
  await assert.rejects(redeemCleanerAccessCode.run({ data: { code: first.code } }), { code: "failed-precondition" });
  await redeemCleanerAccessCode.run({ data: { code: second.code } });
});

test("expired codes and codes for deactivated cleaners never link", async () => {
  const { code } = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-a" }));
  const reference = admin.doc(`cleanerAccessCodes/${hashCleanerAccessCode(code.replaceAll("-", ""))}`);
  await reference.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await assert.rejects(redeemCleanerAccessCode.run({ data: { code } }), { code: "failed-precondition" });
  const fresh = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-a" }));
  await admin.doc(`${root}/cleaners/cleaner-a`).update({ active: false });
  await assert.rejects(redeemCleanerAccessCode.run({ data: { code: fresh.code } }), { code: "failed-precondition" });
  assert.equal((await admin.doc(`${root}/members/${uidA}`).get()).exists, false);
});

test("assignment through the real manager callable appears only in that cleaner's agenda, without private fields", async () => {
  await createJob("job-a");
  await createJob("job-b", { propertyName: "Birch Example Flat", scheduledStart: "14:00" });
  await link("cleaner-a");
  await link("cleaner-b");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-a", cleanerId: "cleaner-a" }));
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-b", cleanerId: "cleaner-b" }));
  await sync("job-a");
  await sync("job-b");

  const dbA = cleanerDb(uidA);
  const mine = await assertSucceeds(dbA.collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-a").get());
  const entries = mine.docs.map((doc) => doc.data()).filter((entry) => entry.kind === "ASSIGNED");
  assert.equal(entries.length, 1);
  assert.deepEqual(
    { jobId: entries[0].jobId, propertyName: entries[0].propertyName, scheduledDate: entries[0].scheduledDate, scheduledStart: entries[0].scheduledStart, jobStatus: entries[0].jobStatus },
    { jobId: "job-a", propertyName: "Maple Example House", scheduledDate: dateKey(3), scheduledStart: "10:30", jobStatus: "ASSIGNED" },
  );
  const serialized = JSON.stringify(mine.docs.map((doc) => doc.data()));
  for (const secret of ["250", "150", "private-", "Synthetic Client", "Bia", "cleaner-b", "Birch"]) {
    assert.ok(!serialized.includes(secret), `agenda must not expose ${secret}`);
  }

  // Cleaner B cannot list or read A's entries; neither can query without the filter.
  const dbB = cleanerDb(uidB);
  await assertFails(dbB.collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-a").get());
  await assertFails(dbB.doc(`${root}/cleanerAgenda/cleaner-a__job-a`).get());
  await assertFails(dbB.collection(`${root}/cleanerAgenda`).get());
  const bEntries = await assertSucceeds(dbB.collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-b").get());
  assert.ok(bEntries.docs.every((doc) => doc.data().jobId !== "job-a"));

  // No manager data paths open up for a cleaner account.
  for (const path of ["jobs/job-a", "properties/property", "cleaners/cleaner-a", "jobs/job-a/assignments/x", "cleanerHubAccess/cleaner-a", `members/${uidB}`]) {
    await assertFails(dbA.doc(`${root}/${path}`).get());
  }
  await assertFails(dbA.collection(`${root}/jobs`).get());
  await assertFails(dbA.doc(`${root}/cleanerAgenda/cleaner-a__job-a`).update({ scheduledStart: "09:00" }));
  await assertFails(dbA.collection(`${root}/cleanerAgenda`).doc("forged").set({ organizationId: org, cleanerId: "cleaner-a" }));
  await assertSucceeds(dbA.doc(`${root}/members/${uidA}`).get());
});

test("cross-organization: a cleaner of one organization reads nothing in another", async () => {
  await link("cleaner-a");
  await sync("other-job", "other-org");
  const otherEntries = await admin.collection("organizations/other-org/cleanerAgenda").where("kind", "==", "ASSIGNED").get();
  assert.equal(otherEntries.size, 1); // projection exists there for that org's own cleaner record
  const dbA = cleanerDb(uidA);
  await assertFails(dbA.collection("organizations/other-org/cleanerAgenda").where("cleanerId", "==", "cleaner-a").get());
  await assertFails(dbA.doc("organizations/other-org/jobs/other-job").get());
  // The other organization's manager cannot issue codes for this organization.
  await assert.rejects(issueCleanerAccessCode.run({ auth: { uid: "other-manager", token: { firebase: { sign_in_provider: "password" } } }, data: { cleanerId: "cleaner-a" } }), { code: "permission-denied" });
});

test("reschedule and roster removal through existing manager paths update the agenda and leave honest notices", async () => {
  await createJob("job-a");
  await link("cleaner-a");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-a", cleanerId: "cleaner-a" }));
  await sync("job-a");
  await rescheduleJob.run(managerRequest({ jobId: "job-a", scheduledDate: dateKey(4), scheduledStart: "13:00" }));
  await sync("job-a");
  let agenda = await agendaFor("cleaner-a");
  const entry = agenda.find((item) => item.kind === "ASSIGNED");
  assert.deepEqual([entry.scheduledDate, entry.scheduledStart, entry.scheduleRevision], [dateKey(4), "13:00", 1]);
  const moved = agenda.find((item) => item.change === "RESCHEDULED");
  assert.deepEqual([moved.from, moved.to, moved.openJobId], [{ date: dateKey(3), start: "10:30" }, { date: dateKey(4), start: "13:00" }, "job-a"]);

  // Same writes the manager browser makes in assignmentService.removeAssignment, under real rules.
  const managerDb = environment.authenticatedContext("manager", { firebase: { sign_in_provider: "password" } }).firestore();
  const assignment = (await admin.collection(`${root}/jobs/job-a/assignments`).where("isActive", "==", true).get()).docs[0];
  const job = (await admin.doc(`${root}/jobs/job-a`).get()).data();
  const batch = managerDb.batch();
  batch.update(managerDb.doc(assignment.ref.path), { isActive: false, removedAt: new Date(), removedByUid: "manager" });
  batch.update(managerDb.doc(`${root}/jobs/job-a`), { assignedCleanerIds: [], operationalStatus: "UNASSIGNED", checklistContextRevision: job.checklistContextRevision + 1 });
  await assertSucceeds(batch.commit());
  await sync("job-a");
  agenda = await agendaFor("cleaner-a");
  assert.equal(agenda.filter((item) => item.kind !== "CHANGE").length, 0);
  const removed = agenda.find((item) => item.change === "UNASSIGNED");
  assert.equal(removed.openJobId, null);
  assert.equal(removed.jobId, undefined);
  await assertFails(cleanerDb(uidA).doc(`${root}/cleanerAgenda/cleaner-a__job-a`).get());

  // Archive (cancellation) after re-assignment produces a CANCELLED notice.
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-a", cleanerId: "cleaner-a" }));
  await sync("job-a");
  await admin.doc(`${root}/jobs/job-a`).update({ archivedAt: Timestamp.now(), archivedBy: "manager" });
  await sync("job-a");
  agenda = await agendaFor("cleaner-a");
  assert.equal(agenda.filter((item) => item.kind !== "CHANGE").length, 0);
  assert.ok(agenda.some((item) => item.change === "CANCELLED"));
});

test("offers stay separate: interest is recorded through the existing Offer service and never becomes an assignment", async () => {
  await createJob("job-offer", { operationalStatus: "OFFERED" });
  const offer = (cleanerId, extra = {}) => admin.doc(`${root}/jobs/job-offer/offers/${cleanerId}`).set({
    cleanerId, cleanerName: cleanerId, status: "PENDING", offeredCompensation: 140,
    publicOfferTokenHash: `hash-${cleanerId}`, publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 86400000), ...extra,
  });
  await offer("cleaner-a");
  await offer("cleaner-b", { publicOfferExpiresAt: null }); // never sent as a link
  await link("cleaner-a");
  await sync("job-offer");
  let agenda = await agendaFor("cleaner-a");
  assert.deepEqual(agenda.map((item) => [item.kind, item.offerStatus, item.offeredCompensation]), [["OFFER", "PENDING", 140]]);
  assert.equal((await agendaFor("cleaner-b")).length, 0);

  const answer = await respondToMyOffer.run(cleanerRequest(uidA, { jobId: "job-offer", status: "INTERESTED" }));
  assert.deepEqual(answer, { state: "answered", status: "INTERESTED" });
  await sync("job-offer");
  agenda = await agendaFor("cleaner-a");
  assert.deepEqual(agenda.map((item) => [item.kind, item.offerStatus]), [["OFFER", "INTERESTED"]]);
  const job = (await admin.doc(`${root}/jobs/job-offer`).get()).data();
  assert.deepEqual([job.operationalStatus, job.assignedCleanerIds], ["OFFERED", []]);
  assert.equal((await admin.collection(`${root}/jobs/job-offer/assignments`).get()).size, 0);
  // Manager notification for interest is created by the existing service.
  assert.equal((await admin.collection(`${root}/jobs/job-offer/managerNotificationDeliveries`).get()).size, 1);

  // A cleaner can only address her own Offer document; an unsent Offer cannot be answered.
  await link("cleaner-b");
  assert.deepEqual(await respondToMyOffer.run(cleanerRequest(uidB, { jobId: "job-offer", status: "INTERESTED" })), { state: "expired", status: null });
  await admin.doc(`${root}/jobs/job-offer/offers/cleaner-b`).delete();
  assert.deepEqual(await respondToMyOffer.run(cleanerRequest(uidB, { jobId: "job-offer", status: "INTERESTED" })), { state: "unavailable", status: null });
  assert.equal((await admin.doc(`${root}/jobs/job-offer/offers/cleaner-a`).get()).data().status, "INTERESTED");
  await assert.rejects(respondToMyOffer.run(managerRequest({ jobId: "job-offer", status: "INTERESTED" })), { code: "permission-denied" });

  await admin.doc(`${root}/jobs/job-offer/offers/cleaner-a`).update({ status: "DECLINED" });
  await sync("job-offer");
  assert.equal((await agendaFor("cleaner-a")).length, 0);
});

test("checklist opens through existing capability rules for the assigned cleaner only", async () => {
  await createJob("job-a");
  await link("cleaner-a");
  await link("cleaner-b");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-a", cleanerId: "cleaner-a" }));
  assert.deepEqual(await openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" })), { state: "not-ready" });
  assert.deepEqual(await openMyChecklist.run(cleanerRequest(uidB, { jobId: "job-a" })), { state: "unavailable" });
  await createChecklistRun.run(managerRequest({ jobId: "job-a" }));
  const opened = await openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" }));
  assert.equal(opened.state, "ready");
  assert.equal(typeof opened.token, "string");
  const capability = (await admin.doc(`${root}/jobs/job-a/checklistRuns/initial/checklistCapabilities/active`).get()).data();
  assert.deepEqual([capability.cleanerId, capability.status, capability.issuedByUid], ["cleaner-a", "ACTIVE", uidA]);
  const read = { code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; } };
  await functionsIndex.publicChecklist({ method: "GET", query: { token: opened.token }, get() { return undefined; } }, read);
  assert.equal(read.code, 200);
  assert.ok(read.body.checklist);

  // A teammate's active link is never taken over.
  await admin.doc(`${root}/jobs/job-a`).update({ assignedCleanerIds: ["cleaner-a", "cleaner-b"] });
  await issueChecklistCapability.run(managerRequest({ jobId: "job-a", cleanerId: "cleaner-b" }));
  assert.deepEqual(await openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" })), { state: "teammate" });
});

test("revocation ends reads, callables and refresh tokens; a new code restores access", async () => {
  await createJob("job-a");
  const { token } = await link("cleaner-a");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-a", cleanerId: "cleaner-a" }));
  await sync("job-a");
  const session = await (await fetch("http://127.0.0.1:19180/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }),
  })).json();
  await assert.rejects(revokeCleanerHubAccess.run(cleanerRequest(uidA, { cleanerId: "cleaner-a" })), { code: "permission-denied" });
  await new Promise((resolve) => setTimeout(resolve, 1100)); // token revocation has 1-second granularity
  await revokeCleanerHubAccess.run(managerRequest({ cleanerId: "cleaner-a" }));

  const dbA = cleanerDb(uidA);
  await assertFails(dbA.collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-a").get());
  await assert.rejects(openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" })), { code: "permission-denied" });
  // Refresh tokens issued before revocation are invalidated (production Auth enforces this
  // on refresh; the emulator only records it, so assert the recorded cut-off).
  const { getAuth } = await import("firebase-admin/auth");
  const user = await getAuth().getUser(uidA);
  assert.ok(new Date(user.tokensValidAfterTime).getTime() > Date.parse(new Date(JSON.parse(Buffer.from(session.idToken.split(".")[1], "base64url").toString()).auth_time * 1000).toISOString()));
  const access = (await admin.doc(`${root}/cleanerHubAccess/cleaner-a`).get()).data();
  assert.equal(access.active, false);

  await link("cleaner-a");
  await assertSucceeds(cleanerDb(uidA).collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-a").get());
});

test("linking backfills Jobs assigned before access existed, including legacy single-cleaner Jobs", async () => {
  await createJob("job-early");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-early", cleanerId: "cleaner-a" }));
  await admin.doc(`${root}/jobs/legacy`).set({
    organizationId: org, propertyName: "Legacy Example", scheduledDate: dateKey(2), operationalStatus: "ASSIGNED",
    assignedCleanerId: "cleaner-a", assignedCleanerName: "Ana Example", cleanerPayout: 120,
  });
  await admin.collection(`${root}/cleanerAgenda`).get().then((snapshot) => Promise.all(snapshot.docs.map((doc) => doc.ref.delete())));
  await link("cleaner-a");
  const agenda = await agendaFor("cleaner-a");
  assert.deepEqual(agenda.filter((item) => item.kind === "ASSIGNED").map((item) => item.jobId).sort(), ["job-early", "legacy"]);
  assert.equal(agenda.filter((item) => item.kind === "CHANGE").length, 0);
});
