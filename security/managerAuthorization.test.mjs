import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

// Fail before loading Admin SDK/handlers unless all access is explicitly local and disposable.
for (const [variable, expected] of Object.entries({
  GCLOUD_PROJECT: "demo-cleanflow",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
})) {
  assert.equal(process.env[variable], expected, `Security tests require local ${variable}`);
}

const { initializeApp } = await import("firebase-admin/app");
initializeApp({ projectId: "demo-cleanflow", storageBucket: "demo-cleanflow.appspot.com" });
const { FieldValue, getFirestore, Timestamp } = await import("firebase-admin/firestore");
const { serverTimestamp } = await import("firebase/firestore");
const {
  createChecklistRun,
  approveChecklistRun,
  getChecklistRun,
  getChecklistCapability,
  getChecklistEvidence,
  getClientReportCapability,
  createClientReport,
  revokeClientReport,
  issueChecklistCapability,
  revokeChecklistCapability,
  registerManagerPushDevice,
  submitFeedback,
  publicOffer,
  publicChecklist,
  publicClientReport,
} = await import("../functions/src/index.js");
const { authorizedManagerDevices } = await import("../functions/src/managerAuthorization.js");
const { createHash } = await import("node:crypto");
const admin = getFirestore();
const org = "cleanflow-demo";
const root = `organizations/${org}`;
const paths = ["clients/client", "properties/property", "cleaners/cleaner", "jobs/job",
  "jobs/job/offers/offer", "jobs/job/issues/issue", "payouts/payout"];
const assignmentPath = "jobs/job/assignments/assignment";
const proofPath = `${root}/payouts/payout/proof/payment-proof`;
let environment;

function account(uid, anonymous = false) {
  return environment.authenticatedContext(uid, { firebase: { sign_in_provider: anonymous ? "anonymous" : "password" } });
}

function request(uid, data = {}, anonymous = false) {
  return {
    auth: uid ? { uid, token: { firebase: { sign_in_provider: anonymous ? "anonymous" : "password" } } } : undefined,
    data,
  };
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-cleanflow",
    firestore: { host: "127.0.0.1", port: 8080, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: await readFile("storage.rules", "utf8") },
  });
});
after(async () => { await environment?.cleanup(); });

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  const batch = admin.batch();
  for (const path of [...paths, assignmentPath]) batch.set(admin.doc(`${root}/${path}`), { organizationId: org, fixture: true });
  for (const uid of ["manager", "anonymous-member"]) {
    batch.set(admin.doc(`${root}/members/${uid}`), { role: "MANAGER", active: true });
  }
  batch.set(admin.doc(`${root}/members/inactive`), { role: "MANAGER", active: false });
  batch.set(admin.doc(`${root}/members/cleaner`), { role: "CLEANER", active: true });
  batch.set(admin.doc("organizations/other/members/other-manager"), { role: "MANAGER", active: true });
  batch.set(admin.doc("organizations/other/jobs/job"), { organizationId: "other" });
  await batch.commit();
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(proofPath).put(new Uint8Array([1, 2, 3]), { contentType: "image/jpeg" });
  });
});

test("active manager can read/query/create/update/delete only supported operational documents", async () => {
  const db = account("manager").firestore();
  for (const path of paths) {
    await assertSucceeds(db.doc(`${root}/${path}`).get());
    await assertSucceeds(db.doc(`${root}/${path}`).update({ updated: true }));
    const collection = db.doc(`${root}/${path}`).parent;
    await assertSucceeds(collection.get());
    const added = collection.doc("new-record");
    await assertSucceeds(added.set({ organizationId: org }));
    await assertSucceeds(added.delete());
  }
});

test("only an active manager can update Job price snapshots without changing checklist context", async () => {
  const managerJob = account("manager").firestore().doc(`${root}/jobs/job`);
  const cleanerJob = account("cleaner").firestore().doc(`${root}/jobs/job`);

  await assertSucceeds(managerJob.update({ clientPrice: 350, cleanerPayout: 200 }));
  await assertFails(cleanerJob.update({ clientPrice: 350, cleanerPayout: 200 }));
});

test("manager browsers cannot directly read or mutate server-only client report capabilities", async () => {
  const db = account("manager").firestore();
  const pathsToProtect = [
    "clientReportTokenLookups/" + "a".repeat(64),
    root + "/jobs/job/checklistRuns/initial/clientReportCapabilities/active",
  ];
  for (const path of pathsToProtect) {
    await assertFails(db.doc(path).get());
    await assertFails(db.doc(path).set({ status: "ACTIVE" }));
    await assertFails(db.doc(path).delete());
  }
});

for (const [label, context] of [
  ["unrelated authenticated user", () => account("outsider")],
  ["signed-out user", () => environment.unauthenticatedContext()],
  ["anonymous user even with a membership", () => account("anonymous-member", true)],
  ["other organization's manager", () => account("other-manager")],
  ["inactive member", () => account("inactive")],
  ["non-manager member", () => account("cleaner")],
]) {
  test(`${label} cannot read/write operations or payout proofs`, async () => {
    const client = context();
    for (const path of [...paths, assignmentPath]) {
      await assertFails(client.firestore().doc(`${root}/${path}`).get());
      await assertFails(client.firestore().doc(`${root}/${path}`).set({ organizationId: org }));
    }
    await assertFails(client.storage().ref(proofPath).getMetadata());
    await assertFails(client.storage().ref(proofPath).put(new Uint8Array([1]), { contentType: "image/jpeg" }));
  });
}

test("organization A manager cannot use organization B paths regardless of payload orgId", async () => {
  const client = account("manager");
  await assertFails(client.firestore().doc("organizations/other/jobs/job").get());
  await assertFails(client.firestore().doc("organizations/other/jobs/job").set({ organizationId: org }));
  await assertFails(client.storage().ref("organizations/other/payouts/p/proof/payment-proof")
    .put(new Uint8Array([1]), { contentType: "image/jpeg" }));
});

test("Job checklist context revision is monotonic and Assignment mutations advance it atomically", async () => {
  const db = account("manager").firestore();
  const job = db.doc(`${root}/jobs/job`);
  const assignment = db.doc(`${root}/${assignmentPath}`);

  await assertFails(assignment.set({ cleanerId: "cleaner-a", isActive: true }));

  const assign = db.batch();
  assign.update(job, {
    assignedCleanerIds: ["cleaner-a"],
    operationalStatus: "ASSIGNED",
    checklistContextRevision: 1,
  });
  assign.set(assignment, { cleanerId: "cleaner-a", isActive: true });
  await assertSucceeds(assign.commit());

  await assertSucceeds(job.update({ notes: "Unrelated manager edit" }));
  await assertFails(job.update({ checklistContextRevision: 0 }));
  await assertFails(job.update({ checklistContextRevision: -1 }));
  await assertFails(job.update({ scheduledDate: "2026-09-22", checklistContextRevision: 1 }));
  await assertSucceeds(job.update({ scheduledDate: "2026-09-22", checklistContextRevision: 2 }));
  await assertFails(job.set({ organizationId: org, fixture: true }));

  await assertFails(assignment.update({ cleanerId: "cleaner-b" }));
  await assertFails(assignment.update({ isActive: false }));
  const remove = db.batch();
  remove.update(job, {
    assignedCleanerIds: [],
    operationalStatus: "OFFERED",
    checklistContextRevision: 3,
  });
  remove.update(assignment, { isActive: false });
  await assertSucceeds(remove.commit());
});

