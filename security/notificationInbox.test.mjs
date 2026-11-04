import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";

const expected = {
  GCLOUD_PROJECT: "demo-cleanflow",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:18180",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19180",
};
for (const [name, value] of Object.entries(expected)) {
  assert.equal(process.env[name], value, `Inbox security tests require local ${name}`);
}

const requireFromFunctions = createRequire(new URL("../functions/src/index.js", import.meta.url));
const { getFirestore, Timestamp } = requireFromFunctions("firebase-admin/firestore");
const {
  assignCleanerDirectly, createAutomaticJobOffers, listNotificationInbox, markNotificationRead,
  openNotificationInboxItem, processManagerReminderWindow, respondToMyOffer,
} = await import("../functions/src/index.js");
const { recordCleanerJobInboxEvents, recordCleanerOfferInboxEvent } = await import("../functions/src/cleanerNotificationEvents.js");
const { notificationDestination } = await import("../functions/src/notificationInbox.js");

const admin = getFirestore();
const organizationId = "cleanflow-demo";
const org = admin.collection("organizations").doc(organizationId);
let environment;

function manager(uid, data = {}) {
  return { auth: { uid, token: { firebase: { sign_in_provider: "password" } } }, data: { role: "MANAGER", ...data } };
}
function cleaner(cleanerId, data = {}, claims = {}) {
  return {
    auth: {
      uid: `uid-${cleanerId}`,
      token: {
        firebase: { sign_in_provider: "custom" },
        cleanerHub: { organizationId, cleanerId, sessionId: "session-1", ...claims },
      },
    },
    data: { role: "CLEANER", ...data },
  };
}
function job(id) {
  return org.collection("jobs").doc(id);
}
function writeJob(id, extra = {}) {
  return job(id).set({
    organizationId, schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [],
    checklistContextRevision: 0, scheduleRevision: 0, scheduledDate: "2026-11-04", scheduledStart: "10:30",
    propertyName: "Synthetic House", clientPrice: 900, guestName: "PRIVATE_GUEST", ...extra,
  });
}
function jobTransition(id, eventId, beforeSnapshot, afterSnapshot) {
  return recordCleanerJobInboxEvents(admin, {
    organizationId, jobId: id, before: beforeSnapshot, after: afterSnapshot, eventId,
  });
}
function offerTransition(jobId, offerId, beforeSnapshot, afterSnapshot) {
  return recordCleanerOfferInboxEvent(admin, { organizationId, jobId, offerId, before: beforeSnapshot, after: afterSnapshot });
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
  const batch = admin.batch();
  for (const uid of ["manager", "second-manager"]) {
    batch.set(org.collection("members").doc(uid), { role: "MANAGER", active: true });
  }
  for (const cleanerId of ["ana", "bia", "carla"]) {
    batch.set(org.collection("members").doc(`uid-${cleanerId}`), {
      role: "CLEANER", active: true, organizationId, cleanerId, sessionId: "session-1",
    });
    batch.set(org.collection("cleaners").doc(cleanerId), { organizationId, name: cleanerId, active: true });
  }
  batch.set(admin.doc("organizations/foreign/members/outsider"), { role: "MANAGER", active: true });
  await batch.commit();
});

