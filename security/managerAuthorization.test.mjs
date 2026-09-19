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
initializeApp({ projectId: "demo-cleanflow" });
const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
const { registerManagerPushDevice, submitFeedback, publicOffer } = await import("../functions/src/index.js");
const { authorizedManagerDevices } = await import("../functions/src/managerAuthorization.js");
const { createHash } = await import("node:crypto");
const admin = getFirestore();
const org = "cleanflow-demo";
const root = `organizations/${org}`;
const paths = ["clients/client", "properties/property", "cleaners/cleaner", "jobs/job",
  "jobs/job/offers/offer", "jobs/job/assignments/assignment", "jobs/job/issues/issue", "payouts/payout"];
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
  for (const path of paths) batch.set(admin.doc(`${root}/${path}`), { organizationId: org, fixture: true });
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
    for (const path of paths) {
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

test("server metadata, unknown subcollections and future checklist namespaces are default denied", async () => {
  const db = account("manager").firestore();
  for (const path of [
    "managerPushDevices/forged", `${root}/managerReminderDeliveries/forged`,
    `${root}/managerNotificationEvents/forged`, `${root}/publicOfferTokens/token`,
    `${root}/checklistRuns/run`, `${root}/checklistSettings/default`,
    `${root}/properties/property/checklistSettings/default`,
    `${root}/jobs/job/checklistRuns/run`, `${root}/jobs/job/checklistRuns/run/photos/photo`,
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
