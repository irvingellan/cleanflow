import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const project = "demo-cleanflow";
assert.equal(process.env.GCLOUD_PROJECT, project);
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  assert.match(process.env[key] ?? "", /^127\.0\.0\.1:\d+$/, `A local ${key} is required`);
}
const developer = randomUUID();
process.env.DEV_CENTER_DEVELOPER_UIDS = developer;
const require = createRequire(new URL("../functions/src/index.js", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const app = initializeApp({ projectId: project });
const db = getFirestore(app);
const auth = getAuth(app);
const { getPlatformOverview } = await import("../functions/src/index.js");
const { cleanerAccountUid } = await import("../functions/src/cleanerHubAccess.js");

const fixtureSlug = randomUUID().replace(/\d/g, (digit) => String.fromCharCode(97 + Number(digit)));
const orgs = ["Amber", "Teal"].map((color) => ({
  color, ref: db.collection("organizations").doc(`test-${color.toLowerCase()}-${fixtureSlug}`),
}));
const privateMarker = `private-fixture-${randomUUID()}`;
const day = 86_400_000;
const now = Date.now();
const timestamp = (days) => Timestamp.fromMillis(now + days * day);
const date = (days) => timestamp(days).toDate().toISOString().slice(0, 10);
const authIds = [];
const manager = randomUUID();
const cleaner = cleanerAccountUid(orgs[0].ref.id, "crew");
const signIns = new Map();
const managerDevices = Array.from({ length: 3 }, () => db.collection("managerPushDevices").doc());

async function createSignedInAccount(uid) {
  const email = ["fixture" + randomUUID(), "example.invalid"].join("@");
  const password = randomUUID();
  await auth.createUser({ uid, email, password });
  authIds.push(uid);
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) },
  );
  assert.equal(response.status, 200);
  const user = await auth.getUser(uid);
  signIns.set(uid, new Date(user.metadata.lastSignInTime).toISOString());
}

