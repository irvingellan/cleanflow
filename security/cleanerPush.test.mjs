import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";

for (const [name, expected] of Object.entries({
  GCLOUD_PROJECT: "demo-cleanflow",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:18180",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19180",
})) assert.equal(process.env[name], expected, `Cleaner push security tests require local ${name}`);

const { initializeApp } = await import("firebase-admin/app");
initializeApp({ projectId: "demo-cleanflow" });
const {
  assignCleanerDirectly, deactivateCleanerPushDevice, getCleanerPushDeviceStatus,
  issueCleanerAccessCode, redeemCleanerAccessCode, registerCleanerPushDevice, revokeCleanerHubAccess,
} = await import("../functions/src/index.js");
const { processCleanerNotification } = await import("../functions/src/cleanerPushDelivery.js");
const { recordCleanerJobInboxEvents } = await import("../functions/src/cleanerNotificationEvents.js");
const functionDatabase = createRequire(new URL("../functions/src/index.js", import.meta.url))("firebase-admin/firestore").getFirestore();

const organizationId = "cleanflow-demo";
const root = `organizations/${organizationId}`;
const cleanerA = "synthetic-cleaner-a";
const cleanerB = "synthetic-cleaner-b";
const installationA = {
  deviceId: "synthetic-cleaner-installation-android",
  token: "synthetic-never-sent-registration-token-android",
  platform: "android", permission: "granted", language: "pt",
};
const installationB = {
  deviceId: "synthetic-cleaner-installation-ios-pwa",
  token: "synthetic-never-sent-registration-token-ios-pwa",
  platform: "ios-pwa", permission: "granted", language: "en",
};
let environment;

const manager = (data) => ({ auth: { uid: "synthetic-manager", token: { firebase: { sign_in_provider: "password" } } }, data });
const cleaner = (auth, data) => ({ auth, data });
const ownPath = (auth) => `${root}/cleanerPushAccounts/${auth.uid}/devices/${auth.token.cleanerHub.sessionId}`;
const claimPath = (collection, value) => `${collection}/${createHash("sha256").update(value).digest("hex")}`;

async function link(cleanerId, additionalDevice = false) {
  const { code } = await issueCleanerAccessCode.run(manager({ cleanerId, additionalDevice }));
  const { token } = await redeemCleanerAccessCode.run({ data: { code } });
  const jwt = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  return { uid: jwt.uid, token: { firebase: { sign_in_provider: "custom" }, cleanerHub: jwt.claims.cleanerHub } };
}

const register = (auth, data) => registerCleanerPushDevice.run(cleaner(auth, data));
const status = (auth, { deviceId }) => getCleanerPushDeviceStatus.run(cleaner(auth, { deviceId }));
const deactivate = (auth, { deviceId, token }, { registrationRevision }, reason = "SIGNED_OUT") =>
  deactivateCleanerPushDevice.run(cleaner(auth, { deviceId, token, registrationRevision, reason }));

async function assignAndRecord(jobId, cleanerId) {
  const job = functionDatabase.doc(`${root}/jobs/${jobId}`);
  await job.set({
    organizationId, schemaVersion: 2, propertyName: "Synthetic property marker",
    operationalStatus: "UNASSIGNED", assignedCleanerIds: [], checklistContextRevision: 0,
  });
  const before = await job.get();
  await assignCleanerDirectly.run(manager({ jobId, cleanerId }));
  const after = await job.get();
  const payload = { organizationId, jobId, before, after, eventId: `synthetic-assign-${jobId}` };
  assert.equal(await recordCleanerJobInboxEvents(functionDatabase, payload), 1);
  assert.equal(await recordCleanerJobInboxEvents(functionDatabase, payload), 0);
  const snapshot = await functionDatabase.collection(`${root}/cleanerNotificationInboxes/${cleanerId}/items`).where("jobId", "==", jobId).get();
  assert.equal(snapshot.size, 1);
  return snapshot.docs[0];
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
  await Promise.all([
    functionDatabase.doc(`${root}/members/synthetic-manager`).set({ active: true, role: "MANAGER" }),
    functionDatabase.doc(`${root}/cleaners/${cleanerA}`).set({ active: true, name: "Synthetic A", organizationId }),
    functionDatabase.doc(`${root}/cleaners/${cleanerB}`).set({ active: true, name: "Synthetic B", organizationId }),
  ]);
});