test("membership is own-get only; neither manager nor outsider can self-escalate or list members", async () => {
  for (const uid of ["manager", "outsider"]) {
    const db = account(uid).firestore();
    await assertSucceeds(db.doc(`${root}/members/${uid}`).get());
    await assertFails(db.collection(`${root}/members`).get());
    await assertFails(db.doc(`${root}/members/cleaner`).get());
    await assertFails(db.doc(`${root}/members/${uid}`).set({ role: "MANAGER", active: true }));
    await assertFails(db.doc(`${root}/members/${uid}`).delete());
    const batch = db.batch();
    batch.set(db.doc(`${root}/members/${uid}`), { role: "MANAGER", active: true });
    batch.set(db.doc(`${root}/jobs/escalated`), { organizationId: org });
    await assertFails(batch.commit());
  }
});

function managerPageLoadEvent(uid = "manager") {
  return {
    page: "dashboard",
    durationMs: 120,
    dataDurationMs: 100,
    result: "success",
    uid,
    sessionId: "session-identifier-1",
    deviceId: "device-identifier-1",
    deviceClass: "mobile",
    browser: "safari",
    platform: "ios",
    standalone: true,
    connection: { effectiveType: "4g", rtt: 75, downlink: 10, saveData: false },
    viewport: { width: 390, height: 844 },
    appVersion: "v0.9.3",
    createdAt: serverTimestamp(),
  };
}

test("manager page-load telemetry is readable by active managers and remains append-only", async () => {
  const managerDb = account("manager").firestore();
  const event = managerDb.doc(`${root}/managerPageLoadEvents/event-1`);
  await assertSucceeds(event.set(managerPageLoadEvent()));
  await assertSucceeds(event.get());
  await assertSucceeds(managerDb.collection(`${root}/managerPageLoadEvents`).get());
  await assertFails(event.update({ durationMs: 1 }));
  await assertFails(event.delete());
  await assertFails(managerDb.doc(`${root}/managerPageLoadEvents/spoofed`).set(managerPageLoadEvent("outsider")));
  await assertFails(account("outsider").firestore()
    .doc(`${root}/managerPageLoadEvents/outsider-event`).set(managerPageLoadEvent("outsider")));

  const deniedReaders = [
    account("outsider").firestore(),
    environment.unauthenticatedContext().firestore(),
    account("anonymous-member", true).firestore(),
    account("other-manager").firestore(),
    account("inactive").firestore(),
    account("cleaner").firestore(),
  ];
  for (const db of deniedReaders) {
    await assertFails(db.doc(`${root}/managerPageLoadEvents/event-1`).get());
    await assertFails(db.collection(`${root}/managerPageLoadEvents`).get());
  }
});

test("server metadata, unknown subcollections and future checklist namespaces are default denied", async () => {
  const db = account("manager").firestore();
  for (const path of [
    "managerPushDevices/forged", `${root}/managerReminderDeliveries/forged`,
    `${root}/managerNotificationEvents/forged`, `${root}/publicOfferTokens/token`,
    `${root}/checklistRuns/run`, `${root}/checklistSettings/default`,
    `${root}/properties/property/checklistSettings/default`,
    `${root}/jobs/job/checklistRuns/run`, `${root}/jobs/job/checklistRuns/run/photos/photo`,
    `${root}/jobs/job/checklistRuns/run/checklistCapabilities/active`,
    `${root}/jobs/job/checklistRuns/run/drafts/current`,
    `${root}/jobs/job/checklistRuns/run/draftMutations/mutation-identifier-1`,
    `${root}/jobs/job/checklistRuns/run/deliveries/delivery`, `${root}/jobs/job/unknown/record`,
  ]) {
    await assertFails(db.doc(path).get());
    await assertFails(db.doc(path).set({ active: true }));
  }
  await assertFails(account("manager").storage()
    .ref(`${root}/jobs/job/checklistRuns/run/photos/photo`)
    .put(new Uint8Array([1]), { contentType: "image/jpeg" }));
});

test("payout proof size/type/path limits survive; current authorized upload/read still works", async () => {
  const storage = account("manager").storage();
  const proof = storage.ref(proofPath);
  await assertSucceeds(proof.put(new Uint8Array([4, 5]), { contentType: "image/png" }));
  await assertSucceeds(proof.getMetadata());
  await assertFails(proof.put(new Uint8Array([1]), { contentType: "text/plain" }));
  await assertFails(proof.put(new Uint8Array(10 * 1024 * 1024 + 1), { contentType: "image/jpeg" }));
  await assertFails(storage.ref(`${proofPath}-unexpected`).put(new Uint8Array([1]), { contentType: "image/jpeg" }));
});

test("revocation or removal denies subsequent reads/writes, enrollment and recipient selection", async () => {
  const client = account("manager");
  await assertSucceeds(client.firestore().doc(`${root}/jobs/job`).get());
  const data = { deviceId: "local-device-0001", token: "x".repeat(64), organizationId: "other" };
  assert.deepEqual(await registerManagerPushDevice.run(request("manager", data)), { registered: true });
  const devices = await admin.collection("managerPushDevices").get();
  assert.equal(devices.docs[0].data().organizationId, org);
  assert.equal((await authorizedManagerDevices(admin, org, devices.docs)).length, 1);
  await admin.doc(`${root}/members/manager`).update({ active: false });
  await assertFails(client.firestore().doc(`${root}/jobs/job`).get({ source: "server" }));
  await assertFails(client.firestore().doc(`${root}/jobs/job`).update({ modified: true }));
  await assertFails(client.storage().ref(proofPath).getMetadata());
  await assertFails(client.storage().ref(proofPath).put(new Uint8Array([1]), { contentType: "image/jpeg" }));
  await assert.rejects(registerManagerPushDevice.run(request("manager", data)), { code: "permission-denied" });
  assert.equal((await authorizedManagerDevices(admin, org, devices.docs)).length, 0);
  await admin.doc(`${root}/members/manager`).delete();
  await assertFails(client.firestore().doc(`${root}/jobs/job`).get({ source: "server" }));
});

test("actual manager callables reject unauthorized/anonymous callers before enrollment or feedback", async () => {
  for (const [uid, anonymous, code] of [
    ["outsider", false, "permission-denied"], ["other-manager", false, "permission-denied"],
    ["inactive", false, "permission-denied"], ["cleaner", false, "permission-denied"],
    ["anonymous-member", true, "unauthenticated"], [null, false, "unauthenticated"],
  ]) {
    const input = request(uid, { organizationId: "other", deviceId: "local-device-0001", token: "x".repeat(64) }, anonymous);
    await assert.rejects(registerManagerPushDevice.run(input), { code });
    await assert.rejects(submitFeedback.run(input), { code });
  }
  assert.equal((await admin.collection("managerPushDevices").get()).size, 0);
  // An approved manager reaches payload validation, without contacting GitHub.
  await assert.rejects(submitFeedback.run(request("manager")), { code: "invalid-argument" });
});

