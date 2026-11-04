import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { cleanerPushDisplay } from "../src/features/notifications/cleanerPushBinding.js";

for (const [name, expected] of Object.entries({
  GCLOUD_PROJECT: "demo-cleanflow",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:18180",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19180",
})) assert.equal(process.env[name], expected, `Cleaner push security tests require local ${name}`);
process.env.AUTOMATIC_OFFERS_MODE = "enabled";

const { initializeApp } = await import("firebase-admin/app");
initializeApp({ projectId: "demo-cleanflow" });
const {
  assignCleanerDirectly, createAutomaticJobOffers, deactivateCleanerPushDevice, getCleanerPushDeviceStatus,
  issueCleanerAccessCode, listNotificationInbox, openNotificationInboxItem, redeemCleanerAccessCode,
  registerCleanerPushDevice, respondToMyOffer, revokeCleanerHubAccess,
} = await import("../functions/src/index.js");
const { processCleanerNotification } = await import("../functions/src/cleanerPushDelivery.js");
const { recordCleanerJobInboxEvents, recordCleanerOfferInboxEvent } = await import("../functions/src/cleanerNotificationEvents.js");
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

const jobReference = (jobId) => functionDatabase.doc(`${root}/jobs/${jobId}`);
const inboxReference = (cleanerId) => functionDatabase.collection(`${root}/cleanerNotificationInboxes/${cleanerId}/items`);
const receiptReference = (eventId) => functionDatabase.doc(`${root}/cleanerNotificationDeliveries/${eventId}`);
const open = (auth, id) => openNotificationInboxItem.run(cleaner(auth, { role: "CLEANER", id }));
const list = (auth) => listNotificationInbox.run(cleaner(auth, { role: "CLEANER" }));
const dispatch = (cleanerId, eventId, sendFcm, org = organizationId) => processCleanerNotification({
  database: functionDatabase, organizationId: org, cleanerId, eventId, sendFcm,
});

async function createJob(jobId) {
  const job = jobReference(jobId);
  await job.set({
    organizationId, schemaVersion: 2, propertyName: "Synthetic property marker",
    operationalStatus: "UNASSIGNED", assignedCleanerIds: [], checklistContextRevision: 0,
    scheduledDate: "2026-11-18", scheduledStart: "10:30",
  });
  return job;
}