test("additional-device Hub sessions coexist, enrollment paths are private, and stale cleanup is exact", async () => {
  const firstAuth = await link(cleanerA);
  const secondAuth = await link(cleanerA, true);
  assert.equal(firstAuth.uid, secondAuth.uid);
  assert.notEqual(firstAuth.token.cleanerHub.sessionId, secondAuth.token.cleanerHub.sessionId);
  await assert.rejects(registerCleanerPushDevice.run(manager(installationA)), { code: "permission-denied" });
  await assert.rejects(register({ ...firstAuth, token: {
    ...firstAuth.token, cleanerHub: { ...firstAuth.token.cleanerHub, organizationId: "other-synthetic-org" },
  } }, installationA), { code: "permission-denied" });
  const first = await register(firstAuth, installationA);
  const second = await register(secondAuth, installationB);
  assert.notEqual(first.bindingId, second.bindingId);
  assert.deepEqual(await register(firstAuth, installationA), first);
  const client = environment.authenticatedContext(firstAuth.uid, firstAuth.token).firestore();
  const managerClient = environment.authenticatedContext("synthetic-manager", manager({}).auth.token).firestore();
  for (const db of [client, managerClient]) {
    for (const path of [
      ownPath(firstAuth), ownPath(secondAuth), claimPath("cleanerPushTokenClaims", installationA.token),
      claimPath("cleanerPushInstallationClaims", installationA.deviceId),
    ]) {
      await assertFails(db.doc(path).get());
      await assertFails(db.doc(path).update({ active: false }));
    }
  }

  const rotated = { ...installationA, token: `${installationA.token}-rotated` };
  const next = await register(firstAuth, rotated);
  assert.equal(next.registrationRevision, first.registrationRevision + 1);
  assert.deepEqual(await deactivate(firstAuth, installationA, first), { deactivated: false });
  assert.deepEqual(await status(firstAuth, installationA), { state: "active", registrationRevision: next.registrationRevision });
  assert.deepEqual(await deactivateCleanerPushDevice.run(cleaner(firstAuth, {
    deviceId: rotated.deviceId, registrationRevision: next.registrationRevision, reason: "PERMISSION_REVOKED",
  })), { deactivated: true });
  assert.deepEqual(await status(firstAuth, installationA), { state: "permission-revoked", registrationRevision: next.registrationRevision });
  assert.deepEqual(await status(secondAuth, installationB), { state: "active", registrationRevision: second.registrationRevision });

  const otherAuth = await link(cleanerB);
  const switched = { ...installationB, token: `${installationB.token}-new-account` };
  await register(otherAuth, switched);
  assert.deepEqual(await status(secondAuth, installationB), { state: "superseded", registrationRevision: second.registrationRevision });
  await deactivate(secondAuth, installationB, second);
  assert.deepEqual(await status(otherAuth, switched), { state: "active", registrationRevision: 1 });

  await revokeCleanerHubAccess.run(manager({ cleanerId: cleanerA }));
  for (const auth of [firstAuth, secondAuth]) {
    await assert.rejects(status(auth, installationA), { code: "permission-denied" });
    await assert.rejects(register(auth, installationA), { code: "permission-denied" });
  }
});

test("a real Inbox event fans out only to authorized current sessions through an injected transport, once", async () => {
  const firstAuth = await link(cleanerA);
  const secondAuth = await link(cleanerA, true);
  const otherAuth = await link(cleanerB);
  const first = await register(firstAuth, installationA);
  const second = await register(secondAuth, installationB);
  await register(otherAuth, { ...installationB, deviceId: "synthetic-other-cleaner-install", token: `${installationB.token}-other` });
  const event = await assignAndRecord("synthetic-job-with-inbox", cleanerA);
  const calls = [];
  const sendFcm = async (messages) => {
    calls.push(messages);
    return {
      responses: [
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: true, messageId: "synthetic-accepted" },
      ],
      successCount: 1, failureCount: 1,
    };
  };
  const dispatch = () => processCleanerNotification({
    database: functionDatabase, organizationId, cleanerId: cleanerA, eventId: event.id, sendFcm,
  });
  await Promise.all([dispatch(), dispatch()]);
  await dispatch();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].map((message) => [message.token, message.data.cleanerBindingId]), [
    [installationA.token, first.bindingId], [installationB.token, second.bindingId],
  ]);
  for (const { data, notification } of calls[0]) {
    assert.equal(notification, undefined);
    assert.equal(data.link, "/agenda");
    assert.equal(data.eventId, event.id);
    assert.doesNotMatch(JSON.stringify(data), /synthetic-job-with-inbox|Synthetic property marker|synthetic-cleaner/);
  }
  assert.deepEqual(await status(firstAuth, installationA), { state: "invalidated", registrationRevision: first.registrationRevision });
  assert.deepEqual(await status(secondAuth, installationB), { state: "active", registrationRevision: second.registrationRevision });
  const receipt = functionDatabase.doc(`${root}/cleanerNotificationDeliveries/${event.id}`);
  const result = (await receipt.get()).data();
  assert.deepEqual([result.deliveryStatus, result.targetDeviceCount, result.acceptedByFcmDevices, result.rejectedDevices, result.unknownDevices],
    ["PARTIAL", 2, 1, 1, 0]);
  assert.doesNotMatch(JSON.stringify(result), /never-sent-registration-token|synthetic-accepted/);
  assert.equal((await event.ref.get()).data().processingState, "STORED");
  const client = environment.authenticatedContext(firstAuth.uid, firstAuth.token).firestore();
  await assertFails(client.doc(receipt.path).get());

  await revokeCleanerHubAccess.run(manager({ cleanerId: cleanerA }));
  const afterRevoke = await assignAndRecord("synthetic-job-after-access-ended", cleanerA);
  assert.deepEqual(await processCleanerNotification({
    database: functionDatabase, organizationId, cleanerId: cleanerA, eventId: afterRevoke.id, sendFcm,
  }), { skipped: "RECIPIENT_INELIGIBLE" });
  assert.equal(calls.length, 1);
  assert.equal((await afterRevoke.ref.get()).data().processingState, "STORED");
});