function seedOrganization({ ref, color }, first) {
  const batch = db.batch();
  const put = (path, data) => batch.set(ref.firestore.doc(`${ref.path}/${path}`), data);
  // Older organizations consist of subcollections without a root document.
  if (first) batch.set(ref, { displayName: `Test ${color}`, createdAt: timestamp(-60), notes: privateMarker });
  put(`members/${first ? manager : randomUUID()}`, { role: "MANAGER", active: true, ...(first ? {} : { displayName: `Manager ${color}` }) });
  put(`members/${randomUUID()}`, { role: "CLIENT", active: true, displayName: privateMarker });
  put("cleaners/crew", { name: `Crew ${color}`, active: true, phone: privateMarker });
  put("clients/current", { active: true, name: privateMarker, address: privateMarker, email: [privateMarker, "example.invalid"].join("@") });
  put("properties/current", { active: true, name: privateMarker, doorCode: privateMarker, garageCode: privateMarker });
  put("jobs/old", { operationalStatus: "COMPLETED", scheduledDate: date(-32), createdAt: timestamp(-36),
    updatedAt: timestamp(-32), completedAt: timestamp(-32), notes: privateMarker });
  const accountId = cleanerAccountUid(ref.id, "crew");
  put("cleanerHubAccess/crew", { linkedAt: timestamp(-8), updatedAt: timestamp(0), sessionId: privateMarker });
  put(`cleanerPushAccounts/${accountId}/devices/one`, { active: first, role: "CLEANER", lastSeenAt: timestamp(first ? -4 : -0.1), cleanerId: "crew", token: privateMarker });
  put("jobs/old/assignments/confirmation", { organizationId: ref.id, cleanerId: "crew", cleanerAcknowledgedAt: timestamp(-3) });
  put("jobs/old/checklistRuns/review", { organizationId: ref.id, readyForReviewCleanerId: "crew", readyForReviewAt: timestamp(first ? -2 : -0.2) });
  put("jobs/old/checklistRuns/review/draftMutations/update", { cleanerId: "crew", createdAt: timestamp(first ? -1 : -4) });
  put("managerPageLoadEvents/old", { createdAt: timestamp(-9), page: "jobs", durationMs: 51 });
  if (first) {
    put(`members/${cleaner}`, { role: "CLEANER", active: true, organizationId: ref.id, sessionIds: [privateMarker], displayName: `Crew ${color}`, cleanerId: "crew" });
    put(`members/${randomUUID()}`, { role: "CLEANER", active: true, cleanerId: "removed", displayName: "Removed crew" });
    put("cleaners/legacy", { name: "Legacy crew" });
    put("jobs/old/assignments/legacy", { cleanerId: "legacy", cleanerAcknowledgedAt: timestamp(-5) });
    put("cleanerHubAccess/retired", { linkedAt: timestamp(-30), updatedAt: timestamp(-1), active: false });
    put("clients/legacy", { name: privateMarker });
    put("properties/legacy", { name: privateMarker });
    put("cleaners/retired", { active: false, archivedAt: timestamp(-5), name: "Archived crew" });
    put("clients/archived", { active: true, archivedAt: timestamp(-8) });
    put("properties/archived", { active: true, archivedAt: timestamp(-8), accessCode: privateMarker });
    put("jobs/offered", { operationalStatus: "OFFERED", createdAt: timestamp(-2), updatedAt: timestamp(-1),
      scheduledDate: date(2), schemaVersion: 2, assignedCleanerIds: [] });
    put("jobs/archived", { operationalStatus: "OFFERED", createdAt: timestamp(-45), updatedAt: timestamp(-4),
      scheduledDate: date(3), archivedAt: timestamp(-4) });
    put("jobs/archived/offers/crew", { jobId: "archived", cleanerId: "crew", status: "PENDING" });
    put("jobs/offered/issues/open", { status: "OPEN", createdAt: timestamp(-8), description: privateMarker });
    put("jobs/offered/issues/resolved", { status: "RESOLVED" });
    put("jobs/offered/offers/crew", { jobId: "offered", createdAt: timestamp(-2), cleanerId: "crew", status: "PENDING" });
    put("jobs/offered/offers/no", { jobId: "offered", cleanerId: "no", status: "DECLINED" });
    put("jobs/done", { operationalStatus: "COMPLETED", createdAt: timestamp(-35), updatedAt: timestamp(-3),
      completedAt: timestamp(-3), scheduledDate: date(-3) });
    put("jobs/done/offers/unused", { jobId: "done", cleanerId: "unused", status: "PENDING" });
    for (const durationMs of [100, 200, 500, 600_000]) {
      put(`managerPageLoadEvents/load-${durationMs}`, { page: "jobs", createdAt: timestamp(-1), durationMs, result: durationMs === 100 ? "error" : "success" });
    }
    for (const [id, delta, result] of [["failed", -1, "error"], ["ok", -2, "success"], ["old", -9, "error"]]) {
      put(`managerOperationEvents/${id}`, { page: "job-detail", operation: "issues", result, createdAt: timestamp(delta) });
    }
  } else {
    // A full week can span more than one page of equally timestamped events.
    for (let event = 0; event < 101; event++) {
      const result = event === 100 ? "error" : "success";
      put(`managerPageLoadEvents/load-${String(event).padStart(3, "0")}`, { page: "jobs", createdAt: timestamp(-2), durationMs: 600_000, result });
    }
    // The manager job creation flow sets createdAt without setting updatedAt.
    put("jobs/created-only/offers/pending", { jobId: "created-only", cleanerId: "pending", status: "PENDING",
      createdAt: timestamp(-10), managerReopenedAt: timestamp(-0.5) });
    put("jobs/created-only", { operationalStatus: "OFFERED", createdAt: timestamp(-1), scheduledDate: date(20) });
  }
  if (first) {
    // This submission predates the reporting window; the job completed within it.
    put("jobs/done/checklistRuns/initial", { readyForReviewAt: timestamp(-31), readyForReviewByRole: "MANAGER" });
    put("jobs/offered/checklistRuns/initial", { readyForReviewAt: timestamp(-3), readyForReviewByRole: "MANAGER" });
    put("jobs/offered/checklistRuns/initial/evidenceContent/saved", { status: "SAVED", createdAt: timestamp(-3), storagePath: privateMarker });
    put("jobs/offered/checklistRuns/initial/evidenceContent/removed", { status: "REMOVED", createdAt: timestamp(-6) });
    put("jobs/offered/checklistRuns/initial/evidenceContent/pending", { status: "RESERVED" });
    put("jobs/offered/checklistRuns/initial/evidence/required", { status: "SAVED", createdAt: timestamp(-3), evidenceId: "saved" });
    put("jobs/done/checklistRuns/initial/evidence/legacy", { status: "SAVED", createdAt: timestamp(-4) });
    put("jobs/done/checklistRuns/initial/clientReportCapabilities/active", { createdAt: timestamp(-40), lastSent: { at: timestamp(-2) }, tokenHash: privateMarker });
    put("jobs/offered/checklistRuns/initial/clientReportCapabilities/active", { createdAt: timestamp(-1), tokenHash: privateMarker });
    for (const [i, device] of managerDevices.entries()) {
      batch.set(device, { organizationId: ref.id, active: i < 2, lastSeenAt: timestamp(i === 1 ? -9 : -2), token: privateMarker });
    }
    for (let n = 0; n < 8; n++) put(`managerReminderDeliveries/sent-${n}`, { attemptedAt: timestamp(-1), deliveryStatus: "SENT" });
    put("jobs/done/managerNotificationDeliveries/partial", { attemptedAt: timestamp(-3), deliveryStatus: "PARTIAL" });
    put("cleanerNotificationDeliveries/failure", { recordedAt: timestamp(-1), deliveryStatus: "FAILED" });
    put("cleanerNotificationDeliveries/no-target", { recordedAt: timestamp(-1), deliveryStatus: "NO_ACTIVE_DEVICES" });
    put("cleanerNotificationDeliveries/stale", { recordedAt: timestamp(-8), deliveryStatus: "FAILED" });
    put("cleanerNotificationDeliveries/unknown", { recordedAt: timestamp(-1), deliveryStatus: "UNKNOWN" });
  } else {
    put("jobs/old/checklistRuns/review/clientReportCapabilities/active", { createdAt: timestamp(-3), lastSent: { at: timestamp(-1) } });
    put("cleanerNotificationDeliveries/sent", { recordedAt: timestamp(-1), deliveryStatus: "FCM_ACCEPTED" });
  }
  return batch.commit();
}