async function seedChecklistJob({ checklistSettings } = {}) {
  await admin.doc(`${root}/properties/property`).set({
    organizationId: org,
    name: "Fixture Property",
    ...(checklistSettings ? { checklistSettings } : {}),
  });
  await admin.doc(`${root}/jobs/job`).set({
    organizationId: org,
    propertyId: "property",
    propertyName: "Fixture Property",
  });
}

async function seedEligibleChecklistJob({ checklistSettings } = {}) {
  await seedChecklistJob({ checklistSettings });
  await admin.doc(`${root}/jobs/job`).update({
    schemaVersion: 2,
    operationalStatus: "ASSIGNED",
    assignedCleanerIds: ["cleaner-a"],
    checklistContextRevision: 1,
    clientPrice: 999,
    notes: "manager-only",
    guestName: "private guest",
  });
  await admin.doc(`${root}/jobs/job/assignments/assignment`).set({
    organizationId: org,
    jobId: "job",
    cleanerId: "cleaner-a",
    cleanerNameSnapshot: "Assigned Cleaner Example",
    isActive: true,
    email: "private-cleaner@example.test",
    phone: "private-phone",
    internalNotes: "private assignment details",
  });
  await createChecklistRun.run(request("manager", { jobId: "job" }));
}

async function completeChecklistAnswers(jobId = "job") {
  const run = (await admin.doc(`${root}/jobs/${jobId}/checklistRuns/initial`).get()).data();
  const checklistAnswers = Object.fromEntries(run.resolvedDefinition.sections
    .flatMap((section) => section.items.map((item) => [item.id, "DONE"])));
  const inventoryAnswers = Object.fromEntries(run.resolvedDefinition.inventoryItems
    .map((item) => [item.id, "HIGH"]));
  return { checklistAnswers, inventoryAnswers };
}

async function publicChecklistGet(token, extraQuery = {}) {
  const response = { code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; } };
  await publicChecklist({ method: "GET", query: { token, ...extraQuery }, get() { return undefined; } }, response);
  return response;
}

async function publicClientReportGet(token, extraQuery = {}) {
  const response = { code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; } };
  await publicClientReport({ method: "GET", query: { token, ...extraQuery } }, response);
  return response;
}

async function publicChecklistSave(body) {
  const response = { code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; } };
  await publicChecklist({ method: "POST", query: {}, body, get() { return undefined; } }, response);
  return response;
}

async function publicChecklistUpload(token, requirementId, bytes, contentType = "image/jpeg") {
  const response = { code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; } };
  await publicChecklist({
    method: "PUT",
    query: { token, organizationId: "injected", jobId: "injected" },
    rawBody: bytes,
    get(header) {
      if (header === "X-CleanFlow-Checklist-Item") return requirementId;
      if (header === "Content-Type") return contentType;
      return undefined;
    },
  }, response);
  return response;
}