test("offers are durable only in intended cleaner inboxes and replay does not duplicate them", async () => {
  await writeJob("new-offer");
  await createAutomaticJobOffers.run(manager("manager", { jobId: "new-offer", cleanerIds: ["ana", "bia"] }));
  for (const cleanerId of ["ana", "bia"]) {
    const offer = await job("new-offer").collection("offers").doc(cleanerId).get();
    const counts = await Promise.all([
      offerTransition("new-offer", cleanerId, null, offer),
      offerTransition("new-offer", cleanerId, null, offer),
    ]);
    assert.deepEqual(counts.sort(), [0, 1]);
  }

  const ana = await listNotificationInbox.run(cleaner("ana", { cleanerId: "bia" }));
  const bia = await listNotificationInbox.run(cleaner("bia"));
  assert.equal(ana.unreadCount, 1);
  assert.equal(bia.unreadCount, 1);
  assert.notEqual(ana.items[0].id, bia.items[0].id);
  assert.equal(ana.items[0].type, "NEW_OFFER");
  assert.equal(ana.items[0].serviceLabel, "Synthetic House");
  assert.equal(ana.items[0].openable, true);
  assert.equal(JSON.stringify(ana).includes("PRIVATE_GUEST"), false);
  assert.deepEqual(await listNotificationInbox.run(cleaner("carla")), { items: [], unreadCount: 0, hasOlder: false });
  await assert.rejects(listNotificationInbox.run(cleaner("ana", {}, { organizationId: "foreign" })), { code: "permission-denied" });
  await assert.rejects(listNotificationInbox.run(manager("outsider")), { code: "permission-denied" });
  await assert.rejects(listNotificationInbox.run({ data: { role: "CLEANER" } }), { code: "unauthenticated" });

  const id = ana.items[0].id;
  const rawPath = `organizations/${organizationId}/cleanerNotificationInboxes/ana/items/${id}`;
  const dbA = environment.authenticatedContext("uid-ana", cleaner("ana").auth.token).firestore();
  const dbManager = environment.authenticatedContext("manager", manager("manager").auth.token).firestore();
  await assertFails(dbA.doc(rawPath).get());
  await assertFails(dbA.doc(rawPath).set({ type: "ASSIGNED" }));
  await assertFails(dbManager.doc(rawPath).get());
  await assert.rejects(markNotificationRead.run(cleaner("bia", { id })), { code: "not-found" });
  assert.deepEqual(await openNotificationInboxItem.run(cleaner("bia", { id })), { state: "unavailable", destination: null });
  assert.deepEqual(await openNotificationInboxItem.run(cleaner("ana", { id })), {
    state: "opened", destination: { kind: "OFFER", jobId: "new-offer" },
  });
  const readRef = org.collection("notificationInboxReadStates").doc("uid-ana").collection("items").doc(id);
  const first = (await readRef.get()).data();
  assert.ok(first.readAt && first.openedAt);
  await markNotificationRead.run(cleaner("ana", { id }));
  await openNotificationInboxItem.run(cleaner("ana", { id }));
  const second = (await readRef.get()).data();
  assert.ok(first.readAt.isEqual(second.readAt) && first.openedAt.isEqual(second.openedAt));
  assert.equal((await listNotificationInbox.run(cleaner("ana"))).unreadCount, 0);

  await job("new-offer").collection("offers").doc("ana").update({ status: "REVOKED" });
  assert.deepEqual(await openNotificationInboxItem.run(cleaner("ana", { id })), { state: "unavailable", destination: null });
  const stale = (await listNotificationInbox.run(cleaner("ana"))).items[0];
  assert.deepEqual([stale.openable, stale.serviceLabel], [false, null]);

  await org.collection("members").doc("uid-ana").update({ active: false });
  await assert.rejects(listNotificationInbox.run(cleaner("ana")), { code: "permission-denied" });
  await assert.rejects(openNotificationInboxItem.run(cleaner("ana", { id })), { code: "permission-denied" });
});

test("automatic award makes one manager inbox entry with per-manager reading and one cleaner assignment", async () => {
  await writeJob("first-accept");
  await createAutomaticJobOffers.run(manager("manager", { jobId: "first-accept", cleanerIds: ["ana", "bia"] }));
  const beforeJob = await job("first-accept").get();
  const results = await Promise.all(["ana", "bia"].map((id) => respondToMyOffer.run(
    cleaner(id, { jobId: "first-accept", status: "ACCEPTED" }),
  )));
  assert.deepEqual(results.map(({ state }) => state).sort(), ["already-taken", "assigned"]);
  const afterJob = await job("first-accept").get();
  const winner = afterJob.data().assignedCleanerIds[0];
  const loser = winner === "ana" ? "bia" : "ana";
  await respondToMyOffer.run(cleaner(winner, { jobId: "first-accept", status: "ACCEPTED" }));
  const counts = await Promise.all([
    jobTransition("first-accept", "committed-award", beforeJob, afterJob),
    jobTransition("first-accept", "committed-award", beforeJob, afterJob),
  ]);
  assert.deepEqual(counts.sort(), [0, 1]);
  assert.equal((await listNotificationInbox.run(cleaner(winner))).items[0].type, "AUTO_ASSIGNED");
  assert.equal((await listNotificationInbox.run(cleaner(loser))).items.length, 0);

  const managerInbox = await listNotificationInbox.run(manager("manager"));
  assert.equal(managerInbox.items.length, 1);
  assert.equal(managerInbox.items[0].type, "AUTO_ASSIGNMENT_CONFIRMED");
  const id = managerInbox.items[0].id;
  assert.deepEqual(await openNotificationInboxItem.run(manager("manager", { id })), {
    state: "opened", destination: { kind: "JOB", jobId: "first-accept" },
  });
  assert.equal((await listNotificationInbox.run(manager("manager"))).unreadCount, 0);
  assert.equal((await listNotificationInbox.run(manager("second-manager"))).unreadCount, 1);
  assert.equal((await job("first-accept").collection("managerNotificationDeliveries").get()).size, 1);
});