const forbiddenKey = /address|accesscode|doorcode|lockcode|garage|alarm|phone|email|token|url|photo|checklistanswer|notes|price|payout|session|uid/i;

function assertPrivateFieldsAbsent(node) {
  if (typeof node === "string") {
    assert.ok(!node.includes(privateMarker), "a private fixture value escaped projection");
    if (node.includes("@")) assert.match(node, /^[\p{L}\p{N}]{0,2}•••@$/u);
    assert.doesNotMatch(node, /(?:https?|gs):\/\/|(?:\+?\d[ .()-]*){9,}\d/i);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "photos30d") assert.ok(Number.isSafeInteger(value) && value >= 0);
      else assert.doesNotMatch(key, forbiddenKey);
      assertPrivateFieldsAbsent(value);
    }
  }
}

// Include even a newly created root/subcollection, and detect updates and replacements
// in addition to a changed document count.
async function databaseVersions() {
  const result = [];
  async function visit(collection) {
    for (const ref of await collection.listDocuments()) {
      const doc = await ref.get();
      if (doc.exists) result.push([ref.path, doc.updateTime.seconds, doc.updateTime.nanoseconds]);
      for (const child of await ref.listCollections()) await visit(child);
    }
  }
  for (const root of await db.listCollections()) await visit(root);
  return result.sort(([a], [b]) => a.localeCompare(b));
}

function call(data, uid) {
  return getPlatformOverview.run({ data, auth: uid ? { uid } : undefined });
}

before(async () => {
  await Promise.all([createSignedInAccount(manager), createSignedInAccount(cleaner)]);
  await Promise.all(orgs.map((org, index) => seedOrganization(org, index === 0)));
});

after(async () => {
  try {
    await Promise.all(orgs.map(({ ref }) => db.recursiveDelete(ref)));
    await Promise.all(managerDevices.map(device => device.delete()));
    if (authIds.length) await auth.deleteUsers(authIds);
  } finally {
    await deleteApp(app);
  }
});

test("the privacy check rejects nested keys, private values, links and contact strings", () => {
  for (const value of [{ photos30d: "x" }, { photoUrl: "x" }, { lockCode: "x" }, { displayName: privateMarker }, { label: ["fixture", "example.invalid"].join("@") },
    { displayName: "https://example.invalid" }, { displayName: ["111", "222", "3333"].join(" ") }]) {
    assert.throws(() => assertPrivateFieldsAbsent({ nested: [{ value }] }));
  }
});

test("only the developer can read overview or detail, and a denied call leaves the database unchanged", async () => {
  const before = await databaseVersions();
  for (const uid of [undefined, manager, cleaner, randomUUID()]) {
    for (const data of [{}, { organizationId: orgs[0].ref.id }, { organizationId: orgs[1].ref.id }]) {
      await assert.rejects(call(data, uid), { code: uid ? "permission-denied" : "unauthenticated" });
    }
  }
  const anonymousSession = { uid: developer, token: { firebase: { sign_in_provider: "anonymous" } } };
  for (const data of [{}, { organizationId: orgs[0].ref.id }]) {
    await assert.rejects(getPlatformOverview.run({ data, auth: anonymousSession }), { code: "permission-denied" });
  }
  assert.deepEqual(await databaseVersions(), before);
});