async function assignAndRecord(jobId, cleanerId) {
  const job = await createJob(jobId);
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


test("two overlapping automatic offer batches survive partial provider outcomes and only the current recipient can open", async () => {
  const primary = await link(cleanerA);
  const secondary = await link(cleanerA, true);
  const other = await link(cleanerB);
  const first = await register(primary, installationA);
  const second = await register(secondary, installationB);

  const jobIds = ["synthetic-auto-offer-a", "synthetic-auto-offer-b"];
  const jobs = await Promise.all(jobIds.map(createJob));
  await Promise.all(jobIds.map((jobId) => createAutomaticJobOffers.run(manager({ jobId, cleanerIds: [cleanerA, cleanerB] }))));
  const beforeAward = await Promise.all(jobs.map((job) => job.get()));
  for (const job of jobs) {
    for (const cleanerId of [cleanerA, cleanerB]) {
      const offer = await job.collection("offers").doc(cleanerId).get();
      const args = { organizationId, jobId: job.id, offerId: cleanerId, after: offer };
      assert.equal(await recordCleanerOfferInboxEvent(functionDatabase, args), 1);
      assert.equal(await recordCleanerOfferInboxEvent(functionDatabase, args), 0);
    }
  }
  const offers = (await inboxReference(cleanerA).where("type", "==", "NEW_OFFER").get()).docs;
  assert.equal(offers.length, 2);
  const event = offers.find((item) => item.data().jobId === jobs[0].id);
  const attempts = [];
  const partialProvider = async (messages) => {
    attempts.push(messages);
    return {
      responses: [
        { success: true, messageId: "synthetic-provider-accepted" },
        { success: false, error: { code: "messaging/network-error" } },
      ],
      successCount: 1, failureCount: 1,
    };
  };
  assert.deepEqual(await dispatch(cleanerA, event.id, partialProvider), { deliveryStatus: "PARTIAL" });
  await dispatch(cleanerA, event.id, partialProvider);
  await dispatch(cleanerB, event.id, partialProvider);
  await dispatch(cleanerA, event.id, partialProvider, "foreign-synthetic-org");
  assert.equal(attempts.length, 1);
  const [messageA, messageB] = attempts[0];
  assert.deepEqual([messageA.data.cleanerBindingId, messageB.data.cleanerBindingId], [first.bindingId, second.bindingId]);
  const delivery = (await receiptReference(event.id).get()).data();
  assert.deepEqual([delivery.acceptedByFcmDevices, delivery.rejectedDevices, delivery.unknownDevices], [1, 0, 1]);
  assert.ok(!delivery.stages.some((stage) => ["CLIENT_RECEIVED", "DISPLAYED", "OPENED"].includes(stage)));
  assert.equal(cleanerPushDisplay({ data: messageA.data }, null), null);
  assert.equal(cleanerPushDisplay({ data: messageA.data }, { bindingId: second.bindingId }), null);
  const simulatedDisplay = cleanerPushDisplay({ data: messageA.data }, { bindingId: first.bindingId, language: "pt" });
  assert.equal(simulatedDisplay.options.tag, `cleanflow-cleaner-${event.id}`);
  assert.doesNotMatch(JSON.stringify(simulatedDisplay), /Synthetic property marker|synthetic-auto-offer|synthetic-cleaner/);
  assert.deepEqual(await open(other, event.id), { state: "unavailable", destination: null });
  assert.deepEqual(await open(primary, event.id), { state: "opened", destination: { kind: "OFFER", jobId: jobs[0].id } });
  assert.equal((await list(secondary)).items.find(({ id }) => id === event.id).read, true);

  const accept = (auth, jobId) => respondToMyOffer.run(cleaner(auth, { jobId, status: "ACCEPTED" }));
  assert.equal((await accept(primary, jobs[0].id)).state, "assigned");
  assert.equal((await accept(other, jobs[0].id)).state, "already-taken");
  const competing = await Promise.all([accept(secondary, jobs[1].id), accept(other, jobs[1].id)]);
  assert.deepEqual(competing.map(({ state }) => state).sort(), ["already-taken", "assigned"]);
  for (const [index, job] of jobs.entries()) {
    const args = {
      organizationId, jobId: job.id, eventId: `synthetic-award-${index}`,
      before: beforeAward[index], after: await job.get(),
    };
    assert.equal(await recordCleanerJobInboxEvents(functionDatabase, args), 1);
    assert.equal(await recordCleanerJobInboxEvents(functionDatabase, args), 0);
    assert.equal((await job.collection("assignments").get()).size, 1);
    assert.equal((await job.collection("managerNotificationDeliveries").get()).size, 1);
  }

  const assigned = (await inboxReference(cleanerA).where("type", "==", "AUTO_ASSIGNED").get()).docs
    .find((item) => item.data().jobId === jobs[0].id);
  const acceptedProvider = async (messages) => {
    attempts.push(messages);
    return { responses: messages.map(() => ({ success: true, messageId: "synthetic-award-accepted" })),
      successCount: messages.length, failureCount: 0 };
  };
  assert.deepEqual(await dispatch(cleanerA, assigned.id, acceptedProvider), { deliveryStatus: "FCM_ACCEPTED" });
  assert.deepEqual(await open(primary, assigned.id), { state: "opened", destination: { kind: "JOB", jobId: jobs[0].id } });
  assert.deepEqual(await open(other, assigned.id), { state: "unavailable", destination: null });
  assert.deepEqual(await open(primary, event.id), { state: "unavailable", destination: null });
  assert.equal(attempts.length, 2);
});

test("rotation in flight preserves the replacement; delayed cancelled and revoked assignments cannot target a device", async () => {
  const first = await link(cleanerA);
  const second = await link(cleanerA, true);
  const previous = await register(first, installationA);
  await register(second, installationB);
  const event = await assignAndRecord("synthetic-rotate-in-flight", cleanerA);
  let attempts = 0;
  const rotated = { ...installationA, token: `${installationA.token}-replacement` };
  const ambiguousProvider = async (messages) => {
    attempts += 1;
    assert.equal(messages[0].token, installationA.token);
    const replacement = await register(first, rotated);
    assert.equal(replacement.registrationRevision, previous.registrationRevision + 1);
    assert.equal(cleanerPushDisplay({ data: messages[0].data }, { bindingId: replacement.bindingId }), null);
    return {
      responses: [
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: false, error: { code: "messaging/server-unavailable" } },
      ],
      successCount: 0, failureCount: 2,
    };
  };
  assert.deepEqual(await dispatch(cleanerA, event.id, ambiguousProvider), { deliveryStatus: "UNKNOWN" });
  assert.deepEqual(await status(first, rotated), { state: "active", registrationRevision: previous.registrationRevision + 1 });
  assert.deepEqual(await deactivate(first, installationA, previous), { deactivated: false });
  const result = (await receiptReference(event.id).get()).data();
  assert.deepEqual([result.rejectedDevices, result.unknownDevices, result.invalidated], [1, 1, 0]);
  await dispatch(cleanerA, event.id, ambiguousProvider);

  const cancelled = await assignAndRecord("synthetic-cancel-before-dispatch", cleanerA);
  await jobReference(cancelled.data().jobId).update({ archivedAt: new Date(), checklistContextRevision: 2 });
  assert.deepEqual(await dispatch(cleanerA, cancelled.id, ambiguousProvider), { skipped: "STALE_EVENT" });
  assert.deepEqual(await open(first, cancelled.id), { state: "unavailable", destination: null });
  const row = (await list(first)).items.find(({ id }) => id === cancelled.id);
  assert.deepEqual([row.serviceLabel, row.openable], [null, false]);

  const revoked = await assignAndRecord("synthetic-revoke-before-dispatch", cleanerA);
  await revokeCleanerHubAccess.run(manager({ cleanerId: cleanerA }));
  assert.deepEqual(await dispatch(cleanerA, revoked.id, ambiguousProvider), { skipped: "RECIPIENT_INELIGIBLE" });
  await assert.rejects(open(second, event.id), { code: "permission-denied" });
  await assert.rejects(list(first), { code: "permission-denied" });
  assert.equal(attempts, 1);
});
