import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
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
process.env.AUTOMATIC_OFFERS_MODE = "enabled";

const { initializeApp } = await import("firebase-admin/app");
initializeApp({ projectId: "demo-cleanflow" });
const { FieldValue, getFirestore, Timestamp } = await import("firebase-admin/firestore");
const { serverTimestamp } = await import("firebase/firestore");
const functionsIndex = await import("../functions/src/index.js");
const {
  assignCleanerDirectly,
  createAutomaticJobOffers,
  createChecklistRun,
  createManualReplacementOffer,
  issueChecklistCapability,
  issueCleanerAccessCode,
  listNotificationInbox,
  openMyChecklist,
  redeemCleanerAccessCode,
  removeAutomaticCleanerAssignment,
  getMyJobAccess,
  rescheduleJob,
  respondToMyOffer,
  respondToMyReschedule,
  revokeCleanerHubAccess,
  submitChecklistRunForReview,
} = functionsIndex;
const { syncCleanerAgendaForJob } = await import("../functions/src/cleanerAgenda.js");
const { recordCleanerJobInboxEvents } = await import("../functions/src/cleanerNotificationEvents.js");
const { cleanerAccountUid, hashCleanerAccessCode } = await import("../functions/src/cleanerHubAccess.js");

const admin = getFirestore();
const functionDatabase = createRequire(new URL("../functions/src/index.js", import.meta.url))(
  "firebase-admin/firestore",
).getFirestore();
const org = "cleanflow-demo";
const root = `organizations/${org}`;
const uidA = cleanerAccountUid(org, "cleaner-a");
const uidB = cleanerAccountUid(org, "cleaner-b");
const uidC = cleanerAccountUid(org, "cleaner-c");
const hubClaimsByUid = new Map();
let environment;