test("the developer sees per-organization counts and only that organization's people without writing", async () => {
  const before = await databaseVersions();
  const overview = await call({}, developer);
  assertPrivateFieldsAbsent(overview);
  const [amber, teal] = orgs.map(({ ref }) => overview.organizations.find((org) => org.id === ref.id));
  assert.equal(amber.displayName, "Test Amber");
  assert.equal(amber.createdAt, timestamp(-60).toDate().toISOString());
  assert.deepEqual(amber.people, { activeManagers: 1, activeCleaners: 2, archivedCleaners: 1 });
  assert.deepEqual(amber.clients, { active: 2, archived: 1 });
  assert.deepEqual(amber.properties, { active: 1, archived: 1 });
  assert.deepEqual(amber.jobs, { total: 4, created30d: 1, scheduled7d: 1, completed30d: 1 });
  assert.deepEqual(amber.attention, { openIssues: 1, waitingOffers: 1 });
  assert.equal(amber.lastActivityAt, timestamp(-1).toDate().toISOString());
  assert.deepEqual(amber.health, { status: "no-data", pageLoads: 4, failedPageLoads: 1, pageFailureRate: 0.25, timedLoads: 3, medianMs: 200, p95Ms: 500, failedOperations: { issues: 1 }, operationAttempts: { issues: 2 }, operationFailureRates: { issues: 0.5 } });
  assert.equal((await orgs[1].ref.get()).exists, false);
  assert.equal(teal.displayName, null);
  assert.equal(teal.createdAt, null);
  assert.deepEqual(teal.people, { activeManagers: 1, activeCleaners: 1, archivedCleaners: 0 });
  assert.deepEqual(teal.jobs, { total: 2, created30d: 1, scheduled7d: 0, completed30d: 0 });
  assert.equal(teal.lastActivityAt, timestamp(-1).toDate().toISOString());
  assert.deepEqual(teal.attention, { openIssues: 0, waitingOffers: 1 });
  assert.deepEqual(teal.health, { status: "ok", pageLoads: 101, failedPageLoads: 1, pageFailureRate: 1/101, timedLoads: 0, medianMs: null, p95Ms: null, failedOperations: {}, operationAttempts: {}, operationFailureRates: {} });

  const detail = await call({ organizationId: amber.id }, developer);
  assertPrivateFieldsAbsent(detail);
  const byName = (a, b) => a.displayName.localeCompare(b.displayName);
  assert.deepEqual([...detail.people].sort(byName), [
    { displayName: "Archived crew", role: "CLEANER", active: false, lastSignInAt: null, lastActivityAt: timestamp(-30).toDate().toISOString(), activitySource: "agenda" },
    { displayName: "Crew Amber", role: "CLEANER", active: true, lastSignInAt: null, lastActivityAt: timestamp(-1).toDate().toISOString(), activitySource: "checklist" },
    { displayName: "Legacy crew", role: "CLEANER", active: true, lastSignInAt: null, lastActivityAt: timestamp(-5).toDate().toISOString(), activitySource: "agenda" },
    { displayName: "Removed crew", role: "CLEANER", active: false, lastSignInAt: null, lastActivityAt: null, activitySource: null },
    { displayName: "fi•••@", role: "MANAGER", active: true, lastSignInAt: signIns.get(manager), lastActivityAt: signIns.get(manager), activitySource: "signIn" },
  ].sort(byName));
  const other = await call({ organizationId: teal.id }, developer);
  assertPrivateFieldsAbsent(other);
  const otherCleaner = other.people.find(person => person.role === "CLEANER");
  assert.equal(otherCleaner.lastActivityAt, timestamp(-0.1).toDate().toISOString());
  assert.equal(otherCleaner.activitySource, "notifications");
  assert.deepEqual(other.people.map(({ displayName }) => displayName).sort(), ["Crew Teal", "Manager Teal"]);
  assert.deepEqual(amber.attentionReasons, ["notificationFailures", "oldOffers", "oldIssues"]);
  assert.deepEqual(teal.attentionReasons, []);
  assert.deepEqual(detail.usage.adoption, { profiles: 2, hubAccess: 1, active30d: 1, submitted30d: 1 });
  assert.deepEqual(detail.usage.checklists, { submitted30d: 2, photos30d: 3, completedJobs30d: 1, completedWithChecklist30d: 1 });
  assert.deepEqual(detail.usage.reports, { prepared30d: 1, sent30d: 1 });
  assert.deepEqual(detail.usage.notifications, { managerDevices: 2, managerActive7d: 1, cleanerDevices: 1,
    deliveries7d: { sent: 8, failed: 1, partial: 1, noDevice: 1 } });
  assert.equal(detail.usage.weeklyJobs.length, 8);
  assert.equal(detail.usage.weeklyJobs.reduce((sum, week) => sum + week.count, 0), 4);
  assert.deepEqual(other.usage.adoption, { profiles: 1, hubAccess: 0, active30d: 0, submitted30d: 0 });
  assert.deepEqual(other.usage.reports, { prepared30d: 1, sent30d: 1 });
  assert.deepEqual(other.usage.notifications.deliveries7d, { sent: 1, failed: 0, partial: 0, noDevice: 0 });
  assert.deepEqual(await databaseVersions(), before);
});