async function saveRequiredChecklistPhoto(token) {
  const result = await publicChecklistUpload(token, "living-belongings", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.equal(result.code, 200);
  return result;
}

async function prepareReadyClientReportRun() {
  await seedEligibleChecklistJob({
    checklistSettings: {
      additionalChecklistItems: [{ id: "client-window-check", sectionId: "living-general", label: "Check windows" }],
      inventoryItems: [{ id: "client-tea", label: "Tea" }],
      cleanerInstructions: "Cleaner-facing instruction.",
    },
  });
  const cleanerCapability = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await saveRequiredChecklistPhoto(cleanerCapability.token);
  const completeAnswers = await completeChecklistAnswers();
  const saved = await publicChecklistSave({
    token: cleanerCapability.token,
    mutationId: "client-report-draft-0001",
    baseRevision: 0,
    changes: {
      ...completeAnswers,
      checklistAnswers: { ...completeAnswers.checklistAnswers, "bed-remake": "DONE", "client-window-check": "DONE" },
      inventoryAnswers: { ...completeAnswers.inventoryAnswers, "hand-soap": "NEEDS_RESTOCK", "client-tea": "LOW" },
      issueNotes: "A lamp bulb needs replacement.",
      generalNotes: "Cleaning notes for the client.",
    },
  });
  assert.equal(saved.code, 200);
  const ready = await publicChecklistSave({
    token: cleanerCapability.token,
    action: "READY_FOR_REVIEW",
    submissionId: "client-report-review-0001",
    baseRevision: 1,
  });
  assert.equal(ready.code, 200);
  const runRef = admin.doc(`${root}/jobs/job/checklistRuns/initial`);
  await runRef.update({
    "propertySnapshot.accessInstructions": "private access instructions",
    "propertySnapshot.propertyId": "private-property-id",
    "propertyChecklistSettingsSnapshot.keyCodeInfo": "private code",
    "jobSnapshot.managerNotes": "internal manager note",
    "jobSnapshot.clientPrice": 500,
    "jobSnapshot.guestName": "private guest",
  });
  return { cleanerCapability, runRef };
}

test("only an active manager can approve a ready Checklist Run and complete its eligible Job once", async () => {
  await prepareReadyClientReportRun();
  await admin.doc(`${root}/jobs/job`).update({ cleanerPayout: 250 });

  await assert.rejects(
    approveChecklistRun.run(request("cleaner", { jobId: "job" })),
    { code: "permission-denied" },
  );
  assert.equal((await admin.doc(`${root}/jobs/job`).get()).data().operationalStatus, "ASSIGNED");

  const first = await approveChecklistRun.run(request("manager", { jobId: "job" }));
  const completedJob = (await admin.doc(`${root}/jobs/job`).get()).data();
  assert.deepEqual(first, { completed: true, operationalStatus: "COMPLETED" });
  assert.equal(completedJob.operationalStatus, "COMPLETED");
  assert.equal(completedJob.checklistContextRevision, 2);
  assert.equal(completedJob.cleanerPayout, 250);
  assert.ok(completedJob.completedAt);
  assert.equal((await admin.doc(`${root}/jobs/job/checklistRuns/initial`).get()).data().status, "READY_FOR_REVIEW");

  const retry = await approveChecklistRun.run(request("manager", { jobId: "job" }));
  assert.deepEqual(retry, { completed: false, operationalStatus: "COMPLETED" });
  assert.equal((await admin.doc(`${root}/jobs/job`).get()).data().checklistContextRevision, 2);
});

test("active manager creates one default DRAFT Checklist Run and a retry returns it", async () => {
  await seedChecklistJob();

  const [first, retry] = await Promise.all([
    createChecklistRun.run(request("manager", { jobId: "job" })),
    createChecklistRun.run(request("manager", { jobId: "job" })),
  ]);

  assert.equal(first.runId, "initial");
  assert.equal(retry.runId, "initial");
  assert.deepEqual(new Set([first.created, retry.created]), new Set([true, false]));
  const runs = await admin.doc(`${root}/jobs/job`).collection("checklistRuns").get();
  assert.equal(runs.size, 1);
  const run = runs.docs[0].data();
  assert.equal(run.status, "DRAFT");
  assert.equal(run.definitionVersion, 1);
  assert.equal(run.resolvedDefinition.sections.flatMap((section) => section.items).length, 28);
  assert.equal(run.createdByUid, "manager");
});

test("Checklist Run creation snapshots configured Property fields and ignores later Property edits", async () => {
  await seedChecklistJob({
    checklistSettings: {
      additionalChecklistItems: [{
        id: "kitchen-wine-glasses",
        sectionId: "kitchen",
        label: "Inspect wine glasses",
      }],
      inventoryItems: [{ id: "coffee-filters", label: "Coffee filters" }],
      requiredPhotoTypes: [{ id: "balcony", label: "Balcony photo", maximum: 2 }],
      cleanerInstructions: "Check the balcony.",
    },
  });

  await createChecklistRun.run(request("manager", { jobId: "job" }));
  await admin.doc(`${root}/properties/property`).update({
    checklistSettings: { cleanerInstructions: "Changed later." },
  });

  const run = (await admin.doc(`${root}/jobs/job/checklistRuns/initial`).get()).data();
  assert.equal(run.resolvedDefinition.cleanerInstructions, "Check the balcony.");
  assert.deepEqual(run.resolvedDefinition.requiredPhotoTypes, [
    { id: "balcony", label: "Balcony photo", maximum: 2 },
  ]);
  assert.ok(run.resolvedDefinition.sections
    .find((section) => section.id === "kitchen").items
    .some((item) => item.id === "kitchen-wine-glasses"));
  assert.deepEqual(
    run.resolvedDefinition.inventoryItems.find((item) => item.id === "coffee-filters"),
    { id: "coffee-filters", label: "Coffee filters" },
  );
});

test("Checklist Run creation rejects unauthenticated, non-manager, and wrong-organization callers", async () => {
  await seedChecklistJob();

  for (const [uid, anonymous, code] of [
    [null, false, "unauthenticated"],
    ["anonymous-member", true, "unauthenticated"],
    ["outsider", false, "permission-denied"],
    ["cleaner", false, "permission-denied"],
    ["other-manager", false, "permission-denied"],
  ]) {
    await assert.rejects(createChecklistRun.run(request(uid, { jobId: "job" }, anonymous)), { code });
  }

  assert.equal((await admin.doc(`${root}/jobs/job`).collection("checklistRuns").get()).size, 0);
});

test("Checklist Run creation fails safely for an unknown Job", async () => {
  await assert.rejects(
    createChecklistRun.run(request("manager", { jobId: "missing-job" })),
    { code: "not-found" },
  );
  assert.equal((await admin.doc(`${root}/jobs/missing-job`).get()).exists, false);
});

test("only an active manager can load the safe Checklist Run summary", async () => {
  await seedChecklistJob({
    checklistSettings: {
      cleanerInstructions: "Check the balcony.",
      requiredPhotoTypes: [{ id: "balcony", label: "Balcony", maximum: 2 }],
    },
  });
  await admin.doc(`${root}/properties/property`).update({ accessCode: "private-code" });
  await createChecklistRun.run(request("manager", { jobId: "job" }));

  const response = await getChecklistRun.run(request("manager", { jobId: "job" }));
  assert.equal(response.run.id, "initial");
  assert.equal(response.run.status, "DRAFT");
  assert.equal(response.run.checklistItemCount, 28);
  assert.deepEqual(response.run.requiredPhotoTypes, [{ id: "balcony", label: "Balcony", maximum: 2 }]);
  assert.equal(response.run.requiredPhotoCount, 2);
  assert.equal(response.run.cleanerInstructions, "Check the balcony.");
  assert.equal(Object.hasOwn(response.run, "propertyChecklistSettingsSnapshot"), false);
  assert.equal(JSON.stringify(response.run).includes("private-code"), false);

  for (const [uid, anonymous, code] of [
    [null, false, "unauthenticated"],
    ["outsider", false, "permission-denied"],
    ["cleaner", false, "permission-denied"],
    ["other-manager", false, "permission-denied"],
  ]) {
    await assert.rejects(getChecklistRun.run(request(uid, { jobId: "job" }, anonymous)), { code });
  }
});

test("Checklist capability is manager-only, rotates atomically, and public reads are frozen and side-effect free", async () => {
  await seedEligibleChecklistJob();
  const beforeJob = (await admin.doc(`${root}/jobs/job`).get()).data();
  const beforeRun = (await admin.doc(`${root}/jobs/job/checklistRuns/initial`).get()).data();
  const first = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  const firstPublic = await publicChecklistGet(first.token, { organizationId: "other", jobId: "injected" });
  assert.equal(firstPublic.code, 200);
  assert.equal(firstPublic.headers["Cache-Control"], "no-store, private");
  assert.equal(firstPublic.headers["Referrer-Policy"], "no-referrer");
  assert.equal(firstPublic.body.checklist.propertyName, "Fixture Property");
  assert.equal(firstPublic.body.draft.revision, 0);
  const serialized = JSON.stringify(firstPublic.body.checklist);
  for (const forbidden of ["private guest", "manager-only", "999", "organization", "accessCode", "jobId", "runId", "cleanerId"]) assert.equal(serialized.includes(forbidden), false);
  assert.deepEqual((await admin.doc(`${root}/jobs/job`).get()).data(), beforeJob);
  assert.deepEqual((await admin.doc(`${root}/jobs/job/checklistRuns/initial`).get()).data(), beforeRun);

  const second = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  assert.notEqual(first.token, second.token);
  assert.equal((await publicChecklistGet(first.token)).code, 404);
  assert.equal((await publicChecklistGet(second.token)).code, 200);
  assert.equal((await admin.doc(`${root}/jobs/job/checklistRuns/initial`).collection("checklistCapabilities").get()).size, 1);
  const revoked = await revokeChecklistCapability.run(request("manager", { jobId: "job" }));
  assert.equal(revoked.capability.state, "REVOKED");
  assert.equal((await publicChecklistGet(second.token)).code, 410);
});

test("capability-authorized cleaner drafts validate frozen fields, revisions, and idempotent receipts", async () => {
  await seedEligibleChecklistJob({
    checklistSettings: {
      additionalChecklistItems: [{ id: "extra-item", sectionId: "kitchen", label: "Extra" }],
      inventoryItems: [{ id: "coffee", label: "Coffee" }],
    },
  });
  await admin.doc(`${root}/properties/property`).update({
    checklistSettings: {
      additionalChecklistItems: [{ id: "later-item", sectionId: "kitchen", label: "Later" }],
    },
  });
  // The Run intentionally keeps its original frozen default after the later Property edit.
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  const first = await publicChecklistSave({
    token: issued.token,
    mutationId: "draft-mutation-0001",
    baseRevision: 0,
    changes: { checklistAnswers: { "bed-remake": "DONE" }, issueNotes: "Check lamp" },
  });
  assert.equal(first.code, 200);
  assert.equal(first.body.revision, 1);
  assert.equal(first.body.duplicate, false);
  assert.equal(first.body.draft.checklistAnswers["bed-remake"], "DONE");
  assert.equal(first.body.draft.issueNotes, "Check lamp");
  const cleared = await publicChecklistSave({
    token: issued.token,
    mutationId: "draft-mutation-0002",
    baseRevision: 1,
    changes: { issueNotes: "" },
  });
  assert.equal(cleared.code, 200);
  assert.equal(cleared.body.revision, 2);
  assert.equal(cleared.body.draft.issueNotes, "");
  const retry = await publicChecklistSave({
    token: issued.token,
    mutationId: "draft-mutation-0001",
    baseRevision: 0,
    changes: { checklistAnswers: { "bed-remake": "DONE" }, issueNotes: "Check lamp" },
  });
  assert.equal(retry.code, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.revision, 1);
  const changedRetry = await publicChecklistSave({
    token: issued.token,
    mutationId: "draft-mutation-0001",
    baseRevision: 0,
    changes: { checklistAnswers: { "bed-remake": "DONE" }, issueNotes: "Changed" },
  });
  assert.equal(changedRetry.code, 409);
  const invalidNa = await publicChecklistSave({
    token: issued.token, mutationId: "draft-mutation-0003", baseRevision: 2,
    changes: { checklistAnswers: { "bed-remake": "NOT_APPLICABLE" } },
  });
  assert.equal(invalidNa.code, 400);
  const unknown = await publicChecklistSave({
    token: issued.token, mutationId: "draft-mutation-0004", baseRevision: 2,
    changes: { checklistAnswers: { unknown: "DONE" } },
  });
  assert.equal(unknown.code, 400);
  const [one, two] = await Promise.all([
    publicChecklistSave({ token: issued.token, mutationId: "draft-mutation-0005", baseRevision: 2, changes: { generalNotes: "A" } }),
    publicChecklistSave({ token: issued.token, mutationId: "draft-mutation-0006", baseRevision: 2, changes: { generalNotes: "B" } }),
  ]);
  assert.equal([one, two].filter((result) => result.code === 200).length, 1);
  assert.equal([one, two].filter((result) => result.code === 409).length, 1);
  const run = await getChecklistRun.run(request("manager", { jobId: "job" }));
  assert.equal(run.run.draft.revision, 3);
  assert.equal(run.run.draft.checklistAnswers["bed-remake"], "DONE");
  assert.equal(run.run.draft.checklistAnswers["extra-item"], "UNANSWERED");
  assert.equal(run.run.draft.checklistAnswers["later-item"], undefined);
  assert.equal(run.run.draft.progress.checklist.done, 1);
  assert.equal(run.run.resolvedDefinition, undefined);
  await assertFails(account("manager").firestore().doc(`${root}/jobs/job/checklistRuns/initial/drafts/current`).get());
});

test("capability-authorized DRAFT photo is server-scoped, idempotent, reloadable, and manager-only", async () => {
  await seedEligibleChecklistJob();
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const first = await publicChecklistUpload(issued.token, "living-belongings", jpeg);
  assert.equal(first.code, 200);
  assert.equal(first.body.duplicate, false);
  assert.deepEqual(first.body.evidence, [{
    requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 4, createdAt: null,
  }]);

  const evidencePath = `${root}/jobs/job/checklistRuns/initial/evidence/living-belongings`;
  const evidence = (await admin.doc(evidencePath).get()).data();
  assert.equal(evidence.runId, "initial");
  assert.equal(evidence.requirementId, "living-belongings");
  assert.equal(evidence.contentType, "image/jpeg");
  assert.equal(evidence.sizeBytes, 4);
  assert.match(evidence.storagePath, /^organizations\/cleanflow-demo\/jobs\/job\/checklistRuns\/initial\/evidence\/living-belongings\/[a-f0-9]{64}\.jpg$/);
  assert.equal(evidence.createdAt?.toDate instanceof Function, true);
  assert.equal(JSON.stringify(evidence).includes(issued.token), false);

  const retry = await publicChecklistUpload(issued.token, "living-belongings", jpeg);
  assert.equal(retry.code, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal((await admin.doc(`${root}/jobs/job/checklistRuns/initial`).collection("evidence").get()).size, 1);

  const loaded = await publicChecklistGet(issued.token);
  assert.equal(loaded.code, 200);
  assert.equal(loaded.body.checklist.assignedCleanerName, "Assigned Cleaner Example");
  assert.deepEqual(loaded.body.checklist.evidence.map(({ requirementId, contentType, sizeBytes }) => ({ requirementId, contentType, sizeBytes })), [{
    requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 4,
  }]);
  const publicProjection = JSON.stringify(loaded.body);
  assert.equal(publicProjection.includes("private-cleaner@example.test"), false);
  assert.equal(publicProjection.includes("private-phone"), false);
  assert.equal(publicProjection.includes("private assignment details"), false);
  assert.equal(publicProjection.includes("private guest"), false);
  assert.equal(publicProjection.includes("manager-only"), false);
  assert.equal(JSON.stringify(loaded.body).includes(evidence.storagePath), false);
  const downloaded = await publicChecklistGet(issued.token, { evidenceItem: "living-belongings" });
  assert.equal(downloaded.code, 200);
  assert.deepEqual(downloaded.body, jpeg);
  assert.equal(downloaded.headers["Cache-Control"], "no-store, private");

  const managerView = await getChecklistEvidence.run(request("manager", { jobId: "job", requirementId: "living-belongings" }));
  assert.equal(managerView.contentType, "image/jpeg");
  assert.deepEqual(Buffer.from(managerView.base64, "base64"), jpeg);
  const managerRun = await getChecklistRun.run(request("manager", { jobId: "job" }));
  assert.deepEqual(managerRun.run.evidence.map(({ requirementId, contentType, sizeBytes }) => ({ requirementId, contentType, sizeBytes })), [{
    requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 4,
  }]);
  assert.equal(JSON.stringify(managerRun.run).includes(evidence.storagePath), false);
  for (const [uid, anonymous, code] of [[null, false, "unauthenticated"], ["outsider", false, "permission-denied"], ["cleaner", false, "permission-denied"], ["other-manager", false, "permission-denied"]]) {
    await assert.rejects(getChecklistEvidence.run(request(uid, { jobId: "job", requirementId: "living-belongings" }, anonymous)), { code });
  }
  await assertFails(account("manager").firestore().doc(evidencePath).get());
  await assertFails(account("manager").storage().ref(evidence.storagePath).getMetadata());
});

test("checklist evidence rejects wrong requirement, bad image data, stale capability, and non-DRAFT writes", async () => {
  await seedEligibleChecklistJob();
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  assert.equal((await publicChecklistUpload(issued.token, "injected-item", jpeg)).code, 400);
  assert.equal((await publicChecklistUpload(issued.token, "living-belongings", Buffer.from("not-an-image"), "image/jpeg")).code, 400);
  assert.equal((await publicChecklistUpload(issued.token, "living-belongings", jpeg, "image/heic")).code, 400);
  await admin.doc(`${root}/jobs/job`).update({ checklistContextRevision: 2 });
  assert.equal((await publicChecklistUpload(issued.token, "living-belongings", jpeg)).code, 410);

  const replacement = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await revokeChecklistCapability.run(request("manager", { jobId: "job" }));
  assert.equal((await publicChecklistUpload(replacement.token, "living-belongings", jpeg)).code, 410);
  const expiring = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await admin.doc(`${root}/jobs/job/checklistRuns/initial/checklistCapabilities/active`)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  assert.equal((await publicChecklistUpload(expiring.token, "living-belongings", jpeg)).code, 410);
  const active = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await admin.doc(`${root}/jobs/job/checklistRuns/initial`).update({ status: "READY_FOR_REVIEW" });
  assert.equal((await publicChecklistUpload(active.token, "living-belongings", jpeg)).code, 410);
});

test("capability-authorized cleaner can hand off one saved DRAFT for manager review without changing Job work", async () => {
  await seedEligibleChecklistJob();
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await saveRequiredChecklistPhoto(issued.token);
  const completeAnswers = await completeChecklistAnswers();
  const save = await publicChecklistSave({
    token: issued.token, mutationId: "draft-mutation-ready-1", baseRevision: 0,
    changes: {
      ...completeAnswers,
      inventoryAnswers: { ...completeAnswers.inventoryAnswers, "hand-soap": "NEEDS_RESTOCK" },
      generalNotes: "All saved",
    },
  });
  assert.equal(save.code, 200);
  const beforeJob = (await admin.doc(`${root}/jobs/job`).get()).data();
  const beforeAssignment = (await admin.doc(`${root}/${assignmentPath}`).get()).data();
  const handoff = {
    token: issued.token,
    action: "READY_FOR_REVIEW",
    submissionId: "review-submission-0001",
    baseRevision: 1,
  };
  const first = await publicChecklistSave(handoff);
  assert.equal(first.code, 200);
  assert.equal(first.body.duplicate, false);
  assert.equal(first.body.checklist.status, "READY_FOR_REVIEW");
  assert.equal(first.body.draft.generalNotes, "All saved");
  const runPath = `${root}/jobs/job/checklistRuns/initial`;
  const persisted = (await admin.doc(runPath).get()).data();
  assert.equal(persisted.status, "READY_FOR_REVIEW");
  assert.equal(persisted.readyForReviewCleanerId, "cleaner-a");
  assert.equal(persisted.readyForReviewDraftRevision, 1);
  assert.ok(persisted.readyForReviewAt?.toDate);

  const retry = await publicChecklistSave(handoff);
  assert.equal(retry.code, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal((await publicChecklistSave({ ...handoff, baseRevision: 0 })).code, 409);
  assert.equal((await publicChecklistSave({
    token: issued.token, mutationId: "draft-mutation-after-review", baseRevision: 1,
    changes: { generalNotes: "Must not overwrite" },
  })).code, 410);
  const loaded = await publicChecklistGet(issued.token);
  assert.equal(loaded.code, 200);
  assert.equal(loaded.body.checklist.status, "READY_FOR_REVIEW");
  assert.equal(loaded.body.draft.checklistAnswers["bed-remake"], "DONE");
  assert.equal(loaded.body.checklist.readyForReviewCleanerId, undefined);
  const managerRun = await getChecklistRun.run(request("manager", { jobId: "job" }));
  assert.equal(managerRun.run.status, "READY_FOR_REVIEW");
  assert.equal(managerRun.run.draft.progress.checklist.done, managerRun.run.checklistItemCount);
  assert.equal(managerRun.run.draft.progress.inventory.answered, managerRun.run.inventoryItemCount);
  assert.deepEqual((await admin.doc(`${root}/jobs/job`).get()).data(), beforeJob);
  assert.deepEqual((await admin.doc(`${root}/${assignmentPath}`).get()).data(), beforeAssignment);
  await assertFails(account("manager").firestore().doc(runPath).update({ status: "DRAFT" }));
});

test("review handoff rejects unanswered frozen items and missing evidence without losing the saved draft", async () => {
  await seedEligibleChecklistJob();
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  const incomplete = await publicChecklistSave({
    token: issued.token,
    mutationId: "review-incomplete-draft-1",
    baseRevision: 0,
    changes: {
      checklistAnswers: { "bed-remake": "DONE", "outdoor-pool": "NOT_APPLICABLE" },
      inventoryAnswers: { "hand-soap": "LOW" },
      generalNotes: "Saved before validation.",
    },
  });
  assert.equal(incomplete.code, 200);
  const handoff = await publicChecklistSave({
    token: issued.token,
    action: "READY_FOR_REVIEW",
    submissionId: "review-submission-missing-photo",
    baseRevision: 1,
  });
  assert.equal(handoff.code, 422);
  assert.equal(handoff.body.error, "checklist_requirements_missing");
  assert.deepEqual(handoff.body.requirements, {
    missingChecklistCount: 26,
    missingInventoryCount: 12,
    missingPhotoCount: 1,
  });
  const run = (await admin.doc(`${root}/jobs/job/checklistRuns/initial`).get()).data();
  const draft = (await admin.doc(`${root}/jobs/job/checklistRuns/initial/drafts/current`).get()).data();
  assert.equal(run.status, "DRAFT");
  assert.equal(run.readyForReviewAt, undefined);
  assert.equal(draft.revision, 1);
  assert.equal(draft.checklistAnswers["bed-remake"], "DONE");
  assert.equal(draft.checklistAnswers["outdoor-pool"], "NOT_APPLICABLE");
  assert.equal(draft.generalNotes, "Saved before validation.");
});

test("a saved complete checklist without its frozen photo stays editable; adding evidence permits the same handoff", async () => {
  await seedEligibleChecklistJob();
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  const changes = await completeChecklistAnswers();
  const saved = await publicChecklistSave({
    token: issued.token,
    mutationId: "review-complete-draft-1",
    baseRevision: 0,
    changes,
  });
  assert.equal(saved.code, 200);
  const handoff = {
    token: issued.token,
    action: "READY_FOR_REVIEW",
    submissionId: "review-submission-photo-required",
    baseRevision: 1,
  };
  const missingPhoto = await publicChecklistSave(handoff);
  assert.equal(missingPhoto.code, 422);
  assert.deepEqual(missingPhoto.body.requirements, {
    missingChecklistCount: 0,
    missingInventoryCount: 0,
    missingPhotoCount: 1,
  });
  assert.equal((await admin.doc(`${root}/jobs/job/checklistRuns/initial`).get()).data().status, "DRAFT");
  assert.equal((await admin.doc(`${root}/jobs/job/checklistRuns/initial/drafts/current`).get()).data().revision, 1);

  await saveRequiredChecklistPhoto(issued.token);
  const submitted = await publicChecklistSave(handoff);
  assert.equal(submitted.code, 200);
  assert.equal(submitted.body.checklist.status, "READY_FOR_REVIEW");
  const persisted = (await admin.doc(`${root}/jobs/job/checklistRuns/initial`).get()).data();
  assert.equal(persisted.status, "READY_FOR_REVIEW");
  const reloaded = await publicChecklistGet(issued.token);
  assert.equal(reloaded.code, 200);
  assert.equal(reloaded.body.checklist.status, "READY_FOR_REVIEW");
  assert.equal(reloaded.body.draft.progress.checklist.unanswered, 0);
  assert.equal(reloaded.body.draft.progress.inventory.answered, 13);
  const manager = await getChecklistRun.run(request("manager", { jobId: "job" }));
  assert.equal(manager.run.status, "READY_FOR_REVIEW");
  assert.equal(manager.run.draft.progress.checklist.unanswered, 0);
});

test("review handoff rejects stale draft revisions and changed checklist context", async () => {
  await seedEligibleChecklistJob();
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  const base = { token: issued.token, action: "READY_FOR_REVIEW", submissionId: "review-submission-0002", baseRevision: 0 };
  assert.equal((await publicChecklistSave({ ...base, baseRevision: 1 })).code, 409);
  await admin.doc(`${root}/jobs/job`).update({ checklistContextRevision: 2 });
  assert.equal((await publicChecklistSave(base)).code, 410);
});

test("review handoff rejects an expired or revoked capability", async () => {
  await seedEligibleChecklistJob();
  const expired = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await admin.doc(`${root}/jobs/job/checklistRuns/initial/checklistCapabilities/active`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  assert.equal((await publicChecklistSave({ token: expired.token, action: "READY_FOR_REVIEW", submissionId: "review-submission-0002", baseRevision: 0 })).code, 410);
});

test("review handoff rejects a revoked capability", async () => {
  await seedEligibleChecklistJob();
  const revoked = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await revokeChecklistCapability.run(request("manager", { jobId: "job" }));
  assert.equal((await publicChecklistSave({ token: revoked.token, action: "READY_FOR_REVIEW", submissionId: "review-submission-0002", baseRevision: 0 })).code, 410);
});

test("one concurrent review handoff wins and its identical peer observes the same Run", async () => {
  await seedEligibleChecklistJob();
  const concurrent = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await saveRequiredChecklistPhoto(concurrent.token);
  const saved = await publicChecklistSave({
    token: concurrent.token,
    mutationId: "review-concurrent-draft-1",
    baseRevision: 0,
    changes: await completeChecklistAnswers(),
  });
  assert.equal(saved.code, 200);
  const requestBody = { token: concurrent.token, action: "READY_FOR_REVIEW", submissionId: "review-submission-0003", baseRevision: 1 };
  const [one, two] = await Promise.all([publicChecklistSave(requestBody), publicChecklistSave(requestBody)]);
  assert.equal([one, two].filter((result) => result.code === 200).length, 2);
  assert.equal([one.body.duplicate, two.body.duplicate].filter(Boolean).length, 1);
  assert.equal((await admin.doc(`${root}/jobs/job/checklistRuns/initial`).get()).data().status, "READY_FOR_REVIEW");
});

test("revoked or stale capability cannot replay a saved draft receipt", async () => {
  await seedEligibleChecklistJob();
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  const body = {
    token: issued.token, mutationId: "draft-mutation-0010", baseRevision: 0,
    changes: { generalNotes: "Saved" },
  };
  assert.equal((await publicChecklistSave(body)).code, 200);
  await revokeChecklistCapability.run(request("manager", { jobId: "job" }));
  assert.equal((await publicChecklistSave(body)).code, 410);
  const replacement = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  // A new active link is a new resolved capability identity, not permission to replay an old receipt.
  assert.equal((await publicChecklistSave({ ...body, token: replacement.token })).code, 409);
  await admin.doc(`${root}/jobs/job`).update({ checklistContextRevision: 2 });
  assert.equal((await publicChecklistSave({ ...body, token: replacement.token })).code, 410);
  const job = (await admin.doc(`${root}/jobs/job`).get()).data();
  const draft = (await admin.doc(`${root}/jobs/job/checklistRuns/initial/drafts/current`).get()).data();
  assert.equal(job.operationalStatus, "ASSIGNED");
  assert.equal(draft.revision, 1);
});

test("archived or non-DRAFT context rejects public draft saves without changing the draft", async () => {
  await seedEligibleChecklistJob();
  const issued = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  const body = {
    token: issued.token, mutationId: "draft-mutation-0020", baseRevision: 0,
    changes: { generalNotes: "Must not save" },
  };
  await admin.doc(`${root}/jobs/job`).update({ archivedAt: Timestamp.now(), checklistContextRevision: 2 });
  assert.equal((await publicChecklistSave(body)).code, 410);
  assert.equal((await admin.doc(`${root}/jobs/job/checklistRuns/initial/drafts/current`).get()).exists, false);

  // Restoring the Job advances context again, so the old capability cannot resurrect.
  await admin.doc(`${root}/jobs/job`).update({ archivedAt: FieldValue.delete(), checklistContextRevision: 3 });
  assert.equal((await publicChecklistSave(body)).code, 410);
  const refreshed = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await admin.doc(`${root}/jobs/job/checklistRuns/initial`).update({ status: "SUBMITTED" });
  assert.equal((await publicChecklistSave({ ...body, token: refreshed.token })).code, 410);
  assert.equal((await admin.doc(`${root}/jobs/job/checklistRuns/initial/drafts/current`).get()).exists, false);
});

test("Checklist capability rejects malformed, expired, stale, archived, unauthorized, and concurrent contexts", async () => {
  await seedEligibleChecklistJob();
  for (const [uid, anonymous, code] of [[null, false, "unauthenticated"], ["outsider", false, "permission-denied"], ["cleaner", false, "permission-denied"]]) {
    await assert.rejects(issueChecklistCapability.run(request(uid, { jobId: "job", cleanerId: "cleaner-a" }, anonymous)), { code });
  }
  await assert.rejects(
    issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-b" })),
    { code: "failed-precondition" },
  );
  assert.equal((await publicChecklistGet("invalid")).code, 404);
  const [first, second] = await Promise.all([
    issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" })),
    issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" })),
  ]);
  const statuses = await Promise.all([publicChecklistGet(first.token), publicChecklistGet(second.token)]);
  assert.equal(statuses.filter((result) => result.code === 200).length, 1);
  const activeToken = statuses.find((result) => result.code === 200) === statuses[0] ? first.token : second.token;
  await admin.doc(`${root}/jobs/job/checklistRuns/initial/checklistCapabilities/active`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  assert.equal((await publicChecklistGet(activeToken)).code, 410);
  assert.equal((await publicChecklistSave({
    token: activeToken, mutationId: "draft-mutation-0030", baseRevision: 0, changes: { generalNotes: "Expired" },
  })).code, 410);
  const refreshed = await issueChecklistCapability.run(request("manager", { jobId: "job", cleanerId: "cleaner-a" }));
  await admin.doc(`${root}/jobs/job`).update({ checklistContextRevision: 2 });
  assert.equal((await publicChecklistGet(refreshed.token)).code, 410);
  await admin.doc(`${root}/jobs/job`).update({ checklistContextRevision: 1, archivedAt: Timestamp.now() });
  assert.equal((await publicChecklistGet(refreshed.token)).code, 410);
  await admin.doc(`${root}/members/manager`).delete();
  await assert.rejects(getChecklistCapability.run(request("manager", { jobId: "job" })), { code: "permission-denied" });
});

test("client report links expose only saved Run content and support replace, photo read, and revocation", async () => {
  const { runRef } = await prepareReadyClientReportRun();
  for (const [uid, anonymous, code] of [
    [null, false, "unauthenticated"],
    ["outsider", false, "permission-denied"],
    ["other-manager", false, "permission-denied"],
    ["cleaner", false, "permission-denied"],
    ["anonymous-member", true, "unauthenticated"],
  ]) {
    await assert.rejects(createClientReport.run(request(uid, { jobId: "job" }, anonymous)), { code });
  }

  const [firstIssue, secondIssue] = await Promise.all([
    createClientReport.run(request("manager", { jobId: "job" })),
    createClientReport.run(request("manager", { jobId: "job" })),
  ]);
  assert.deepEqual([firstIssue.created, secondIssue.created].sort(), [false, true]);
  const issued = firstIssue.created ? firstIssue : secondIssue;
  assert.equal(issued.created, true);
  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
  const tokenHash = createHash("sha256").update(issued.token).digest("hex");
  const capabilityRef = runRef.collection("clientReportCapabilities").doc("active");
  const lookupRef = admin.doc("clientReportTokenLookups/" + tokenHash);
  const capability = (await capabilityRef.get()).data();
  const lookup = (await lookupRef.get()).data();
  assert.equal(capability.tokenHash, tokenHash);
  assert.equal(capability.status, "ACTIVE");
  assert.equal(JSON.stringify(capability).includes(issued.token), false);
  assert.equal(JSON.stringify(lookup).includes(issued.token), false);
  assert.equal(lookup.organizationId, org);
  assert.equal(lookup.jobId, "job");

  const jobRef = admin.doc(root + "/jobs/job");
  const [jobBefore, runBefore, draftBefore, evidenceBefore, capabilityBefore, lookupBefore] = await Promise.all([
    jobRef.get(),
    runRef.get(),
    runRef.collection("drafts").doc("current").get(),
    runRef.collection("evidence").doc("living-belongings").get(),
    capabilityRef.get(),
    lookupRef.get(),
  ]);
  const writeAttempt = { code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  await publicClientReport({ method: "POST", query: { token: issued.token }, body: { issueNotes: "attempted edit" } }, writeAttempt);
  assert.equal(writeAttempt.code, 405);

  const loaded = await publicClientReportGet(issued.token, {
    organizationId: "injected-org", jobId: "injected-job", runId: "injected-run",
  });
  assert.equal(loaded.code, 200);
  assert.equal(loaded.headers["Cache-Control"], "no-store, private");
  assert.equal(loaded.headers["Referrer-Policy"], "no-referrer");
  assert.equal(loaded.body.report.propertyName, "Fixture Property");
  assert.equal(loaded.body.report.serviceDate, null);
  assert.equal(loaded.body.report.sections.flatMap((section) => section.items)
    .find((item) => item.label === "Check windows").answer, "DONE");
  assert.equal(loaded.body.report.inventoryItems.find((item) => item.label === "Tea").answer, "LOW");
  assert.equal(loaded.body.report.issueNotes, "A lamp bulb needs replacement.");
  assert.equal(loaded.body.report.hasPhoto, true);
  const publicBody = JSON.stringify(loaded.body.report);
  for (const forbidden of [
    "private-property-id", "private access instructions", "private code", "manager-only",
    "internal manager note", "clientPrice", "500", "private guest", "cleaner-a", "jobId",
    "runId", "organizationId", "storagePath", "contentHash", tokenHash,
  ]) assert.equal(publicBody.includes(forbidden), false);

  const photo = await publicClientReportGet(issued.token, { photo: "1" });
  assert.equal(photo.code, 200);
  assert.equal(photo.headers["Content-Type"], "image/jpeg");
  assert.deepEqual(photo.body, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.deepEqual((await publicClientReportGet(issued.token)).body, loaded.body);
  const [jobAfter, runAfter, draftAfter, evidenceAfter, capabilityAfter, lookupAfter] = await Promise.all([
    jobRef.get(),
    runRef.get(),
    runRef.collection("drafts").doc("current").get(),
    runRef.collection("evidence").doc("living-belongings").get(),
    capabilityRef.get(),
    lookupRef.get(),
  ]);
  assert.deepEqual(jobAfter.data(), jobBefore.data());
  assert.deepEqual(runAfter.data(), runBefore.data());
  assert.deepEqual(draftAfter.data(), draftBefore.data());
  assert.deepEqual(evidenceAfter.data(), evidenceBefore.data());
  assert.deepEqual(capabilityAfter.data(), capabilityBefore.data());
  assert.deepEqual(lookupAfter.data(), lookupBefore.data());

  const replacement = await createClientReport.run(request("manager", { jobId: "job", replaceExisting: true }));
  assert.equal(replacement.created, true);
  assert.notEqual(replacement.token, issued.token);
  assert.equal((await lookupRef.get()).data().status, "REPLACED");
  assert.equal((await publicClientReportGet(issued.token)).code, 410);
  assert.equal((await publicClientReportGet(replacement.token)).code, 200);
  const revoked = await revokeClientReport.run(request("manager", { jobId: "job" }));
  assert.equal(revoked.capability.state, "REVOKED");
  assert.equal((await publicClientReportGet(replacement.token)).code, 410);
});

test("client report creation requires a READY_FOR_REVIEW Run", async () => {
  await seedEligibleChecklistJob();
  await assert.rejects(createClientReport.run(request("manager", { jobId: "job" })), { code: "failed-precondition" });
});

test("client report denies expired, unknown, malformed, and unauthorized manager access", async () => {
  assert.equal((await publicClientReportGet("malformed")).code, 404);
  assert.equal((await publicClientReportGet(Buffer.alloc(32, 5).toString("base64url"))).code, 404);

  const { runRef } = await prepareReadyClientReportRun();
  const issued = await createClientReport.run(request("manager", { jobId: "job" }));
  const tokenHash = createHash("sha256").update(issued.token).digest("hex");
  await runRef.collection("clientReportCapabilities").doc("active")
    .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  await admin.doc("clientReportTokenLookups/" + tokenHash)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  assert.equal((await publicClientReportGet(issued.token)).code, 410);
  await admin.doc(root + "/members/manager").delete();
  await assert.rejects(getClientReportCapability.run(request("manager", { jobId: "job" })), { code: "permission-denied" });
  await assert.rejects(revokeClientReport.run(request("manager", { jobId: "job" })), { code: "permission-denied" });
});

test("public capability GET/response remains independent of auth and only updates its resolved offer", async () => {
  const token = Buffer.alloc(32, 7).toString("base64url");
  const job = admin.doc(`${root}/jobs/public-job`);
  await job.set({ schemaVersion: 2, operationalStatus: "OFFERED", assignedCleanerIds: [], propertyName: "Fixture Property", clientPrice: 200 });
  await job.collection("offers").doc("cleaner").set({
    status: "PENDING", cleanerId: "cleaner", publicOfferTokenHash: createHash("sha256").update(token).digest("hex"),
    publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  });
  async function http(method, query = {}, body = {}) {
    const response = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
    await publicOffer({ method, query, body }, response);
    return response;
  }
  const beforeJob = (await job.get()).data();
  const loaded = await http("GET", { token });
  assert.equal(loaded.code, 200);
  assert.equal(loaded.body.offer.propertyName, "Fixture Property");
  assert.equal(loaded.body.offer.clientPrice, undefined);
  assert.equal((await http("GET", { token: "invalid" })).code, 404);
  assert.equal((await http("POST", {}, { token, status: "INTERESTED" })).code, 200);
  assert.equal((await job.collection("offers").doc("cleaner").get()).data().status, "INTERESTED");
  assert.deepEqual((await job.get()).data(), beforeJob);
  assert.equal((await job.collection("assignments").get()).size, 0);
  await assertFails(account("outsider").firestore().doc(`${root}/jobs/public-job/offers/cleaner`).get());
});