test("reschedule push rejects the superseded revision and cancellation never reopens job details", async () => {
  await writeJob("changes");
  const unassigned = await job("changes").get();
  await assignCleanerDirectly.run(manager("manager", { jobId: "changes", cleanerId: "ana" }));
  const assigned = await job("changes").get();
  assert.equal(await jobTransition("changes", "assignment", unassigned, assigned), 1);

  await job("changes").update({ scheduledStart: "11:00", scheduleRevision: 1, checklistContextRevision: 2 });
  const rescheduled = await job("changes").get();
  assert.equal(await jobTransition("changes", "first-reschedule", assigned, rescheduled), 1);
  await job("changes").update({ scheduledStart: "11:30", scheduleRevision: 2, checklistContextRevision: 3 });
  const rescheduledAgain = await job("changes").get();
  assert.equal(await jobTransition("changes", "second-reschedule", rescheduled, rescheduledAgain), 1);
  assert.equal(await jobTransition("changes", "second-reschedule", rescheduled, rescheduledAgain), 0);

  const inbox = org.collection("cleanerNotificationInboxes").doc("ana").collection("items");
  const records = (await inbox.get()).docs.map((entry) => entry.data());
  const identity = { organizationId, cleanerId: "ana" };
  const pushTarget = (event) => admin.runTransaction(
    (transaction) => notificationDestination(transaction, org, event, identity, { forPush: true }),
    { readOnly: true },
  );
  assert.equal(await pushTarget(records.find((event) => event.scheduleRevision === 1)), null);
  assert.deepEqual(await pushTarget(records.find((event) => event.scheduleRevision === 2)), { kind: "JOB", jobId: "changes" });

  await job("changes").update({ archivedAt: Timestamp.now(), checklistContextRevision: 4 });
  const archived = await job("changes").get();
  assert.equal(await jobTransition("changes", "archive", rescheduledAgain, archived), 1);
  const cancelled = (await inbox.where("type", "==", "CANCELLED").get()).docs[0].data();
  assert.deepEqual(await pushTarget(cancelled), { kind: "INBOX" });
  const listed = await listNotificationInbox.run(cleaner("ana"));
  assert.equal(listed.items.length, 4);
  assert.ok(listed.items.every((item) => !item.openable && item.serviceLabel === null));
  for (const { id } of listed.items) {
    assert.deepEqual(await openNotificationInboxItem.run(cleaner("ana", { id })), { state: "unavailable", destination: null });
  }
});

test("manager 7h and 19h reminder windows persist once without any registered device", async () => {
  const now = new Date("2026-11-04T16:00:00Z");
  await writeJob("today", { scheduledDate: "2026-11-04" });
  await writeJob("tomorrow", { scheduledDate: "2026-11-05" });
  for (const type of ["TODAY_07", "TOMORROW_19"]) {
    await processManagerReminderWindow(type, { now });
    assert.equal((await processManagerReminderWindow(type, { now })).skipped, "already-claimed");
  }
  const feed = await listNotificationInbox.run(manager("manager"));
  assert.deepEqual(feed.items.map(({ type }) => type).sort(), ["TODAY_07", "TOMORROW_19"]);
  assert.ok(feed.items.every((item) => item.openable && item.serviceLabel === null));
  for (const { id } of feed.items) {
    assert.deepEqual(await openNotificationInboxItem.run(manager("manager", { id })), {
      state: "opened", destination: { kind: "DASHBOARD" },
    });
  }
  const deliveries = await org.collection("managerReminderDeliveries").get();
  assert.equal(deliveries.size, 2);
  assert.ok(deliveries.docs.every((entry) => entry.data().deliveryStatus === "NO_ACTIVE_DEVICES"));
});
