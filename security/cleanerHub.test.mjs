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
  issueChecklistCapability,
  issueCleanerAccessCode,
  listNotificationInbox,
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

test("three invited cleaners race for one automatic assignment with idempotent retry, isolated agenda, and checklist access", async () => {
  await createJob("auto-race");
  const job = jobDocument("auto-race");
  await createAutomaticJobOffers.run(managerRequest({ jobId: job.id, cleanerIds: automaticCleaners.map(([id]) => id) }));
  for (const [cleanerId] of automaticCleaners) await link(cleanerId);
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

test("rescheduling through the manager endpoint invalidates acceptance of the earlier schedule", async () => {
  await createJob("auto-rescheduled");
  await link("cleaner-a");
  const job = jobDocument("auto-rescheduled");
  await createAutomaticJobOffers.run(managerRequest({ jobId: job.id, cleanerIds: ["cleaner-a"] }));
  await rescheduleJob.run(managerRequest({ jobId: job.id, scheduledDate: dateKey(4), scheduledStart: "13:00" }));
  assert.equal((await accept(job.id, uidA)).state, "unavailable");
  assert.equal((await job.get()).data().scheduledStart, "13:00");
  assert.deepEqual(await assignmentsFor(job), []);
});
