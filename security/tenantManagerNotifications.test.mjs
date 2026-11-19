import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const projectId = "demo-cleanflow";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  assert.match(process.env[name] ?? "", /^127\.0\.0\.1:\d+$/, `Local ${name} required`);
}
const require = createRequire(new URL("../functions/src/index.js", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const app = initializeApp({ projectId });
const { db, emulatorPushDisabled } = await import("../functions/src/runtime/firebase.js");
assert.equal(emulatorPushDisabled(), true);
const { defaultOrganizationId } = await import("../functions/src/runtime/organization.js");
const { registrationDocumentId } = await import("../functions/src/notificationLab.js");
const { reportManagerNotificationHealth, sendCurrentManagerTestNotification } = await import("../functions/src/index.js");

// The same browser installation can be shared by different signed-in managers.
const deviceId = randomUUID();
const organizations = [defaultOrganizationId, `test-a-${randomUUID()}`, `test-b-${randomUUID()}`]
  .map(id => {
    const uid = randomUUID();
    const root = db.collection("organizations").doc(id);
    const registrationId = registrationDocumentId(uid, deviceId);
    return {
      root, uid, registrationId,
      member: root.collection("members").doc(uid),
      device: db.collection("managerPushDevices").doc(registrationId),
      health: root.collection("managerNotificationDeviceHealth").doc(registrationId),
      cooldown: root.collection("currentDeviceNotificationTestCooldowns").doc(uid),
      audits: root.collection("currentDeviceNotificationTests"),
    };
  });

function managerRequest(uid, organizationId, data) {
  const token = { firebase: { sign_in_provider: "password" } };
  if (organizationId !== defaultOrganizationId) token.organizationId = organizationId;
  return { auth: { uid, token }, data };
}

const health = { deviceId, notificationPermission: "granted", serviceWorker: "ready",
  fcmRegistration: "registered", platform: "linux", browserClass: "chrome", standalone: false };
const deviceTest = { deviceId, confirm: true };

async function versions() {
  const collections = [db.collection("managerPushDevices")];
  for (const { root } of organizations) {
    for (const name of ["members", "managerNotificationDeviceHealth", "currentDeviceNotificationTestCooldowns", "currentDeviceNotificationTests"]) {
      collections.push(root.collection(name));
    }
  }
  const snapshots = await Promise.all(collections.map(collection => collection.get()));
  return new Map(snapshots.flatMap(snapshot => snapshot.docs.map(doc =>
    [doc.ref.path, [doc.updateTime.seconds, doc.updateTime.nanoseconds]])));
}

function assertCreatedOnly(before, after, references) {
  for (const ref of references) {
    assert.equal(before.has(ref.path), false, `Unexpected existing record at ${ref.path}`);
    assert.equal(after.delete(ref.path), true, `Missing record at ${ref.path}`);
  }
  assert.deepEqual(after, before);
}

before(async () => {
  const batch = db.batch();
  for (const { root, uid, device, member } of organizations) {
    batch.create(member, { role: "MANAGER", active: true });
    batch.create(device, { userId: uid, organizationId: root.id, active: true, token: `synthetic-${randomUUID()}` });
  }
  await batch.commit();
});

after(async () => {
  try {
    const batch = db.batch();
    for (const { uid, device, member, health, cooldown, audits } of organizations) {
      const records = await audits.where("userId", "==", uid).get();
      for (const ref of [device, member, health, cooldown, ...records.docs.map(doc => doc.ref)]) batch.delete(ref);
    }
    await batch.commit();
  } finally {
    await deleteApp(app);
  }
});

for (const [index, label] of ["legacy", "company A", "company B"].entries()) {
  const org = organizations[index];
  test(`${label}: the health report is written to this manager's company`, async () => {
    const before = await versions();
    const result = await reportManagerNotificationHealth.run(managerRequest(org.uid, org.root.id, health));
    assert.deepEqual(result, { recorded: true });
    const record = (await org.health.get()).data();
    assert.equal(record.userId, org.uid);
    assert.equal(record.notificationPermission, "granted");
    assertCreatedOnly(before, await versions(), [org.health]);
  });

  test(`${label}: the device test records one local audit and one manager cooldown`, async () => {
    const before = await versions();
    const result = await sendCurrentManagerTestNotification.run(managerRequest(org.uid, org.root.id, deviceTest));
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.failureCode, "unavailable");
    assert.equal(result.providerAccepted, null);
    assert.equal(result.auditRecorded, true);
    const cooldown = (await org.cooldown.get()).data();
    assert.equal(cooldown.registrationId, org.registrationId);
    const audit = await org.audits.doc(cooldown.lastAuditId).get();
    assert.equal(audit.get("userId"), org.uid);
    assert.equal(audit.get("registrationId"), org.registrationId);
    assert.equal(audit.get("status"), "UNKNOWN");
    assert.equal(audit.get("providerAccepted"), null);
    assertCreatedOnly(before, await versions(), [org.cooldown, audit.ref]);
  });

  test(`${label}: a company claim without an active membership leaves every protected record unchanged`, async () => {
    const before = await versions();
    for (const other of organizations.filter(candidate => candidate !== org)) {
      for (const [callable, data] of [[reportManagerNotificationHealth, health], [sendCurrentManagerTestNotification, deviceTest]]) {
        await assert.rejects(callable.run(managerRequest(other.uid, org.root.id, data)), { code: "permission-denied" });
      }
    }
    assert.deepEqual(await versions(), before);
  });
}