function managerRequest(data) {
  return { auth: { uid: "manager", token: { firebase: { sign_in_provider: "password" } } }, data };
}
function decodeToken(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
}
function cleanerToken(uid, cleanerHub = hubClaimsByUid.get(uid)) {
  return { firebase: { sign_in_provider: "custom" }, ...(cleanerHub && { cleanerHub }) };
}
function cleanerRequest(uid, data, claims) {
  return { auth: { uid, token: cleanerToken(uid, claims) }, data };
}
function cleanerDb(uid, claims) {
  return environment.authenticatedContext(uid, cleanerToken(uid, claims)).firestore();
}
async function signInWithCodeToken(token) {
  const response = await fetch("http://127.0.0.1:19180/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function readAgendaWithToken(idToken, entryId) {
  const response = await fetch(`http://127.0.0.1:18180/v1/projects/demo-cleanflow/databases/(default)/documents/${root}/cleanerAgenda/${entryId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  await response.text();
  return response.status;
}
async function refreshIdToken(refreshToken) {
  const response = await fetch("http://127.0.0.1:19180/securetoken.googleapis.com/v1/token?key=synthetic", {
    method: "POST",
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).id_token;
}
function publicResponse() {
  return {
    code: 200,
    set() {},
    status(code) { this.code = code; return this; },
    json(data) { this.body = data; return this; },
    send(data) { this.body = data; return this; },
  };
}
async function readPublicChecklist(token) {
  const response = publicResponse();
  await functionsIndex.publicChecklist({ method: "GET", query: { token }, get() { return undefined; } }, response);
  return response;
}
async function requestPublicOffer(method, token, data) {
  const response = publicResponse();
  await functionsIndex.publicOffer({ method, query: { token }, body: { token, ...data } }, response);
  return response;
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
  hubClaimsByUid.set(cleanerAccountUid(org, cleanerId), decodeToken(token).claims.cleanerHub);
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
  hubClaimsByUid.clear();
  await environment.clearFirestore();
  await fetch("http://127.0.0.1:19180/emulator/v1/projects/demo-cleanflow/accounts", { method: "DELETE" });
  const batch = admin.batch();
  batch.set(admin.doc(`${root}/members/manager`), { role: "MANAGER", active: true });
  batch.set(admin.doc(`${root}/properties/property`), {
    organizationId: org, name: "Maple Example House", keyCodeInfo: "private-door-code", accessInstructions: "private-access",
  });
  for (const [id, name] of [["cleaner-a", "Ana Example"], ["cleaner-b", "Bia Example"], ["cleaner-c", "Cris Example"]]) {
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
  const session = await signInWithCodeToken(token);
  assert.ok(session.idToken && session.refreshToken);
  const claims = decodeToken(session.idToken);
  assert.equal(claims.user_id, uidA);
  assert.match(member.sessionId, /^[a-f0-9]{32}$/);
  assert.deepEqual(claims.cleanerHub, { organizationId: org, cleanerId: "cleaner-a", sessionId: member.sessionId });

  await assert.rejects(redeemCleanerAccessCode.run({ data: { code } }), { code: "failed-precondition" });
  await assert.rejects(redeemCleanerAccessCode.run({ data: { code: "AAAA-BBBB-CCCC" } }), { code: "failed-precondition" });
  // A new code replaces the earlier one and only one concurrent redemption wins.
  const first = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-b" }));
  const second = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-b" }));
  await assert.rejects(redeemCleanerAccessCode.run({ data: { code: first.code } }), { code: "failed-precondition" });
  const attempts = await Promise.allSettled([
    redeemCleanerAccessCode.run({ data: { code: second.code } }),
    redeemCleanerAccessCode.run({ data: { code: second.code } }),
  ]);
  assert.deepEqual(attempts.map(({ status }) => status).sort(), ["fulfilled", "rejected"]);
  assert.equal(attempts.find(({ status }) => status === "rejected").reason.code, "failed-precondition");
});

test("expired codes and codes for deactivated cleaners never link", async () => {
  const { code } = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-a" }));
  const reference = admin.doc(`cleanerAccessCodes/${hashCleanerAccessCode(code.replaceAll("-", ""))}`);
  await reference.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await assert.rejects(redeemCleanerAccessCode.run({ data: { code } }), { code: "failed-precondition" });
  await reference.update({ expiresAt: null });
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
  for (const secret of ["clientPrice", "cleanerPayout", "private-", "Synthetic Client", "Bia", "cleaner-b", "Birch"]) {
    assert.ok(!serialized.includes(secret), `agenda must not expose ${secret}`);
  }

  assert.equal(entries[0].offeredCompensation, null);

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
  const entry = `${root}/cleanerAgenda/cleaner-a__job-a`;
  const claims = hubClaimsByUid.get(uidA);
  await assertFails(cleanerDb(uidA, null).doc(entry).get());
  await assertFails(cleanerDb(uidA, { ...claims, organizationId: "other-org" }).doc(entry).get());
  await assertFails(cleanerDb(uidA, { ...claims, cleanerId: "cleaner-b" }).doc(entry).get());

  await admin.doc(`${root}/cleaners/cleaner-a`).update({ active: false });
  await assertFails(dbA.doc(entry).get());
  await assert.rejects(openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" })), { code: "permission-denied" });
});

test("complete agenda keeps more than seven assignments across months, including rebuild and removals", async () => {
  const ids = Array.from({ length: 10 }, (_, index) => `scheduled-${index}`);
  for (const [index, jobId] of ids.entries()) {
    await createJob(jobId, { scheduledDate: dateKey(2 + index * 32) });
    await assignCleanerDirectly.run(managerRequest({ jobId, cleanerId: "cleaner-a" }));
    await sync(jobId);
  }
  await createJob("other-cleaner");
  await assignCleanerDirectly.run(managerRequest({ jobId: "other-cleaner", cleanerId: "cleaner-b" }));
  await sync("other-cleaner");
  // Redeeming a code exercises the real projection rebuild, without a date or row cap.
  await admin.collection(`${root}/cleanerAgenda`).get().then((snapshot) => Promise.all(snapshot.docs.map((doc) => doc.ref.delete())));
  await link("cleaner-a");
  const own = cleanerDb(uidA).collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-a");
  const entries = (await assertSucceeds(own.get())).docs.map((doc) => doc.data()).filter((entry) => entry.kind === "ASSIGNED");
  assert.deepEqual(entries.map((entry) => entry.jobId).sort(), [...ids].sort());
  assert.ok(new Set(entries.map((entry) => entry.scheduledDate.slice(0, 7))).size > 2);
  assert.ok(!JSON.stringify(entries).includes("private-"));
  await assertFails(cleanerDb(uidA).collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-b").get());
  await admin.doc(`${root}/jobs/${ids[0]}`).update({ archivedAt: Timestamp.now(), archivedBy: "manager" });
  await admin.doc(`${root}/jobs/${ids[1]}`).update({ assignedCleanerIds: [], operationalStatus: "UNASSIGNED" });
  await sync(ids[0]);
  await sync(ids[1]);
  // Replayed triggers cannot duplicate or resurrect removed schedule cards.
  await Promise.all(ids.map((jobId) => sync(jobId)));
  const remaining = (await assertSucceeds(own.get())).docs.map((doc) => doc.data()).filter((entry) => entry.kind === "ASSIGNED");
  assert.deepEqual(remaining.map((entry) => entry.jobId).sort(), ids.slice(2).sort());
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

  assert.deepEqual(await accept("job-offer", uidA), { state: "unavailable", status: null });
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

async function manualOffers(jobId, cleanerIds, extra = {}) {
  const tokens = {};
  for (const cleanerId of cleanerIds) {
    const token = randomBytes(32).toString("base64url");
    tokens[cleanerId] = token;
    await admin.doc(`${root}/jobs/${jobId}/offers/${cleanerId}`).set({
      jobId, cleanerId, cleanerName: cleanerId, status: "PENDING", offeredCompensation: 140,
      publicOfferTokenHash: createHash("sha256").update(token).digest("hex"),
      publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 86400000), ...extra,
    });
  }
  return tokens;
}
// Mirrors assignInterestedCleaner / removeAssignment through manager Rules.
async function managerConfirms(jobId, cleanerId) {
  const managerDb = environment.authenticatedContext("manager", { firebase: { sign_in_provider: "password" } }).firestore();
  const job = (await admin.doc(`${root}/jobs/${jobId}`).get()).data();
  const batch = managerDb.batch();
  batch.set(managerDb.doc(`${root}/jobs/${jobId}/assignments/assign-${cleanerId}`), {
    schemaVersion: 1, organizationId: org, jobId, cleanerId, cleanerNameSnapshot: cleanerId, source: "OFFER",
    sourceOfferId: cleanerId, isActive: true, executionStatus: "ASSIGNED", createdAt: new Date(), assignedAt: new Date(),
  });
  batch.update(managerDb.doc(`${root}/jobs/${jobId}`), {
    assignedCleanerIds: [...job.assignedCleanerIds, cleanerId], operationalStatus: "ASSIGNED",
    checklistContextRevision: job.checklistContextRevision + 1,
  });
  await assertSucceeds(batch.commit());
}

test("FB08: one spot filled closes the other invitations for links, open tabs and the agenda, without rewriting answers", async () => {
  await createJob("job-fill", { operationalStatus: "OFFERED" });
  const tokens = await manualOffers("job-fill", ["cleaner-a", "cleaner-b", "cleaner-c"]);
  await link("cleaner-a");
  await link("cleaner-b");
  // Both express interest; the second one's tab stays open on the page.
  assert.deepEqual(await respondToMyOffer.run(cleanerRequest(uidA, { jobId: "job-fill", status: "INTERESTED" })), { state: "answered", status: "INTERESTED" });
  assert.equal((await requestPublicOffer("POST", tokens["cleaner-b"], { status: "INTERESTED" })).code, 200);
  const openTab = await requestPublicOffer("GET", tokens["cleaner-c"]);
  assert.equal(openTab.code, 200);

  await managerConfirms("job-fill", "cleaner-a");
  await sync("job-fill");

  // The assigned cleaner keeps her link; the others see a filled spot.
  assert.equal((await requestPublicOffer("GET", tokens["cleaner-a"])).code, 200);
  for (const cleanerId of ["cleaner-b", "cleaner-c"]) {
    const page = await requestPublicOffer("GET", tokens[cleanerId]);
    assert.equal(page.code, 410);
    assert.equal(page.body.error, "offer_already_taken");
    assert.doesNotMatch(JSON.stringify(page.body), /cleaner-a|Ana|140/);
  }
  // The tab opened before the assignment cannot record a response now.
  const late = await requestPublicOffer("POST", tokens["cleaner-c"], { status: "INTERESTED" });
  assert.equal(late.code, 410);
  assert.deepEqual(await respondToMyOffer.run(cleanerRequest(uidB, { jobId: "job-fill", status: "DECLINED" })), { state: "already-taken", status: null });
  // History is preserved: answers were not rewritten.
  const statuses = Object.fromEntries((await admin.collection(`${root}/jobs/job-fill/offers`).get()).docs.map((d) => [d.id, d.data().status]));
  assert.deepEqual(statuses, { "cleaner-a": "INTERESTED", "cleaner-b": "INTERESTED", "cleaner-c": "PENDING" });
  const agendaB = await agendaFor("cleaner-b");
  assert.deepEqual(agendaB.map((item) => [item.kind, item.offerStatus]), [["OFFER", "ALREADY_TAKEN"]]);
  assert.doesNotMatch(JSON.stringify(agendaB), /cleaner-a|private-manager-note/);
  assert.equal((await admin.collection(`${root}/jobs/job-fill/assignments`).get()).size, 1);

  // Removing the assignment reopens the spot for the remaining invitations.
  const managerDb = environment.authenticatedContext("manager", { firebase: { sign_in_provider: "password" } }).firestore();
  const job = (await admin.doc(`${root}/jobs/job-fill`).get()).data();
  const batch = managerDb.batch();
  batch.update(managerDb.doc(`${root}/jobs/job-fill/assignments/assign-cleaner-a`), { isActive: false, removedAt: new Date(), removedByUid: "manager" });
  batch.update(managerDb.doc(`${root}/jobs/job-fill`), { assignedCleanerIds: [], operationalStatus: "OFFERED", checklistContextRevision: job.checklistContextRevision + 1 });
  await assertSucceeds(batch.commit());
  assert.equal((await requestPublicOffer("GET", tokens["cleaner-b"])).code, 200);
});

test("FB08: a Job with two spots keeps the second spot open, then closes the rest", async () => {
  await createJob("job-team", { operationalStatus: "OFFERED", requiredCleanerCount: 2 });
  const tokens = await manualOffers("job-team", ["cleaner-a", "cleaner-b", "cleaner-c"]);
  await managerConfirms("job-team", "cleaner-a");
  assert.equal((await requestPublicOffer("GET", tokens["cleaner-b"])).code, 200);
  assert.equal((await requestPublicOffer("POST", tokens["cleaner-b"], { status: "INTERESTED" })).code, 200);
  await managerConfirms("job-team", "cleaner-b");
  assert.equal((await requestPublicOffer("GET", tokens["cleaner-c"])).body.error, "offer_already_taken");
  assert.equal((await requestPublicOffer("GET", tokens["cleaner-b"])).code, 200);
});

test("FB09: a manager decision closes one invitation, keeps the answer, and reopens explicitly", async () => {
  await createJob("job-decide", { operationalStatus: "OFFERED" });
  const tokens = await manualOffers("job-decide", ["cleaner-a", "cleaner-b"]);
  assert.equal((await requestPublicOffer("POST", tokens["cleaner-b"], { status: "INTERESTED" })).code, 200);
  const managerDb = environment.authenticatedContext("manager", { firebase: { sign_in_provider: "password" } }).firestore();
  await assertSucceeds(managerDb.doc(`${root}/jobs/job-decide/offers/cleaner-b`).update({
    managerDecision: "NOT_SELECTED", managerDecisionAt: serverTimestamp(), managerDecisionByUid: "manager",
  }));
  await assertSucceeds(managerDb.doc(`${root}/jobs/job-decide/offers/cleaner-a`).update({
    managerDecision: "WITHDRAWN", managerDecisionAt: serverTimestamp(), managerDecisionByUid: "manager",
  }));
  for (const cleanerId of ["cleaner-a", "cleaner-b"]) {
    const page = await requestPublicOffer("GET", tokens[cleanerId]);
    assert.equal(page.body.error, "offer_unavailable");
  }
  assert.equal((await requestPublicOffer("POST", tokens["cleaner-a"], { status: "INTERESTED" })).code, 410);
  assert.equal((await admin.doc(`${root}/jobs/job-decide/offers/cleaner-b`).get()).data().status, "INTERESTED");
  await sync("job-decide");
  assert.equal((await agendaFor("cleaner-b")).length, 0);
  // A cleaner cannot write manager decisions.
  await link("cleaner-b");
  await assertFails(cleanerDb(uidB).doc(`${root}/jobs/job-decide/offers/cleaner-b`).update({ managerDecision: null }));
  await assertSucceeds(managerDb.doc(`${root}/jobs/job-decide/offers/cleaner-b`).update({
    managerDecision: null, managerReopenedAt: serverTimestamp(), managerReopenedByUid: "manager",
  }));
  assert.equal((await requestPublicOffer("GET", tokens["cleaner-b"])).code, 200);
});

async function assignedEntry(cleanerId) {
  return (await agendaFor(cleanerId)).find((item) => item.kind === "ASSIGNED");
}
test("FB04: the assigned cleaner's agenda shows the checklist state from creation to review", async () => {
  await createJob("job-cl");
  await link("cleaner-a");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-cl", cleanerId: "cleaner-a" }));
  await sync("job-cl");
  assert.deepEqual((await assignedEntry("cleaner-a")).checklist, { status: "NONE", started: false });
  await createChecklistRun.run(managerRequest({ jobId: "job-cl" }));
  await sync("job-cl");
  assert.deepEqual((await assignedEntry("cleaner-a")).checklist, { status: "DRAFT", started: false });
  // The first saved answer marks it started (the real trigger runs on creation).
  await admin.doc(`${root}/jobs/job-cl/checklistRuns/initial/drafts/current`).set({ revision: 1, checklistAnswers: {} });
  await sync("job-cl");
  assert.deepEqual((await assignedEntry("cleaner-a")).checklist, { status: "DRAFT", started: true });
  await admin.doc(`${root}/jobs/job-cl/checklistRuns/initial`).update({ status: "READY_FOR_REVIEW" });
  await sync("job-cl");
  const entry = (await assignedEntry("cleaner-a"));
  assert.deepEqual(entry.checklist, { status: "READY_FOR_REVIEW", started: false });
  assert.doesNotMatch(JSON.stringify(entry), /private-door-code|private-access/);
});

test("FB01: only the signed-in cleaner on the Job reads shared access, never internal fields", async () => {
  await createJob("job-access", { scheduledDate: dateKey(0) });
  await admin.doc(`${root}/properties/property`).update({ cleanerAccess: { shared: true, door: "synthetic-door-1234" }, address: "1 Example Way" });
  await link("cleaner-a");
  await link("cleaner-b");
  // Offer-only recipient and unassigned cleaners are denied.
  await admin.doc(`${root}/jobs/job-access/offers/cleaner-b`).set({ cleanerId: "cleaner-b", status: "PENDING" });
  assert.deepEqual(await getMyJobAccess.run(cleanerRequest(uidB, { jobId: "job-access" })), { state: "denied" });
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-access", cleanerId: "cleaner-a" }));
  const shared = await getMyJobAccess.run(cleanerRequest(uidA, { jobId: "job-access" }));
  assert.equal(shared.state, "available");
  assert.deepEqual(shared.items, [{ kind: "door", value: "synthetic-door-1234" }]);
  assert.doesNotMatch(JSON.stringify(shared), /private-door-code|private-access/);
  assert.deepEqual(await getMyJobAccess.run(cleanerRequest(uidB, { jobId: "job-access" })), { state: "denied" });
  await assert.rejects(getMyJobAccess.run(managerRequest({ jobId: "job-access" })), { code: "permission-denied" });
  await assert.rejects(getMyJobAccess.run({ auth: null, data: { jobId: "job-access" } }), { code: "unauthenticated" });
  // Cleaners still cannot read the Property document directly.
  await assertFails(cleanerDb(uidA).doc(`${root}/properties/property`).get());
  // Revoking her Hub access ends the read.
  await revokeCleanerHubAccess.run(managerRequest({ cleanerId: "cleaner-a" }));
  await assert.rejects(getMyJobAccess.run(cleanerRequest(uidA, { jobId: "job-access" })), { code: "permission-denied" });
});

test("section 8: the manager sends a complete draft for review on the cleaner's behalf, never an incomplete one", async () => {
  await createJob("job-review");
  await link("cleaner-a");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-review", cleanerId: "cleaner-a" }));
  await createChecklistRun.run(managerRequest({ jobId: "job-review" }));
  const runPath = `${root}/jobs/job-review/checklistRuns/initial`;
  const run = (await admin.doc(runPath).get()).data();
  const itemIds = run.resolvedDefinition.sections.flatMap((section) => section.items.map((item) => item.id));
  const inventoryIds = run.resolvedDefinition.inventoryItems.map((item) => item.id);
  const draft = (answers) => admin.doc(`${runPath}/drafts/current`).set({
    revision: 4, issueNotes: "", generalNotes: "",
    checklistAnswers: Object.fromEntries(itemIds.map((id, index) => [id, answers || index ? "DONE" : "UNANSWERED"])),
    inventoryAnswers: Object.fromEntries(inventoryIds.map((id) => [id, "HIGH"])),
  });
  await draft();
  await assert.rejects(submitChecklistRunForReview.run(managerRequest({ jobId: "job-review", baseRevision: 4 })),
    (error) => error.code === "failed-precondition" && error.details.missingChecklistCount === 1 && error.details.missingPhotoCount === 1);
  await draft(true);
  await admin.doc(`${runPath}/evidenceState/current`).set({ photos: [{ requirementId: "living-belongings", evidenceId: "e1", status: "SAVED" }], pending: [] });
  await assert.rejects(submitChecklistRunForReview.run(managerRequest({ jobId: "job-review", baseRevision: 3 })), { code: "aborted" });
  await assert.rejects(submitChecklistRunForReview.run(cleanerRequest(uidA, { jobId: "job-review", baseRevision: 4 })), { code: "permission-denied" });
  assert.deepEqual(await submitChecklistRunForReview.run(managerRequest({ jobId: "job-review", baseRevision: 4 })), { submitted: true, status: "READY_FOR_REVIEW" });
  const after = (await admin.doc(runPath).get()).data();
  assert.deepEqual([after.status, after.readyForReviewByRole, after.readyForReviewByUid, after.readyForReviewDraftRevision], ["READY_FOR_REVIEW", "MANAGER", "manager", 4]);
  // Repeating is harmless and the Job is not completed by this step.
  assert.deepEqual(await submitChecklistRunForReview.run(managerRequest({ jobId: "job-review", baseRevision: 4 })), { submitted: false, status: "READY_FOR_REVIEW" });
  assert.equal((await admin.doc(`${root}/jobs/job-review`).get()).data().operationalStatus, "ASSIGNED");
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
  const read = await readPublicChecklist(opened.token);
  assert.equal(read.code, 200);
  assert.ok(read.body.checklist);

  // A teammate's active link is never taken over.
  await admin.doc(`${root}/jobs/job-a`).update({ assignedCleanerIds: ["cleaner-a", "cleaner-b"] });
  await issueChecklistCapability.run(managerRequest({ jobId: "job-a", cleanerId: "cleaner-b" }));
  assert.deepEqual(await openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" })), { state: "teammate" });
});

test("revocation ends reads and callables; signing in again never restores the old session", async () => {
  await createJob("job-a");
  const { token } = await link("cleaner-a");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-a", cleanerId: "cleaner-a" }));
  await createChecklistRun.run(managerRequest({ jobId: "job-a" }));
  await sync("job-a");
  const session = await signInWithCodeToken(token);
  const originalClaims = decodeToken(session.idToken).cleanerHub;
  const opened = await openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" }));
  assert.equal(opened.state, "ready");
  assert.equal((await readPublicChecklist(opened.token)).code, 200);
  await createJob("job-manager");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-manager", cleanerId: "cleaner-a" }));
  await createChecklistRun.run(managerRequest({ jobId: "job-manager" }));
  const managerCapability = await issueChecklistCapability.run(managerRequest({ jobId: "job-manager", cleanerId: "cleaner-a" }));
  const entryId = "cleaner-a__job-a";
  assert.equal(await readAgendaWithToken(session.idToken, entryId), 200);
  await assert.rejects(revokeCleanerHubAccess.run(cleanerRequest(uidA, { cleanerId: "cleaner-a" })), { code: "permission-denied" });
  await revokeCleanerHubAccess.run(managerRequest({ cleanerId: "cleaner-a" }));

  const dbA = cleanerDb(uidA, originalClaims);
  await assertFails(dbA.collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-a").get());
  await assertFails(dbA.doc(`${root}/members/${uidA}`).get());
  assert.equal(await readAgendaWithToken(session.idToken, entryId), 403);
  assert.equal((await readPublicChecklist(opened.token)).code, 410);
  assert.equal((await readPublicChecklist(managerCapability.token)).code, 200);
  await assert.rejects(openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" }, originalClaims)), { code: "permission-denied" });
  const access = (await admin.doc(`${root}/cleanerHubAccess/cleaner-a`).get()).data();
  assert.equal(access.active, false);

  const replacement = await link("cleaner-a");
  const nextSession = await signInWithCodeToken(replacement.token);
  assert.notEqual(decodeToken(nextSession.idToken).cleanerHub.sessionId, originalClaims.sessionId);
  assert.equal(await readAgendaWithToken(session.idToken, entryId), 403);
  assert.equal(await readAgendaWithToken(nextSession.idToken, entryId), 200);
  const refreshedOld = await refreshIdToken(session.refreshToken);
  assert.deepEqual(decodeToken(refreshedOld).cleanerHub, originalClaims);
  assert.equal(await readAgendaWithToken(refreshedOld, entryId), 403);
  const refreshedNext = await refreshIdToken(nextSession.refreshToken);
  assert.equal(await readAgendaWithToken(refreshedNext, entryId), 200);
  await assert.rejects(openMyChecklist.run(cleanerRequest(uidA, { jobId: "job-a" }, originalClaims)), { code: "permission-denied" });
  await assertSucceeds(cleanerDb(uidA).collection(`${root}/cleanerAgenda`).where("cleanerId", "==", "cleaner-a").get());
});

test("an additional device preserves both signed-in sessions until replacement or revocation", async () => {
  await createJob("job-two-devices");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-two-devices", cleanerId: "cleaner-a" }));
  await sync("job-two-devices");
  const first = await signInWithCodeToken((await link("cleaner-a")).token);
  const firstSessionId = decodeToken(first.idToken).cleanerHub.sessionId;
  const member = admin.doc(`${root}/members/${uidA}`);
  // Published Hub installs check this scalar, and existing members have no list.
  await member.update({ sessionIds: FieldValue.delete() });
  const entry = "cleaner-a__job-two-devices";
  assert.equal(await readAgendaWithToken(first.idToken, entry), 200);
  const { code } = await issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-a", additionalDevice: true }));
  const { token } = await redeemCleanerAccessCode.run({ data: { code } });
  const second = await signInWithCodeToken(token);
  const secondSessionId = decodeToken(second.idToken).cleanerHub.sessionId;
  assert.notEqual(firstSessionId, secondSessionId);
  assert.equal((await member.get()).data().sessionId, firstSessionId);
  assert.deepEqual((await member.get()).data().sessionIds, [firstSessionId, secondSessionId]);
  assert.equal(await readAgendaWithToken(await refreshIdToken(first.refreshToken), entry), 200);
  assert.equal(await readAgendaWithToken(await refreshIdToken(second.refreshToken), entry), 200);
  const replacement = await signInWithCodeToken((await link("cleaner-a")).token);
  const replacementSessionId = decodeToken(replacement.idToken).cleanerHub.sessionId;
  assert.equal((await member.get()).data().sessionId, replacementSessionId);
  assert.deepEqual((await member.get()).data().sessionIds, [replacementSessionId]);
  assert.equal(await readAgendaWithToken(first.idToken, entry), 403);
  assert.equal(await readAgendaWithToken(second.idToken, entry), 403);
  assert.equal(await readAgendaWithToken(replacement.idToken, entry), 200);
  await revokeCleanerHubAccess.run(managerRequest({ cleanerId: "cleaner-a" }));
  assert.equal(await readAgendaWithToken(replacement.idToken, entry), 403);
  await assert.rejects(issueCleanerAccessCode.run(managerRequest({
    cleanerId: "cleaner-a", additionalDevice: true,
  })), { code: "failed-precondition" });
});

test("a malformed explicit session list cannot authorize through Rules or a callable", async () => {
  await createJob("job-malformed-sessions");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-malformed-sessions", cleanerId: "cleaner-a" }));
  await sync("job-malformed-sessions");
  const { idToken } = await signInWithCodeToken((await link("cleaner-a")).token);
  const claims = decodeToken(idToken).cleanerHub;
  const member = admin.doc(`${root}/members/${uidA}`);
  const entry = "cleaner-a__job-malformed-sessions";
  assert.equal(await readAgendaWithToken(idToken, entry), 200);
  for (const malformed of [{ [claims.sessionId]: true }, null]) {
    await member.update({ sessionIds: malformed });
    assert.equal(await readAgendaWithToken(idToken, entry), 403);
    await assert.rejects(listNotificationInbox.run(cleanerRequest(uidA, { role: "CLEANER" }, claims)), {
      code: "permission-denied",
    });
  }
});

test("eight Hub sessions remain authorized; concurrent final add and a ninth session cannot exceed the cap", async () => {
  const jobId = "job-eight-devices";
  await createJob(jobId);
  await assignCleanerDirectly.run(managerRequest({ jobId, cleanerId: "cleaner-a" }));
  await sync(jobId);

  const issued = await link("cleaner-a");
  const tokens = [issued.token];
  const additional = () => issueCleanerAccessCode.run(managerRequest({ cleanerId: "cleaner-a", additionalDevice: true }));
  const redeem = (code) => redeemCleanerAccessCode.run({ data: { code } });
  for (let index = 1; index < 7; index += 1) {
    tokens.push((await redeem((await additional()).code)).token);
  }

  // Concurrent issuance serializes on the Cleaner access record. Concurrent
  // redemptions of both codes can claim only the eighth and final slot.
  const [first, second] = await Promise.all([additional(), additional()]);
  const attempts = await Promise.allSettled([first.code, second.code, second.code].map(redeem));
  assert.deepEqual(attempts.map(({ status }) => status).sort(), ["fulfilled", "rejected", "rejected"]);
  for (const failure of attempts.filter(({ status }) => status === "rejected")) {
    assert.equal(failure.reason.code, "failed-precondition");
  }
  tokens.push(attempts.find(({ status }) => status === "fulfilled").value.token);
  await assert.rejects(additional(), { code: "failed-precondition" });

  const live = await Promise.all(tokens.map(signInWithCodeToken));
  const sessionIds = live.map(({ idToken }) => decodeToken(idToken).cleanerHub.sessionId);
  assert.equal(new Set(sessionIds).size, 8);
  const membershipRef = admin.doc(`${root}/members/${uidA}`);
  const membership = (await membershipRef.get()).data();
  assert.deepEqual(new Set(membership.sessionIds), new Set(sessionIds));

  const agendaEntry = `cleaner-a__${jobId}`;
  assert.deepEqual(await Promise.all(live.map(({ idToken }) => readAgendaWithToken(idToken, agendaEntry))), Array(8).fill(200));
  // A normal replacement still recovers a saturated account and invalidates
  // every previously allowed device without mutating their Auth credentials.
  const replacement = await signInWithCodeToken((await link("cleaner-a")).token);
  assert.deepEqual(await Promise.all(live.map(({ idToken }) => readAgendaWithToken(idToken, agendaEntry))), Array(8).fill(403));
  assert.equal(await readAgendaWithToken(replacement.idToken, agendaEntry), 200);
  assert.deepEqual((await membershipRef.get()).data().sessionIds, [decodeToken(replacement.idToken).cleanerHub.sessionId]);
});

test("concurrent checklist opens protect the teammate's link, and device recovery retires the old bearer", async () => {
  await createJob("job-team");
  await assignCleanerDirectly.run(managerRequest({ jobId: "job-team", cleanerId: "cleaner-a" }));
  await admin.doc(`${root}/jobs/job-team`).update({ assignedCleanerIds: ["cleaner-a", "cleaner-b"] });
  await createChecklistRun.run(managerRequest({ jobId: "job-team" }));
  await link("cleaner-a");
  await link("cleaner-b");
  const cleaners = [["cleaner-a", uidA], ["cleaner-b", uidB]];
  const results = await Promise.all(cleaners.map(([, uid]) => openMyChecklist.run(cleanerRequest(uid, { jobId: "job-team" }))));
  assert.deepEqual(results.map(({ state }) => state).sort(), ["ready", "teammate"]);
  const winner = results.findIndex(({ state }) => state === "ready");
  const [cleanerId, uid] = cleaners[winner];
  const previousClaims = hubClaimsByUid.get(uid);
  const { token } = results[winner];
  assert.equal((await readPublicChecklist(token)).code, 200);

  await link(cleanerId);
  assert.equal((await readPublicChecklist(token)).code, 410);
  await assert.rejects(openMyChecklist.run(cleanerRequest(uid, { jobId: "job-team" }, previousClaims)), { code: "permission-denied" });
  assert.equal((await openMyChecklist.run(cleanerRequest(uid, { jobId: "job-team" }))).state, "ready");
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


const autoMode = "FIRST_ACCEPT_WINS";

test("without explicit enablement a manager cannot create an automatic batch", async () => {
  const jobId = "disabled-automatic-offer";
  await createJob(jobId);
  const previousMode = process.env.AUTOMATIC_OFFERS_MODE;
  delete process.env.AUTOMATIC_OFFERS_MODE;
  try {
    await assert.rejects(createAutomaticJobOffers.run(managerRequest({ jobId, cleanerIds: ["cleaner-a"] })), {
      code: "failed-precondition",
    });
    const job = jobDocument(jobId);
    assert.equal((await job.get()).data().offerDistributionMode, undefined);
    assert.equal((await job.collection("offers").get()).size, 0);
  } finally {
    if (previousMode !== undefined) process.env.AUTOMATIC_OFFERS_MODE = previousMode;
  }
});
const automaticCleaners = [["cleaner-a", uidA], ["cleaner-b", uidB], ["cleaner-c", uidC]];
const jobDocument = (jobId) => admin.doc(`${root}/jobs/${jobId}`);

async function createAutomaticOffer(jobId, cleanerId, extra = {}) {
  const token = randomBytes(32).toString("base64url");
  const offer = jobDocument(jobId).collection("offers").doc(cleanerId);
  await offer.set({
    jobId, cleanerId, cleanerName: cleanerId, status: "PENDING", offeredCompensation: 140,
    publicOfferTokenHash: createHash("sha256").update(token).digest("hex"),
    publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 86400000),
    createdAt: Timestamp.now(), offerDistributionMode: autoMode, offeredChecklistContextRevision: 0, ...extra,
  });
  return { token, offer };
}

function accept(jobId, uid, data = {}, claims) {
  return respondToMyOffer.run(cleanerRequest(uid, { jobId, status: "ACCEPTED", ...data }, claims));
}

async function createAutomaticJob(jobId, extra = {}) {
  await createJob(jobId, { operationalStatus: "OFFERED", offerDistributionMode: autoMode, ...extra });
  return jobDocument(jobId);
}

async function assignmentsFor(job) {
  const snapshot = await job.collection("assignments").get();
  return snapshot.docs.map((entry) => entry.data());
}

test("three invitees for an unversioned automatic batch retain one assignment, private agenda, and checklist access", async () => {
  const job = await createAutomaticJob("auto-race");
  for (const [cleanerId] of automaticCleaners) {
    await createAutomaticOffer(job.id, cleanerId, {
      offeredPropertyName: "Maple Example House", offeredScheduledDate: dateKey(3), offeredScheduledStart: "10:30",
    });
    await link(cleanerId);
  }
  // An old Hub build's "interested" action cannot claim an automatic Offer.
  const interest = await respondToMyOffer.run(cleanerRequest(uidA, { jobId: job.id, status: "INTERESTED" }));
  assert.deepEqual(interest, { state: "unavailable", status: null });
  assert.deepEqual(await assignmentsFor(job), []);
  // The same state is contended in the real Firestore emulator, through the callable's handler.
  const results = await Promise.all(automaticCleaners.map(([, uid]) => accept(job.id, uid)));
  assert.deepEqual(results.map(({ state }) => state).sort(), ["already-taken", "already-taken", "assigned"]);
  const [winnerId, winnerUid] = automaticCleaners[results.findIndex(({ state }) => state === "assigned")];
  const losers = automaticCleaners.filter(([id]) => id !== winnerId);

  const afterRace = (await job.get()).data();
  assert.deepEqual([afterRace.operationalStatus, afterRace.assignedCleanerIds, afterRace.checklistContextRevision], ["ASSIGNED", [winnerId], 1]);
  assert.equal(afterRace.cleanerPayout, 150);
  const { cleanerId, offerId, assignmentId, acceptedAt } = afterRace.firstAcceptClaim;
  assert.deepEqual([cleanerId, offerId], [winnerId, winnerId]);
  const assignment = (await job.collection("assignments").doc(assignmentId).get()).data();
  assert.equal(assignment.cleanerId, winnerId);
  assert.equal(assignment.source, "OFFER");
  assert.equal(assignment.assignmentMethod, autoMode);
  assert.equal(assignment.sourceOfferId, offerId);
  assert.equal(assignment.isActive, true);
  assert.ok(assignment.assignedAt.isEqual(acceptedAt));
  assert.ok(assignment.cleanerAcknowledgedAt.isEqual(acceptedAt));
  assert.equal((await job.collection("offers").doc(winnerId).get()).data().status, "ACCEPTED");
  const events = job.collection("managerNotificationDeliveries");
  assert.deepEqual((await events.get()).docs.map((doc) => {
    const { eventType, cleanerId, assignmentId } = doc.data();
    return { eventType, cleanerId, assignmentId };
  }), [{ eventType: "ASSIGNMENT_CONFIRMED", cleanerId: winnerId, assignmentId }]);

  const retries = await Promise.all([accept(job.id, winnerUid), accept(job.id, winnerUid)]);
  assert.deepEqual(retries.map(({ state }) => state), ["assigned", "assigned"]);
  for (const [, uid] of losers) {
    const result = await accept(job.id, uid);
    assert.equal(result.state, "already-taken");
    assert.ok(!JSON.stringify(result).includes(winnerId));
  }
  assert.deepEqual(await assignmentsFor(job), [assignment]);
  assert.deepEqual((await job.get()).data(), afterRace);
  assert.equal((await events.get()).size, 1);
  assert.equal((await admin.collection(`${root}/payouts`).get()).size, 0);

  // Real projection logic runs twice, as it may on trigger delivery retries.
  await sync(job.id);
  const entriesBeforeReplay = await admin.collection(`${root}/cleanerAgenda`).get();
  await sync(job.id);
  const entriesAfterReplay = await admin.collection(`${root}/cleanerAgenda`).get();
  assert.deepEqual(entriesAfterReplay.docs.map((doc) => doc.data()), entriesBeforeReplay.docs.map((doc) => doc.data()));
  assert.equal((await agendaFor(winnerId)).filter((entry) => entry.jobId === job.id && entry.kind === "ASSIGNED").length, 1);
  for (const [loserId, loserUid] of losers) {
    const visible = await assertSucceeds(cleanerDb(loserUid).collection(`${root}/cleanerAgenda`).where("cleanerId", "==", loserId).get());
    const entries = visible.docs.map((doc) => doc.data());
    assert.deepEqual(entries.map((entry) => [entry.jobId, entry.kind, entry.offerStatus]), [[job.id, "OFFER", "ALREADY_TAKEN"]]);
    const serialized = JSON.stringify(entries);
    for (const privateValue of [winnerId, "Synthetic Client", "private-guest", "private-manager-note", "clientPrice", "cleanerPayout"]) {
      assert.ok(!serialized.includes(privateValue), `loser must not see ${privateValue}`);
    }
    await assertFails(cleanerDb(loserUid).doc(`${root}/cleanerAgenda/${winnerId}__${job.id}`).get());
    await assertFails(cleanerDb(loserUid).doc(`${job.path}/offers/${winnerId}`).get());
  }
  assert.equal((await events.get()).size, 1);
  await rescheduleJob.run(managerRequest({ jobId: job.id, scheduledDate: dateKey(4), scheduledStart: "13:00" }));
  await sync(job.id);
  const assigned = (await agendaFor(winnerId)).find((entry) => entry.kind === "ASSIGNED");
  assert.deepEqual([assigned.scheduledDate, assigned.scheduledStart], [dateKey(4), "13:00"]);
  for (const [id] of losers) {
    const [lost] = await agendaFor(id);
    assert.deepEqual([lost.offerStatus, lost.scheduledDate, lost.scheduledStart], ["ALREADY_TAKEN", dateKey(3), "10:30"]);
    assert.equal(lost.jobStatus, "OFFERED");
  }

  await createChecklistRun.run(managerRequest({ jobId: job.id }));
  assert.equal((await openMyChecklist.run(cleanerRequest(winnerUid, { jobId: job.id }))).state, "ready");
  for (const [, uid] of losers) {
    assert.equal((await openMyChecklist.run(cleanerRequest(uid, { jobId: job.id }))).state, "unavailable");
  }
});

test("three simultaneous acceptances fill exactly two versioned slots and retries keep the same assignments", async () => {
  await createJob("auto-two-slots-race", { requiredCleanerCount: 2 });
  const job = jobDocument("auto-two-slots-race");
  await createAutomaticJobOffers.run(managerRequest({ jobId: job.id, cleanerIds: automaticCleaners.map(([id]) => id) }));
  for (const [cleanerId] of automaticCleaners) await link(cleanerId);

  const results = await Promise.all(automaticCleaners.map(([, uid]) => accept(job.id, uid)));
  assert.deepEqual(results.map(({ state }) => state).sort(), ["already-taken", "assigned", "assigned"]);
  const winners = automaticCleaners.filter((_, index) => results[index].state === "assigned");
  const [loserId, loserUid] = automaticCleaners.find((_, index) => results[index].state === "already-taken");
  const committedJob = (await job.get()).data();
  assert.equal(committedJob.operationalStatus, "ASSIGNED");
  assert.deepEqual([...committedJob.assignedCleanerIds].sort(), winners.map(([id]) => id).sort());
  assert.equal(committedJob.checklistContextRevision, 2);
  assert.deepEqual(committedJob.automaticOfferBatch, {
    version: 2, capacity: 2, openingContextRevision: 0, currentContextRevision: 2,
  });
  assert.ok(committedJob.offerDistributionClosedAt);
  assert.equal(committedJob.firstAcceptClaim, undefined);
  assert.equal(committedJob.cleanerPayout, 150);

  const committedAssignments = await assignmentsFor(job);
  assert.equal(committedAssignments.length, 2);
  for (const [cleanerId, uid] of winners) {
    const offer = (await job.collection("offers").doc(cleanerId).get()).data();
    assert.equal(offer.status, "ACCEPTED");
    const assignment = (await job.collection("assignments").doc(offer.acceptedAssignmentId).get()).data();
    assert.deepEqual([assignment.cleanerId, assignment.assignmentMethod, assignment.sourceOfferId, assignment.isActive],
      [cleanerId, autoMode, cleanerId, true]);
    assert.deepEqual(await accept(job.id, uid), { state: "assigned", status: "ACCEPTED" });
  }
  assert.deepEqual(await accept(job.id, loserUid), { state: "already-taken", status: null });
  assert.equal((await job.collection("offers").doc(loserId).get()).data().status, "PENDING");
  assert.deepEqual(await assignmentsFor(job), committedAssignments);
  assert.deepEqual((await job.get()).data(), committedJob);
  assert.equal((await admin.collection(`${root}/payouts`).get()).size, 0);

  await sync(job.id);
  const loserAgenda = await assertSucceeds(cleanerDb(loserUid).collection(`${root}/cleanerAgenda`).where("cleanerId", "==", loserId).get());
  assert.deepEqual(loserAgenda.docs.map((snapshot) => [snapshot.get("kind"), snapshot.get("offerStatus")]), [["OFFER", "ALREADY_TAKEN"]]);
  for (const [winnerId, winnerUid] of winners) {
    const assigned = (await agendaFor(winnerId)).filter(({ jobId, kind }) => jobId === job.id && kind === "ASSIGNED");
    assert.equal(assigned.length, 1);
    assert.deepEqual([assigned[0].acknowledged, assigned[0].offeredCompensation], [true, null]);
    assert.ok(!JSON.stringify(loserAgenda.docs[0].data()).includes(winnerId));
    await assertFails(cleanerDb(loserUid).doc(`${root}/cleanerAgenda/${winnerId}__${job.id}`).get());
    await assertFails(cleanerDb(loserUid).doc(`${job.path}/offers/${winnerId}`).get());
    await assertFails(cleanerDb(winnerUid).doc(job.path).get());
  }
});

test("a partial versioned batch keeps active invitations private and allows only their authorized reset or revoke", async () => {
  await createJob("auto-two-slots-partial", { requiredCleanerCount: 2 });
  const job = jobDocument("auto-two-slots-partial");
  await createAutomaticJobOffers.run(managerRequest({ jobId: job.id, cleanerIds: automaticCleaners.map(([id]) => id) }));
  for (const [cleanerId] of automaticCleaners) await link(cleanerId);

  assert.equal((await accept(job.id, uidA)).state, "assigned");
  const partial = (await job.get()).data();
  assert.deepEqual([partial.assignedCleanerIds, partial.operationalStatus, partial.checklistContextRevision],
    [["cleaner-a"], "ASSIGNED", 1]);
  assert.equal(partial.offerDistributionClosedAt, undefined);
  await sync(job.id);
  const [pending] = await agendaFor("cleaner-b");
  assert.deepEqual([pending.kind, pending.offerStatus, pending.jobStatus, pending.offeredCompensation], ["OFFER", "PENDING", "OFFERED", null]);
  assert.doesNotMatch(JSON.stringify(pending), /cleaner-a|Ana Example|assignedCleanerIds|private-|clientPrice|cleanerPayout/);

  const db = environment.authenticatedContext("manager", managerRequest().auth.token).firestore();
  const offerPath = `${job.path}/offers/cleaner-b`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await assertFails(cleanerDb(uidB).doc(offerPath).update({ publicOfferTokenHash: tokenHash }));
  await assertFails(db.doc(offerPath).update({ publicOfferTokenHash: tokenHash, acceptedAssignmentId: "forged" }));
  await assertSucceeds(db.doc(offerPath).update({ publicOfferTokenHash: tokenHash }));
  const publicLink = await requestPublicOffer("GET", token);
  assert.equal(publicLink.code, 200);
  assert.deepEqual(publicLink.body, { offer: { offerDistributionMode: autoMode, preferredLanguage: "pt" } });
  const forwarded = await requestPublicOffer("POST", token, { status: "ACCEPTED" });
  assert.ok(forwarded.code >= 400);
  assert.deepEqual(await assignmentsFor(job).then((rows) => rows.map(({ cleanerId }) => cleanerId)), ["cleaner-a"]);

  await assertSucceeds(db.doc(offerPath).update({ status: "REVOKED", revokedAt: serverTimestamp() }));
  assert.equal((await accept(job.id, uidB)).state, "unavailable");
  assert.equal((await accept(job.id, uidC)).state, "assigned");
  assert.ok((await job.get()).get("offerDistributionClosedAt"));
  await assertFails(db.doc(offerPath).update({ status: "PENDING" }));
});

test("manager roster correction closes the batch and cannot remove another organization's assignment", async () => {
  const jobId = "auto-two-slots-correction";
  await createJob(jobId, { requiredCleanerCount: 2 });
  const job = jobDocument(jobId);
  await createAutomaticJobOffers.run(managerRequest({ jobId, cleanerIds: automaticCleaners.map(([id]) => id) }));
  for (const [cleanerId] of automaticCleaners) await link(cleanerId);
  assert.equal((await accept(jobId, uidA)).state, "assigned");
  assert.equal((await accept(jobId, uidB)).state, "assigned");
  const closedAt = (await job.get()).get("offerDistributionClosedAt");
  const assignments = job.collection("assignments");
  const [[a], [b]] = await Promise.all(["cleaner-a", "cleaner-b"].map(async (cleanerId) =>
    (await assignments.where("cleanerId", "==", cleanerId).get()).docs));
  const removal = { jobId, assignmentId: a.id };
  const offers = async () => (await job.collection("offers").get()).docs.map((snapshot) => snapshot.data());
  const originalOffers = await offers();
  const db = environment.authenticatedContext("manager", managerRequest().auth.token).firestore();
  await assertFails(db.doc(a.ref.path).update({ isActive: false, removedAt: serverTimestamp(), removedByUid: "manager" }));
  await assert.rejects(removeAutomaticCleanerAssignment.run(cleanerRequest(uidA, removal)), { code: "permission-denied" });
  await assert.rejects(removeAutomaticCleanerAssignment.run({
    auth: { uid: "other-manager", token: { firebase: { sign_in_provider: "password" } } }, data: removal,
  }), { code: "permission-denied" });

  const corrected = await removeAutomaticCleanerAssignment.run(managerRequest(removal));
  assert.deepEqual(corrected, {
    jobId, assignmentId: a.id, assignedCleanerIds: ["cleaner-b"], operationalStatus: "ASSIGNED", checklistContextRevision: 3,
  });
  const removed = (await a.ref.get()).data();
  assert.equal(removed.isActive, false);
  assert.equal(removed.removedByUid, "manager");
  assert.ok(removed.removedAt);
  assert.equal((await b.ref.get()).get("isActive"), true);
  assert.ok((await job.get()).get("offerDistributionClosedAt").isEqual(closedAt));
  assert.deepEqual(await offers(), originalOffers);
  assert.equal((await accept(jobId, uidC)).state, "already-taken");
  assert.equal((await accept(jobId, uidB)).state, "assigned");
  await assert.rejects(removeAutomaticCleanerAssignment.run(managerRequest(removal)), { code: "failed-precondition" });

  await removeAutomaticCleanerAssignment.run(managerRequest({ jobId, assignmentId: b.id }));
  const empty = (await job.get()).data();
  assert.deepEqual([empty.operationalStatus, empty.assignedCleanerIds, empty.checklistContextRevision], ["UNASSIGNED", [], 4]);
  assert.ok(empty.offerDistributionClosedAt.isEqual(closedAt));
  assert.deepEqual(await offers(), originalOffers);
  assert.equal((await accept(jobId, uidC)).state, "already-taken");
});

test("manager roster correction preserves a saved Checklist while Job status is still assigned", async () => {
  const jobId = "auto-two-slots-checklist-started";
  await createJob(jobId, { requiredCleanerCount: 2 });
  const job = jobDocument(jobId);
  await createAutomaticJobOffers.run(managerRequest({ jobId, cleanerIds: ["cleaner-a", "cleaner-b"] }));
  await link("cleaner-a");
  assert.equal((await accept(jobId, uidA)).state, "assigned");
  await createChecklistRun.run(managerRequest({ jobId }));
  const run = job.collection("checklistRuns").doc("initial");
  const itemId = (await run.get()).get("resolvedDefinition.sections")[0].items[0].id;
  const draft = run.collection("drafts").doc("current");
  await draft.set({ revision: 1, checklistAnswers: { [itemId]: "DONE" } }, { merge: true });
  const [active] = (await job.collection("assignments").where("isActive", "==", true).get()).docs;
  const beforeJob = (await job.get()).data();
  const beforeDraft = (await draft.get()).data();
  assert.equal(beforeJob.operationalStatus, "ASSIGNED");
  await assert.rejects(removeAutomaticCleanerAssignment.run(managerRequest({ jobId, assignmentId: active.id })),
    { code: "failed-precondition" });
  assert.deepEqual((await job.get()).data(), beforeJob);
  assert.deepEqual((await draft.get()).data(), beforeDraft);
  assert.deepEqual((await active.ref.get()).data(), active.data());
});

test("an open v2 batch retains pending offers on its rescheduled date", async () => {
  await createJob("auto-two-slots-reschedule", { requiredCleanerCount: 2 });
  const job = jobDocument("auto-two-slots-reschedule");
  await createAutomaticJobOffers.run(managerRequest({ jobId: job.id, cleanerIds: ["cleaner-a", "cleaner-b"] }));
  await link("cleaner-a");
  await link("cleaner-b");
  assert.equal((await accept(job.id, uidA)).state, "assigned");
  const invitation = job.collection("offers").doc("cleaner-b");
  const original = (await invitation.get()).data();

  await rescheduleJob.run(managerRequest({ jobId: job.id, scheduledDate: dateKey(4), scheduledStart: "13:00" }));
  const partial = (await job.get()).data();
  assert.deepEqual(partial.assignedCleanerIds, ["cleaner-a"]);
  assert.equal(partial.offerDistributionClosedAt, undefined);
  await sync(job.id);
  const [kept] = (await agendaFor("cleaner-a")).filter(({ kind }) => kind === "ASSIGNED");
  assert.deepEqual([kept.scheduledDate, kept.scheduledStart], [dateKey(4), "13:00"]);
  const [pending] = (await agendaFor("cleaner-b")).filter(({ kind }) => kind === "OFFER");
  assert.deepEqual([pending.offerStatus, pending.scheduledDate, pending.scheduledStart], ["PENDING", dateKey(4), "13:00"]);
  assert.doesNotMatch(JSON.stringify(pending), /cleaner-a|Ana Example|assignedCleanerIds|private-|clientPrice|cleanerPayout/);
  const invite = (await invitation.get()).data();
  assert.equal(invite.status, "PENDING");
  assert.ok(invite.createdAt.isEqual(original.createdAt));
  assert.ok(invite.publicOfferExpiresAt.isEqual(original.publicOfferExpiresAt));
  assert.equal(invite.offeredChecklistContextRevision, original.offeredChecklistContextRevision);

  const db = environment.authenticatedContext("manager", managerRequest().auth.token).firestore();
  await assertSucceeds(db.doc(invitation.path).update({ publicOfferTokenHash: "f".repeat(64) }));
  assert.equal((await accept(job.id, uidB, { scheduleRevision: 0 })).state, "stale-schedule");
  assert.equal((await accept(job.id, uidB, { scheduleRevision: 1 })).state, "assigned");
  const filled = (await job.get()).data();
  assert.deepEqual(filled.assignedCleanerIds, ["cleaner-a", "cleaner-b"]);
  assert.ok(filled.offerDistributionClosedAt);
});

test("automatic acceptance and a simultaneous manual assignment contend for the same slot", async () => {
  await link("cleaner-a");
  const job = await createAutomaticJob("auto-manager-race");
  await createAutomaticOffer(job.id, "cleaner-a");
  const [automatic, manual] = await Promise.allSettled([
    accept(job.id, uidA),
    assignCleanerDirectly.run(managerRequest({ jobId: job.id, cleanerId: "cleaner-b" })),
  ]);
  assert.equal(automatic.status, "fulfilled");
  const assignments = await assignmentsFor(job);
  assert.equal(assignments.length, 1);
  const winner = assignments[0].cleanerId;
  assert.deepEqual((await job.get()).data().assignedCleanerIds, [winner]);
  if (winner === "cleaner-a") {
    assert.equal(automatic.value.state, "assigned");
    assert.equal(manual.status, "rejected");
    assert.equal(manual.reason.code, "failed-precondition");
  } else {
    assert.equal(winner, "cleaner-b");
    assert.equal(manual.status, "fulfilled");
    assert.equal(automatic.value.state, "already-taken");
  }
});

test("automatic acceptance denies invalid sessions, cross-organization identities, and uninvited cleaners", async () => {
  const job = await createAutomaticJob("auto-identity");
  await createAutomaticOffer(job.id, "cleaner-a");
  await link("cleaner-a");
  await link("cleaner-b");
  const claims = hubClaimsByUid.get(uidA);
  await assert.rejects(respondToMyOffer.run({ data: { jobId: job.id, status: "ACCEPTED" } }), { code: "unauthenticated" });
  await assert.rejects(accept(job.id, uidA, {}, { ...claims, organizationId: "other-org" }), { code: "permission-denied" });
  await assert.rejects(accept(job.id, uidA, {}, { ...claims, cleanerId: "cleaner-b" }), { code: "permission-denied" });
  assert.equal((await accept(job.id, uidB, { cleanerId: "cleaner-a", organizationId: org })).state, "unavailable");

  await revokeCleanerHubAccess.run(managerRequest({ cleanerId: "cleaner-a" }));
  await assert.rejects(accept(job.id, uidA, {}, claims), { code: "permission-denied" });
  await link("cleaner-a");
  await admin.doc(`${root}/cleaners/cleaner-a`).update({ active: false });
  await assert.rejects(accept(job.id, uidA), { code: "permission-denied" });
  assert.deepEqual(await assignmentsFor(job), []);
});

test("automatic acceptance leaves expired, revoked, cancelled, already assigned, and in-progress Jobs untouched", async () => {
  await link("cleaner-a");
  const cases = [
    ["expired", "expired", {}, { publicOfferExpiresAt: Timestamp.fromMillis(Date.now() - 5000) }],
    ["revoked", "unavailable", {}, { status: "REVOKED", revokedAt: Timestamp.now() }],
    ["declined", "answered", {}, { status: "DECLINED" }],
    ["archived", "unavailable", { archivedAt: Timestamp.now() }],
    ["cancelled", "unavailable", { operationalStatus: "CANCELLED" }],
    ["in-progress", "unavailable", { operationalStatus: "IN_PROGRESS" }],
    ["completed", "unavailable", { operationalStatus: "COMPLETED" }],
    ["assigned", "already-taken", { operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-b"] }],
    ["legacy-roster", "unavailable", { assignedCleanerId: "cleaner-b" }],
    ["multi-roster", "unavailable", { assignedCleanerIds: ["cleaner-b", "cleaner-c"] }],
    ["multiple-slots", "unavailable", { requiredCleanerCount: 2 }],
    ["revised", "unavailable", { checklistContextRevision: 1 }],
    ["wrong-offer-mode", "unavailable", {}, { offerDistributionMode: null }],
  ];
  for (const [name, state, jobData, offerData] of cases) {
    const job = await createAutomaticJob(`auto-${name}`, jobData);
    await createAutomaticOffer(job.id, "cleaner-a", offerData);
    const before = (await job.get()).data();
    assert.deepEqual(await accept(job.id, uidA), { state, status: state === "answered" ? "DECLINED" : null }, name);
    assert.deepEqual(await assignmentsFor(job), [], name);
    assert.deepEqual((await job.get()).data(), before, name);
  }
});

test("a forwarded public link cannot assign, record legacy interest, or confirm an automatic assignment", async () => {
  await link("cleaner-a");
  await link("cleaner-b");
  const job = await createAutomaticJob("auto-public-link");
  const linkA = await createAutomaticOffer(job.id, "cleaner-a");
  const linkB = await createAutomaticOffer(job.id, "cleaner-b");
  const open = await requestPublicOffer("GET", linkA.token);
  assert.equal(open.code, 200);
  assert.deepEqual(open.body, { offer: { offerDistributionMode: autoMode, preferredLanguage: "pt" } });
  for (const data of [{ status: "ACCEPTED" }, { status: "INTERESTED" }, { action: "ACKNOWLEDGE_ASSIGNMENT" }]) {
    const response = await requestPublicOffer("POST", linkA.token, data);
    assert.ok(response.code >= 400);
  }
  assert.equal((await linkA.offer.get()).data().status, "PENDING");
  assert.deepEqual(await assignmentsFor(job), []);
  assert.equal((await accept(job.id, uidA)).state, "assigned");
  const lost = await requestPublicOffer("GET", linkB.token);
  assert.equal(lost.code, 410);
  assert.deepEqual(lost.body, { error: "offer_already_taken" });
  const confirmation = await requestPublicOffer("POST", linkA.token, { action: "ACKNOWLEDGE_ASSIGNMENT" });
  assert.ok(confirmation.code >= 400);
  assert.equal((await assignmentsFor(job)).length, 1);
});


test("the manager explicitly opts in once; a browser cannot forge automatic responses, mode, or assignment", async () => {
  await createJob("auto-opt-in");
  await link("cleaner-a");
  const job = jobDocument("auto-opt-in");
  const payload = { jobId: job.id, cleanerIds: ["cleaner-a", "cleaner-b"] };
  await assert.rejects(createAutomaticJobOffers.run(cleanerRequest(uidA, payload)), { code: "permission-denied" });
  const managerDb = environment.authenticatedContext("manager", { firebase: { sign_in_provider: "password" } }).firestore();
  const browserJob = managerDb.doc(job.path);
  await assertFails(browserJob.update({ offerDistributionMode: autoMode }));
  await createAutomaticJobOffers.run(managerRequest(payload));
  const offerPath = `${job.path}/offers/cleaner-a`;
  const offer = (await admin.doc(offerPath).get()).data();
  assert.equal(offer.status, "PENDING");
  assert.equal(offer.offerDistributionMode, autoMode);
  assert.equal(offer.offeredChecklistContextRevision, 0);
  assert.ok(offer.publicOfferExpiresAt.toMillis() > Date.now());
  assert.deepEqual([(await job.get()).data().offerDistributionMode, (await job.get()).data().operationalStatus], [autoMode, "OFFERED"]);
  await assert.rejects(createAutomaticJobOffers.run(managerRequest(payload)), { code: "failed-precondition" });

  await assertFails(browserJob.update({ offerDistributionMode: "MANUAL" }));
  await assertFails(browserJob.update({ firstAcceptClaim: { cleanerId: "cleaner-a" } }));
  await assertFails(browserJob.update({ assignedCleanerIds: ["cleaner-a"], operationalStatus: "ASSIGNED", checklistContextRevision: 1 }));
  await assertFails(managerDb.doc(offerPath).update({ status: "ACCEPTED", respondedAt: new Date() }));
  await assertFails(managerDb.doc(offerPath).update({ status: "INTERESTED", respondedAt: new Date() }));
  await assertFails(managerDb.doc(`${job.path}/offers/cleaner-c`).set({ jobId: job.id, cleanerId: "cleaner-c", status: "PENDING" }));
  await assertFails(cleanerDb(uidA).doc(offerPath).update({ status: "ACCEPTED" }));
  await assertFails(cleanerDb(uidA).doc(job.path).update({ assignedCleanerIds: ["cleaner-a"] }));

  // The same authorized revocation write made by the manager browser.
  await assertSucceeds(managerDb.doc(offerPath).update({ status: "REVOKED", revokedAt: serverTimestamp() }));
  assert.equal((await accept(job.id, uidA)).state, "unavailable");
  assert.deepEqual(await assignmentsFor(job), []);
});

test("browser Job and Offer writes cannot forge or remove versioned automatic provenance", async () => {
  const db = environment.authenticatedContext("manager", managerRequest().auth.token).firestore();
  const batch = { version: 2, capacity: 2, openingContextRevision: 0, currentContextRevision: 0 };
  const lastAcceptance = { cleanerId: "cleaner-a", assignmentId: "forged" };
  for (const fields of [{ automaticOfferBatch: batch }, { lastAutomaticOfferAcceptance: lastAcceptance }]) {
    await assertFails(db.doc(`${root}/jobs/forged-new`).set({
      organizationId: org, schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [], ...fields,
    }));
  }

  await createJob("manual-provenance");
  const manual = db.doc(`${root}/jobs/manual-provenance`);
  await assertFails(manual.update({ automaticOfferBatch: batch }));
  await assertFails(manual.update({ lastAutomaticOfferAcceptance: lastAcceptance }));
  for (const fields of [{ automaticOfferBatchVersion: 2 }, { acceptedAssignmentId: "forged" }]) {
    await assertFails(manual.collection("offers").doc("forged").set({
      jobId: manual.id, cleanerId: "cleaner-a", status: "PENDING", ...fields,
    }));
  }
  const ordinaryOffer = manual.collection("offers").doc("ordinary");
  await assertSucceeds(ordinaryOffer.set({ jobId: manual.id, cleanerId: "cleaner-a", status: "PENDING" }));
  await assertFails(ordinaryOffer.update({ automaticOfferBatchVersion: 2 }));
  await assertFails(ordinaryOffer.update({ acceptedAssignmentId: "forged" }));

  await createJob("automatic-provenance", { requiredCleanerCount: 2 });
  await createAutomaticJobOffers.run(managerRequest({ jobId: "automatic-provenance", cleanerIds: ["cleaner-a", "cleaner-b"] }));
  await link("cleaner-a");
  assert.equal((await accept("automatic-provenance", uidA)).state, "assigned");
  const automatic = db.doc(`${root}/jobs/automatic-provenance`);
  await assertFails(automatic.update({ "automaticOfferBatch.capacity": 3 }));
  await assertFails(automatic.update({ automaticOfferBatch: null }));
  await assertFails(automatic.update({ lastAutomaticOfferAcceptance: null }));
});

async function rescheduleWithInbox(job, day, scheduledStart) {
  const triggerRef = functionDatabase.doc(job.path);
  const before = await triggerRef.get();
  const scheduledDate = dateKey(day);
  const result = await rescheduleJob.run(managerRequest({ jobId: job.id, scheduledDate, scheduledStart }));
  const after = await triggerRef.get();
  const delivery = {
    organizationId: org, jobId: job.id, before, after, eventId: `${job.id}-revision-${result.scheduleRevision}`,
  };
  const people = after.get("schemaVersion") === 2
    ? after.get("assignedCleanerIds") : [after.get("assignedCleanerId")].filter(Boolean);
  assert.equal(await recordCleanerJobInboxEvents(functionDatabase, delivery), people.length);
  assert.equal(await recordCleanerJobInboxEvents(functionDatabase, delivery), 0);
  return { ...result, scheduledDate, scheduledStart };
}

async function reschedulePrompt(uid, scheduleRevision) {
  const { items } = await listNotificationInbox.run(cleanerRequest(uid, { role: "CLEANER" }));
  const item = items.find(({ type, reschedule }) => type === "RESCHEDULED" && reschedule?.scheduleRevision === scheduleRevision);
  assert.ok(item, "assigned cleaner sees the current reschedule prompt in her Inbox");
  return item;
}

function answerReschedule(uid, eventId, scheduleRevision, decision, claims) {
  return respondToMyReschedule.run(cleanerRequest(uid, { eventId, scheduleRevision, decision }, claims));
}

test("reschedule confirmation is private and one final response belongs to each active assignment", async () => {
  const job = jobDocument("reschedule-own-confirmation");
  await createJob(job.id, { requiredCleanerCount: 2 });
  for (const [cleanerId] of automaticCleaners) await link(cleanerId);
  for (const cleanerId of ["cleaner-a", "cleaner-b"]) {
    await assignCleanerDirectly.run(managerRequest({ jobId: job.id, cleanerId }));
  }
  const moved = await rescheduleWithInbox(job, 4, "12:15");
  const [promptA, promptB] = await Promise.all([
    reschedulePrompt(uidA, moved.scheduleRevision), reschedulePrompt(uidB, moved.scheduleRevision),
  ]);
  assert.notEqual(promptA.id, promptB.id);
  for (const prompt of [promptA, promptB]) {
    assert.deepEqual(prompt.reschedule, {
      state: "PENDING", scheduleRevision: moved.scheduleRevision, scheduledDate: moved.scheduledDate, scheduledStart: "12:15",
    });
    assert.doesNotMatch(JSON.stringify(prompt), /private-|clientPrice|cleanerPayout|assignmentId|byCleaner|cleaner-[abc]/);
  }
  assert.equal((await listNotificationInbox.run(cleanerRequest(uidC, { role: "CLEANER" }))).items.length, 0);
  const before = (await job.get()).data();
  const payload = { eventId: promptA.id, scheduleRevision: moved.scheduleRevision, decision: "CONFIRMED" };
  await assert.rejects(respondToMyReschedule.run({ data: payload }), { code: "unauthenticated" });
  await assert.rejects(respondToMyReschedule.run(managerRequest(payload)), { code: "permission-denied" });
  await assert.rejects(respondToMyReschedule.run(cleanerRequest(uidB, payload)), { code: "permission-denied" });
  await assert.rejects(respondToMyReschedule.run(cleanerRequest(uidC, payload)), { code: "permission-denied" });
  await assert.rejects(respondToMyReschedule.run(cleanerRequest(uidA, payload, {
    ...hubClaimsByUid.get(uidA), organizationId: "other-org",
  })), { code: "permission-denied" });
  assert.deepEqual((await job.get()).data(), before);
  const managerDb = environment.authenticatedContext("manager", managerRequest().auth.token).firestore();
  await assertFails(managerDb.doc(job.path).update({ "scheduleConfirmation.byCleaner.cleaner-a.state": "CONFIRMED" }));
  await assertFails(cleanerDb(uidA).doc(job.path).update({ "scheduleConfirmation.byCleaner.cleaner-a.state": "CONFIRMED" }));

  const outcome = { state: "CONFIRMED", scheduleRevision: moved.scheduleRevision };
  const answer = (decision) => answerReschedule(uidA, promptA.id, moved.scheduleRevision, decision);
  assert.deepEqual(await Promise.all([answer("CONFIRMED"), answer("CONFIRMED")]), [outcome, outcome]);
  const committed = (await job.get()).data();
  const audit = job.collection("scheduleHistory").doc(String(moved.scheduleRevision)).collection("responses");
  const [record] = (await audit.get()).docs;
  assert.equal(record.id, "cleaner-a");
  assert.deepEqual([record.get("state"), record.get("actorUid"), record.get("scheduleRevision")],
    ["CONFIRMED", uidA, moved.scheduleRevision]);
  assert.ok(record.get("respondedAt"));
  assert.deepEqual(await answer("DECLINED"), outcome);
  assert.deepEqual((await job.get()).data(), committed);
  const replay = (await audit.get()).docs;
  assert.equal(replay.length, 1);
  assert.deepEqual(replay[0].data(), record.data());
  assert.equal(committed.scheduleConfirmation.byCleaner["cleaner-a"].state, "CONFIRMED");
  assert.equal(committed.scheduleConfirmation.byCleaner["cleaner-b"].state, "PENDING");
  assert.deepEqual(committed.assignedCleanerIds, ["cleaner-a", "cleaner-b"]);
  assert.equal((await reschedulePrompt(uidA, moved.scheduleRevision)).reschedule.state, "CONFIRMED");

  const claimsB = hubClaimsByUid.get(uidB);
  await revokeCleanerHubAccess.run(managerRequest({ cleanerId: "cleaner-b" }));
  await assert.rejects(answerReschedule(uidB, promptB.id, moved.scheduleRevision, "CONFIRMED", claimsB), { code: "permission-denied" });
  assert.equal((await audit.get()).size, 1);
});

test("reschedule decline removes only that assignment, audits once, and keeps a filled batch closed", async () => {
  const job = jobDocument("reschedule-decline-one");
  await createJob(job.id, { requiredCleanerCount: 2 });
  for (const [cleanerId] of automaticCleaners) await link(cleanerId);
  await createAutomaticJobOffers.run(managerRequest({ jobId: job.id, cleanerIds: ["cleaner-a", "cleaner-b", "cleaner-c"] }));
  assert.equal((await accept(job.id, uidA)).state, "assigned");
  assert.equal((await accept(job.id, uidB)).state, "assigned");
  const closedAt = (await job.get()).get("offerDistributionClosedAt");
  const originalOffers = (await job.collection("offers").get()).docs.map((doc) => doc.data());
  const moved = await rescheduleWithInbox(job, 5, "09:45");
  const prompt = await reschedulePrompt(uidA, moved.scheduleRevision);
  const before = (await job.get()).data();
  const assignmentId = before.scheduleConfirmation.byCleaner["cleaner-a"].assignmentId;
  assert.ok(assignmentId);
  const result = { state: "DECLINED", scheduleRevision: moved.scheduleRevision };
  const answer = () => answerReschedule(uidA, prompt.id, moved.scheduleRevision, "DECLINED");
  assert.deepEqual(await Promise.all([answer(), answer()]), [result, result]);

  const after = (await job.get()).data();
  assert.deepEqual([after.assignedCleanerIds, after.operationalStatus, after.checklistContextRevision],
    [["cleaner-b"], "ASSIGNED", before.checklistContextRevision + 1]);
  assert.ok(after.offerDistributionClosedAt.isEqual(closedAt));
  assert.equal(after.scheduleConfirmation.byCleaner["cleaner-a"].state, "DECLINED");
  assert.equal(after.scheduleConfirmation.byCleaner["cleaner-b"].state, "PENDING");
  const assignment = (await job.collection("assignments").doc(assignmentId).get()).data();
  assert.deepEqual([
    assignment.cleanerId, assignment.isActive, assignment.removedByUid, assignment.removalReason, assignment.removalScheduleRevision,
  ], ["cleaner-a", false, uidA, "RESCHEDULE_DECLINED", moved.scheduleRevision]);
  assert.ok(assignment.removedAt);
  assert.equal((await job.collection("assignments").where("isActive", "==", true).get()).size, 1);
  const audit = job.collection("scheduleHistory").doc(String(moved.scheduleRevision)).collection("responses");
  assert.equal((await audit.get()).size, 1);
  const record = (await audit.doc("cleaner-a").get()).data();
  assert.deepEqual([record.state, record.actorUid, record.assignmentId], ["DECLINED", uidA, assignmentId]);
  assert.ok(record.respondedAt);
  assert.deepEqual((await job.collection("offers").get()).docs.map((doc) => doc.data()), originalOffers);
  assert.equal((await accept(job.id, uidC, { scheduleRevision: moved.scheduleRevision })).state, "already-taken");
  assert.equal((await job.collection("managerNotificationDeliveries").where("eventType", "==", "RESCHEDULE_DECLINED").get()).size, 1);
  const manager = await listNotificationInbox.run(managerRequest({ role: "MANAGER" }));
  assert.equal(manager.items.filter((item) => item.type === "RESCHEDULE_DECLINED").length, 1);
  assert.equal((await reschedulePrompt(uidB, moved.scheduleRevision)).reschedule.state, "PENDING");
  const former = (await listNotificationInbox.run(cleanerRequest(uidA, { role: "CLEANER" }))).items.find(({ id }) => id === prompt.id);
  assert.equal(former.openable, false);
  assert.equal(former.serviceLabel, null);
});

test("a previous invitee can privately express interest in a new manual replacement without reopening the automatic batch", async () => {
  const job = jobDocument("reschedule-replacement-interest");
  await createJob(job.id, { requiredCleanerCount: 2 });
  for (const [cleanerId] of automaticCleaners) await link(cleanerId);
  await createAutomaticJobOffers.run(managerRequest({ jobId: job.id, cleanerIds: ["cleaner-a", "cleaner-b", "cleaner-c"] }));
  assert.equal((await accept(job.id, uidA)).state, "assigned");
  assert.equal((await accept(job.id, uidB)).state, "assigned");
  const originalOffer = job.collection("offers").doc("cleaner-c");
  const original = (await originalOffer.get()).data();
  const closedAt = (await job.get()).get("offerDistributionClosedAt");
  const moved = await rescheduleWithInbox(job, 5, "10:45");
  const prompt = await reschedulePrompt(uidA, moved.scheduleRevision);
  await answerReschedule(uidA, prompt.id, moved.scheduleRevision, "DECLINED");

  const payload = { jobId: job.id, cleanerId: "cleaner-c", scheduleRevision: moved.scheduleRevision };
  await assert.rejects(createManualReplacementOffer.run(cleanerRequest(uidC, payload)), { code: "permission-denied" });
  const request = () => createManualReplacementOffer.run(managerRequest(payload));
  const [created, repeated] = await Promise.all([request(), request()]);
  assert.match(created.offerId, /^replacement-[A-Za-z0-9]{20}$/);
  assert.deepEqual(repeated, created);
  const ref = job.collection("offers").doc(created.offerId);
  const raw = (await ref.get()).data();
  assert.deepEqual([raw.offerKind, raw.cleanerId, raw.status, raw.scheduleRevision, raw.publicOfferTokenHash],
    ["MANUAL_REPLACEMENT", "cleaner-c", "PENDING", moved.scheduleRevision, undefined]);
  assert.deepEqual((await originalOffer.get()).data(), original);
  const managerDb = environment.authenticatedContext("manager", managerRequest().auth.token).firestore();
  await assertFails(managerDb.doc(ref.path).update({ publicOfferTokenHash: "e".repeat(64) }));
  await assertFails(cleanerDb(uidC).doc(ref.path).get());

  await sync(job.id);
  const targetAgenda = await assertSucceeds(cleanerDb(uidC).doc(`${root}/cleanerAgenda/cleaner-c__${job.id}`).get());
  assert.deepEqual([targetAgenda.get("replacementOfferId"), targetAgenda.get("scheduledDate"), targetAgenda.get("scheduledStart")],
    [created.offerId, moved.scheduledDate, "10:45"]);
  await assertFails(cleanerDb(uidB).doc(targetAgenda.ref.path).get());
  const jobBeforeInterest = (await job.get()).data();
  const options = { offerId: created.offerId, scheduleRevision: moved.scheduleRevision };
  assert.equal((await accept(job.id, uidA, options)).state, "unavailable");
  assert.equal((await accept(job.id, uidC, options)).state, "unavailable");
  assert.equal((await accept(job.id, uidC, { scheduleRevision: moved.scheduleRevision })).state, "already-taken");
  const interest = (revision) => respondToMyOffer.run(cleanerRequest(uidC, {
    jobId: job.id, status: "INTERESTED", offerId: created.offerId, scheduleRevision: revision,
  }));
  assert.deepEqual(await interest(0), { state: "stale-schedule", status: null });
  const assign = () => assignCleanerDirectly.run(managerRequest({
    jobId: job.id, cleanerId: "cleaner-c", replacementOfferId: created.offerId,
  }));
  await assert.rejects(assign(), (error) => error.details?.reason === "replacement-unavailable");
  assert.deepEqual(await interest(moved.scheduleRevision), { state: "answered", status: "INTERESTED" });
  assert.deepEqual((await job.get()).data(), jobBeforeInterest);

  const assigned = await assign();
  assert.deepEqual(assigned.assignedCleanerIds, ["cleaner-b", "cleaner-c"]);
  const restored = (await job.get()).data();
  assert.deepEqual(restored.assignedCleanerIds, ["cleaner-b", "cleaner-c"]);
  assert.ok(restored.offerDistributionClosedAt.isEqual(closedAt));
  const assignment = (await job.collection("assignments").doc(assigned.assignmentId).get()).data();
  assert.deepEqual([assignment.cleanerId, assignment.sourceOfferId, assignment.replacementOfferId, assignment.isActive],
    ["cleaner-c", created.offerId, created.offerId, true]);
  const selected = (await ref.get()).data();
  assert.deepEqual([selected.status, selected.replacementAssignmentId], ["SELECTED", assigned.assignmentId]);
  assert.equal((await assign()).assignmentId, assigned.assignmentId);
  assert.deepEqual((await originalOffer.get()).data(), original);
  assert.equal((await accept(job.id, uidC, { scheduleRevision: moved.scheduleRevision })).state, "already-taken");
});

test("manual replacement waits for current automatic offers to become exhausted", async () => {
  const job = jobDocument("reschedule-replacement-exhaustion");
  await createJob(job.id, { requiredCleanerCount: 2 });
  for (const [cleanerId] of automaticCleaners) await link(cleanerId);
  await createAutomaticJobOffers.run(managerRequest({ jobId: job.id, cleanerIds: ["cleaner-a", "cleaner-b"] }));
  assert.equal((await accept(job.id, uidA)).state, "assigned");
  const moved = await rescheduleWithInbox(job, 4, "11:00");
  const prompt = await reschedulePrompt(uidA, moved.scheduleRevision);
  await answerReschedule(uidA, prompt.id, moved.scheduleRevision, "DECLINED");
  const original = job.collection("offers").doc("cleaner-b");
  const request = () => createManualReplacementOffer.run(managerRequest({
    jobId: job.id, cleanerId: "cleaner-c", scheduleRevision: moved.scheduleRevision,
  }));
  const before = (await job.get()).data();
  assert.equal(before.offerDistributionClosedAt, undefined);
  assert.deepEqual(before.assignedCleanerIds, []);
  await assert.rejects(request(), (error) => error.details?.reason === "automatic-offers-active");
  assert.deepEqual((await job.get()).data(), before);
  assert.equal((await job.collection("offers").get()).size, 2);

  assert.deepEqual(await respondToMyOffer.run(cleanerRequest(uidB, {
    jobId: job.id, status: "DECLINED", scheduleRevision: moved.scheduleRevision,
  })), { state: "answered", status: "DECLINED" });
  const answered = (await original.get()).data();
  const replacement = await request();
  assert.match(replacement.offerId, /^replacement-[A-Za-z0-9]{20}$/);
  assert.ok((await job.get()).get("offerDistributionClosedAt"));
  assert.deepEqual((await original.get()).data(), answered);
  assert.deepEqual((await job.get()).get("assignedCleanerIds"), []);
  assert.equal((await job.collection("offers").get()).size, 3);
});

test("a response racing a newer reschedule cannot settle the newer generation", async () => {
  const job = jobDocument("reschedule-stale-race");
  await createJob(job.id);
  await link("cleaner-a");
  await assignCleanerDirectly.run(managerRequest({ jobId: job.id, cleanerId: "cleaner-a" }));
  const prior = await rescheduleWithInbox(job, 4, "12:00");
  const oldPrompt = await reschedulePrompt(uidA, prior.scheduleRevision);
  const [reply, refreshed] = await Promise.allSettled([
    answerReschedule(uidA, oldPrompt.id, prior.scheduleRevision, "CONFIRMED"),
    rescheduleWithInbox(job, 5, "14:00"),
  ]);
  assert.equal(refreshed.status, "fulfilled");
  const current = refreshed.value;
  if (reply.status === "fulfilled") {
    assert.deepEqual(reply.value, { state: "CONFIRMED", scheduleRevision: prior.scheduleRevision });
  } else {
    assert.equal(reply.reason.details?.reason, "stale-schedule");
  }
  const read = (revision) => job.collection("scheduleHistory").doc(String(revision)).collection("responses").get();
  assert.equal((await read(prior.scheduleRevision)).size, Number(reply.status === "fulfilled"));
  assert.equal((await read(current.scheduleRevision)).size, 0);
  const currentPrompt = await reschedulePrompt(uidA, current.scheduleRevision);
  assert.equal(currentPrompt.reschedule.state, "PENDING");
  const stale = (error) => error.details?.reason === "stale-schedule";
  await assert.rejects(answerReschedule(uidA, oldPrompt.id, prior.scheduleRevision, "DECLINED"), stale);
  await assert.rejects(answerReschedule(uidA, oldPrompt.id, current.scheduleRevision, "DECLINED"), stale);
  await assert.rejects(answerReschedule(uidA, currentPrompt.id, prior.scheduleRevision, "DECLINED"), stale);
  assert.equal((await read(current.scheduleRevision)).size, 0);

  await job.update({ archivedAt: Timestamp.now() });
  await assert.rejects(answerReschedule(uidA, currentPrompt.id, current.scheduleRevision, "DECLINED"), stale);
  assert.equal((await read(current.scheduleRevision)).size, 0);
  assert.deepEqual((await job.get()).get("assignedCleanerIds"), ["cleaner-a"]);
});

test("a legacy singular cleaner can decline a reschedule and leave a manual invitation on the new date", async () => {
  const job = jobDocument("reschedule-legacy-manual");
  await createJob(job.id, { schemaVersion: 1, operationalStatus: "ASSIGNED" });
  await job.update({ assignedCleanerIds: FieldValue.delete(), assignedCleanerId: "cleaner-a", assignedCleanerName: "Ana Example" });
  await link("cleaner-a");
  await link("cleaner-b");
  const token = randomBytes(32).toString("base64url");
  const invitation = job.collection("offers").doc("cleaner-b");
  await invitation.set({
    organizationId: org, jobId: job.id, cleanerId: "cleaner-b", status: "PENDING", offeredCompensation: 145,
    publicOfferTokenHash: createHash("sha256").update(token).digest("hex"),
    publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
  });
  const before = (await invitation.get()).data();

  const moved = await rescheduleWithInbox(job, 4, "11:30");
  const prompt = await reschedulePrompt(uidA, moved.scheduleRevision);
  assert.deepEqual(await answerReschedule(uidA, prompt.id, moved.scheduleRevision, "DECLINED"),
    { state: "DECLINED", scheduleRevision: moved.scheduleRevision });
  const after = (await job.get()).data();
  assert.deepEqual([after.schemaVersion, after.operationalStatus, after.assignedCleanerId, after.assignedCleanerIds],
    [1, "OFFERED", undefined, undefined]);
  assert.deepEqual((await invitation.get()).data(), before);
  const receipt = await job.collection("scheduleHistory").doc(String(moved.scheduleRevision)).collection("responses").doc("cleaner-a").get();
  assert.deepEqual([receipt.get("state"), receipt.get("assignmentId")], ["DECLINED", null]);
  await sync(job.id);
  const [pending] = (await agendaFor("cleaner-b")).filter(({ kind }) => kind === "OFFER");
  assert.deepEqual([pending.scheduledDate, pending.scheduledStart, pending.offerStatus], [moved.scheduledDate, "11:30", "PENDING"]);
  const publicLink = await requestPublicOffer("GET", token);
  assert.equal(publicLink.code, 200);
  assert.equal(publicLink.body.offer.scheduledDate, moved.scheduledDate);
  assert.equal(publicLink.body.offer.scheduledStart, "11:30");
  assert.equal((await respondToMyOffer.run(cleanerRequest(uidB, {
    jobId: job.id, status: "INTERESTED", scheduleRevision: moved.scheduleRevision,
  }))).state, "answered");
  assert.equal((await job.get()).get("assignedCleanerId"), undefined);
});

test("rescheduling an unversioned automatic batch still invalidates its earlier invitation", async () => {
  const job = await createAutomaticJob("auto-rescheduled");
  await link("cleaner-a");
  const original = await createAutomaticOffer(job.id, "cleaner-a");
  await rescheduleJob.run(managerRequest({ jobId: job.id, scheduledDate: dateKey(4), scheduledStart: "13:00" }));
  assert.equal((await accept(job.id, uidA, { scheduleRevision: 1 })).state, "unavailable");
  assert.equal((await job.get()).data().scheduledStart, "13:00");
  assert.deepEqual(await assignmentsFor(job), []);
  assert.equal((await original.offer.get()).get("status"), "PENDING");
  assert.equal((await original.offer.get()).get("automaticOfferBatchVersion"), undefined);
});
