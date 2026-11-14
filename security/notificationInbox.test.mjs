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
process.env.AUTOMATIC_OFFERS_MODE = "enabled";

const requireFromFunctions = createRequire(new URL("../functions/src/index.js", import.meta.url));
const { getFirestore, Timestamp } = requireFromFunctions("firebase-admin/firestore");
const {
  assignCleanerDirectly, createAutomaticJobOffers, listNotificationInbox, markNotificationRead,
  openNotificationInboxItem, processManagerReminderWindow, respondToMyOffer,
  syncCleanerAgendaOnJobWrite, syncCleanerAgendaOnOfferWrite,
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
  assert.deepEqual(await listNotificationInbox.run(cleaner("carla")), { items: [], unreadCount: 0, hasOlder: false, nextCursor: null });
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

test("rollback gates all Inbox callables while keeping the durable event and its authorized session", async () => {
  const jobId = "rollback-keeps-inbox-data";
  const originalMode = process.env.NOTIFICATION_INBOX_MODE;
  try {
    process.env.NOTIFICATION_INBOX_MODE = "enabled";
    await writeJob(jobId);
    const before = await job(jobId).get();
    await assignCleanerDirectly.run(manager("manager", { jobId, cleanerId: "ana" }));
    assert.equal(await jobTransition(jobId, "rollback-assignment", before, await job(jobId).get()), 1);
    const { items: [{ id }] } = await listNotificationInbox.run(cleaner("ana"));
    const item = admin.doc(`${org.path}/cleanerNotificationInboxes/ana/items/${id}`);
    const receipt = admin.doc(`${org.path}/notificationInboxReadStates/uid-ana/items/${id}`);

    process.env.NOTIFICATION_INBOX_MODE = "disabled";
    for (const endpoint of [listNotificationInbox, markNotificationRead, openNotificationInboxItem]) {
      await assert.rejects(async () => endpoint.run(cleaner("ana", { id })), { code: "failed-precondition" });
    }
    assert.equal((await item.get()).exists, true);
    assert.equal((await receipt.get()).exists, false);

    process.env.NOTIFICATION_INBOX_MODE = "enabled";
    assert.deepEqual(await openNotificationInboxItem.run(cleaner("ana", { id })), {
      state: "opened", destination: { kind: "JOB", jobId },
    });
    assert.equal((await receipt.get()).exists, true);
  } finally {
    if (originalMode === undefined) delete process.env.NOTIFICATION_INBOX_MODE;
    else process.env.NOTIFICATION_INBOX_MODE = originalMode;
  }
});

test("an unversioned automatic award retains its single manager event and per-manager reading", async () => {
  await writeJob("first-accept", { operationalStatus: "OFFERED", offerDistributionMode: "FIRST_ACCEPT_WINS" });
  const offers = job("first-accept").collection("offers");
  const endsTomorrow = Timestamp.fromMillis(Date.now() + 86_400_000);
  await Promise.all(["ana", "bia"].map((cleanerId) => offers.doc(cleanerId).set({
    organizationId, jobId: "first-accept", cleanerId, cleanerName: cleanerId, status: "PENDING",
    offerDistributionMode: "FIRST_ACCEPT_WINS", offeredChecklistContextRevision: 0, publicOfferExpiresAt: endsTomorrow,
  })));
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

test("versioned batch writes one confirmation for each assignment and one filled notice, with no replay duplicates", async () => {
  const jobId = "auto-two-slot-notices";
  const target = job(jobId);
  const delivery = target.collection("managerNotificationDeliveries");
  await writeJob(jobId, { requiredCleanerCount: 2 });
  await createAutomaticJobOffers.run(manager("manager", { jobId, cleanerIds: ["ana", "bia", "carla"] }));
  const offered = await target.get();
  assert.deepEqual(await respondToMyOffer.run(cleaner("ana", { jobId, status: "ACCEPTED" })), { state: "assigned", status: "ACCEPTED" });
  const partial = await target.get();
  const { items: initialItems } = await listNotificationInbox.run(manager("manager"));
  assert.equal(initialItems.length, 1);
  assert.deepEqual([initialItems[0].type, initialItems[0].openable, initialItems[0].automaticOffer], [
    "AUTO_ASSIGNMENT_CONFIRMED", true,
    { cleanerLabel: "ana", scheduledDate: "2026-11-04", scheduledStart: "10:30" },
  ]);

  assert.deepEqual(await respondToMyOffer.run(cleaner("bia", { jobId, status: "ACCEPTED" })), { state: "assigned", status: "ACCEPTED" });
  const filled = await target.get();
  // Trigger redelivery repeats the same assignment event, but not its inbox item.
  for (const [eventId, before, after] of [["first-committed-acceptance", offered, partial], ["second-committed-acceptance", partial, filled]]) {
    const counts = await Promise.all([
      jobTransition(jobId, eventId, before, after),
      jobTransition(jobId, eventId, before, after),
    ]);
    assert.deepEqual(counts.sort(), [0, 1]);
  }
  for (const id of ["ana", "bia"]) {
    assert.deepEqual(await respondToMyOffer.run(cleaner(id, { jobId, status: "ACCEPTED" })), { state: "assigned", status: "ACCEPTED" });
    const { items } = await listNotificationInbox.run(cleaner(id));
    assert.deepEqual(items.map(({ type }) => type), ["AUTO_ASSIGNED"]);
  }
  assert.equal((await respondToMyOffer.run(cleaner("carla", { jobId, status: "ACCEPTED" }))).state, "already-taken");
  assert.equal((await listNotificationInbox.run(cleaner("carla"))).items.length, 0);

  const { items, unreadCount } = await listNotificationInbox.run(manager("manager"));
  assert.equal(unreadCount, 3);
  assert.equal(new Set(items.map(({ id }) => id)).size, 3);
  assert.deepEqual(items.map(({ type }) => type).sort(), [
    "AUTO_ASSIGNMENT_CONFIRMED", "AUTO_ASSIGNMENT_CONFIRMED", "AUTO_OFFER_BATCH_FILLED",
  ]);
  assert.deepEqual(items.map(({ automaticOffer }) => automaticOffer.cleanerLabel ?? "").sort(), ["", "ana", "bia"]);
  assert.doesNotMatch(JSON.stringify(items), /PRIVATE_GUEST|clientPrice|assignmentId|offerId/);
  const filledNotice = items.find(({ type }) => type === "AUTO_OFFER_BATCH_FILLED");
  assert.deepEqual(filledNotice.automaticOffer, { scheduledDate: "2026-11-04", scheduledStart: "10:30" });
  assert.deepEqual(await openNotificationInboxItem.run(manager("manager", { id: filledNotice.id })), {
    state: "opened", destination: { kind: "JOB", jobId },
  });
  assert.equal((await listNotificationInbox.run(manager("manager"))).unreadCount, 2);
  assert.equal((await listNotificationInbox.run(manager("second-manager"))).unreadCount, 3);

  const rows = (await delivery.get()).docs.map((snapshot) => snapshot.data());
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(({ eventType }) => eventType).sort(), [
    "AUTO_ASSIGNMENT_CONFIRMED", "AUTO_ASSIGNMENT_CONFIRMED", "AUTO_OFFER_BATCH_FILLED",
  ]);
  assert.ok(rows.every(({ deliveryStatus }) => deliveryStatus === "PENDING"));
  assert.equal((await target.collection("assignments").get()).size, 2);
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

  // Persisted pre-feature schedule records remain readable without inventing
  // an actionable confirmation for either historical event.
  const beforeArchive = await listNotificationInbox.run(cleaner("ana"));
  const moves = beforeArchive.items.filter(({ type }) => type === "RESCHEDULED");
  assert.equal(moves.length, 2);
  assert.ok(moves.every(({ reschedule }) => reschedule == null));

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

test("an operator pilot test notice reaches only its cleaner, needs no Job and stays read-only", async () => {
  const id = "e".repeat(64);
  const record = {
    eventId: id, organizationId, cleanerId: "ana", type: "PUSH_TEST", eventVersion: 1,
    processingState: "STORED", priority: "HIGH", transitionKey: "operator-test", createdAt: Timestamp.now(),
  };
  const client = environment.authenticatedContext("uid-ana", {
    firebase: { sign_in_provider: "custom" }, cleanerHub: { organizationId, cleanerId: "ana", sessionId: "session-1" },
  }).firestore();
  const { createdAt: _serverTime, ...clientRecord } = record;
  await assertFails(client.doc(`organizations/${organizationId}/cleanerNotificationInboxes/ana/items/${id}`).set(clientRecord));
  await org.collection("cleanerNotificationInboxes").doc("ana").collection("items").doc(id).set(record);

  const pushTarget = await admin.runTransaction(
    (transaction) => notificationDestination(transaction, org, record, { organizationId, cleanerId: "ana" }, { forPush: true }),
    { readOnly: true },
  );
  assert.deepEqual(pushTarget, { kind: "INBOX" });
  const listed = await listNotificationInbox.run(cleaner("ana"));
  assert.deepEqual(listed.items.map(({ id: itemId, type, openable, read }) => ({ itemId, type, openable, read })),
    [{ itemId: id, type: "PUSH_TEST", openable: false, read: false }]);
  assert.deepEqual(await openNotificationInboxItem.run(cleaner("ana", { id })), { state: "unavailable", destination: null });
  assert.deepEqual(await markNotificationRead.run(cleaner("ana", { id })), { state: "read" });
  assert.equal((await listNotificationInbox.run(cleaner("ana"))).items[0].read, true);
  assert.equal((await listNotificationInbox.run(cleaner("bia"))).items.length, 0);
  assert.equal((await listNotificationInbox.run(manager("manager"))).items.length, 0);
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

function countInboxReads() {
  const counts = { queryRows: 0, documents: 0, operations: 0, jobs: 0, offers: 0 };
  const note = (reference) => {
    counts.documents += 1;
    if (/\/jobs\/[^/]+$/.test(reference.path)) counts.jobs += 1;
    if (/\/jobs\/[^/]+\/offers\/[^/]+$/.test(reference.path)) counts.offers += 1;
  };
  return {
    counts,
    database: {
      collection: (...args) => admin.collection(...args),
      doc: (...args) => admin.doc(...args),
      runTransaction: (handler, options) => admin.runTransaction((transaction) => handler({
        get: async (reference) => {
          counts.operations += 1;
          const result = await transaction.get(reference);
          if (Array.isArray(result.docs)) counts.queryRows += result.size;
          else note(reference);
          return result;
        },
        getAll: (...references) => {
          counts.operations += 1;
          references.forEach(note);
          return transaction.getAll(...references);
        },
      }), options),
    },
  };
}

async function seedInboxHistory(size) {
  const { inboxEventId, inboxEventRecord } = await import("../functions/src/notificationInboxEvents.js");
  const batch = admin.batch();
  for (let index = 0; index < 10; index += 1) {
    const jobId = `scale-job-${index}`;
    const assigned = index >= 5;
    batch.set(job(jobId), {
      organizationId, schemaVersion: 2, propertyName: "Synthetic Inbox Scale",
      operationalStatus: assigned ? "ASSIGNED" : "OFFERED", assignedCleanerIds: assigned ? ["ana"] : [],
    });
    if (!assigned) batch.set(job(jobId).collection("offers").doc("ana"), {
      organizationId, jobId, cleanerId: "ana", status: "PENDING",
      publicOfferTokenHash: "synthetic-inbox-scale-hash",
      publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    });
  }
  const managerInbox = org.collection("managerNotificationInbox");
  const cleanerInbox = org.collection("cleanerNotificationInboxes").doc("ana").collection("items");
  for (let index = 0; index < size; index += 1) {
    const jobIndex = index % 10;
    const jobId = `scale-job-${jobIndex}`;
    // Many rows have an exactly equal timestamp. A cursor needs the document ID tiebreaker.
    const createdAt = new Timestamp(1_700_000_000 + Math.floor(index / 20), index % 2);
    const managerId = inboxEventId("manager-scale", index);
    const cleanerId = inboxEventId("cleaner-scale", index);
    batch.create(managerInbox.doc(managerId), inboxEventRecord({
      eventId: managerId, organizationId, jobId, type: "CLEANER_INTERESTED", createdAt,
    }));
    batch.create(cleanerInbox.doc(cleanerId), inboxEventRecord({
      eventId: cleanerId, organizationId, cleanerId: "ana", jobId,
      type: jobIndex < 5 ? "NEW_OFFER" : "RESCHEDULED", createdAt,
      ...(jobIndex < 5 ? { offerId: "ana", offerGeneration: "legacy" } : {}),
    }));
  }
  await batch.commit();
}

test("Inbox listing batches repeated Jobs and offers and bounds an explicit first page", async (context) => {
  await seedInboxHistory(200);
  const { listNotificationInboxForRequest } = await import("../functions/src/notificationInbox.js");
  const results = [];
  for (const [name, request] of [
    ["manager-default", manager("manager")],
    ["cleaner-default", cleaner("ana")],
    ["cleaner-page-25", cleaner("ana", { pageSize: 25 })],
  ]) {
    const rounds = [];
    for (let round = 0; round < 2; round += 1) {
      const { counts, database } = countInboxReads();
      const start = performance.now();
      const page = await listNotificationInboxForRequest(database, { organizationId, request });
      rounds.push({ ms: Math.round(performance.now() - start), ...counts, returned: page.items.length });
    }
    results.push(rounds[0]);
    context.diagnostic(`${name} first/repeat ${JSON.stringify(rounds)}`);
  }
  assert.deepEqual(results.map(({ returned, queryRows, jobs, offers, operations }) => (
    { returned, queryRows, jobs, offers, operations }
  )), [
    { returned: 100, queryRows: 101, jobs: 10, offers: 0, operations: 3 },
    { returned: 100, queryRows: 101, jobs: 10, offers: 5, operations: 5 },
    { returned: 25, queryRows: 26, jobs: 10, offers: 5, operations: 5 },
  ]);
});

test("Inbox cursor pages equal timestamps without duplicates and keeps read receipts consistent across sessions", async () => {
  await seedInboxHistory(120);
  await org.collection("members").doc("uid-ana").update({ sessionIds: ["session-1", "session-2"] });
  const first = await listNotificationInbox.run(cleaner("ana", { pageSize: 25 }));
  assert.equal(first.items.length, 25);
  assert.equal(first.hasOlder, true);
  assert.equal(typeof first.nextCursor, "string");
  const id = first.items[0].id;
  await Promise.all([
    markNotificationRead.run(cleaner("ana", { id })),
    markNotificationRead.run(cleaner("ana", { id }, { sessionId: "session-2" })),
  ]);
  const receipt = await org.collection("notificationInboxReadStates").doc("uid-ana").collection("items").get();
  assert.equal(receipt.size, 1);
  assert.equal((await listNotificationInbox.run(cleaner("ana", { pageSize: 25 }, { sessionId: "session-2" }))).unreadCount, 24);

  const seen = new Set(first.items.map(({ id }) => id));
  let page = first;
  while (page.hasOlder) {
    page = await listNotificationInbox.run(cleaner("ana", { pageSize: 25, cursor: page.nextCursor }));
    for (const { id } of page.items) {
      assert.equal(seen.has(id), false, "A history row repeated across pages");
      seen.add(id);
    }
  }
  assert.equal(page.nextCursor, null);
  assert.equal(seen.size, 120);
  for (const data of [{ cursor: "malformed" }, { pageSize: 101 }, { pageSize: 0 }]) {
    await assert.rejects(listNotificationInbox.run(cleaner("ana", data)), { code: "invalid-argument" });
  }
  const foreign = await listNotificationInbox.run(cleaner("bia", { pageSize: 25, cursor: first.nextCursor }));
  assert.deepEqual(foreign.items, []);
});

test("automatic batch offer creates keep all recipient notices and leave agenda fanout to the atomic Job write", async () => {
  const jobId = "atomic-fanout";
  const jobRef = job(jobId);
  const cleaners = ["ana", "bia", "carla"];
  await writeJob(jobId);
  const beforeJob = await jobRef.get();
  const offerRefs = cleaners.map((id) => jobRef.collection("offers").doc(id));
  const beforeOffers = await admin.getAll(...offerRefs);
  await createAutomaticJobOffers.run(manager("manager", { jobId, cleanerIds: cleaners }));
  const afterJob = await jobRef.get();
  const afterOffers = await admin.getAll(...offerRefs);
  const runOffer = (targetJob, offerId, before, after) => syncCleanerAgendaOnOfferWrite.run({
    id: `synthetic-${offerId}-write`,
    params: { orgId: organizationId, jobId: targetJob, offerId },
    data: { before, after },
  });
  const agenda = org.collection("cleanerAgenda");
  for (let index = 0; index < cleaners.length; index += 1) {
    const recipient = cleaners[index];
    await runOffer(jobId, recipient, beforeOffers[index], afterOffers[index]);
    assert.deepEqual((await listNotificationInbox.run(cleaner(recipient))).items.map(({ type }) => type), ["NEW_OFFER"]);
  }
  assert.equal((await agenda.get()).size, 0, "Initial automatic Offer triggers must not duplicate Job agenda sync");

  await syncCleanerAgendaOnJobWrite.run({
    id: "synthetic-auto-job-write", params: { orgId: organizationId, jobId }, data: { before: beforeJob, after: afterJob },
  });
  assert.equal((await agenda.get()).size, 3);
  await offerRefs[0].update({ status: "REVOKED" });
  await runOffer(jobId, cleaners[0], afterOffers[0], await offerRefs[0].get());
  assert.equal((await agenda.get()).size, 2, "Offer updates still refresh agenda");
  assert.equal((await listNotificationInbox.run(cleaner("ana"))).items[0].openable, false);

  const legacyJobId = "legacy-fanout";
  await writeJob(legacyJobId, { operationalStatus: "OFFERED" });
  const legacyOffer = job(legacyJobId).collection("offers").doc("ana");
  const previousLegacyOffer = await legacyOffer.get();
  await legacyOffer.set({
    jobId: legacyJobId, cleanerId: "ana", status: "PENDING",
    publicOfferTokenHash: "synthetic-legacy-offer-hash", publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  });
  await runOffer(legacyJobId, "ana", previousLegacyOffer, await legacyOffer.get());
  assert.equal((await agenda.get()).size, 3, "Legacy initial Offer writes still refresh agenda");
  assert.equal((await listNotificationInbox.run(cleaner("ana"))).items.filter(({ openable }) => openable).length, 1);
});

test("36 synthetic cleaners retain independent inboxes across 288 real offer events", async (context) => {
  const { listNotificationInboxForRequest } = await import("../functions/src/notificationInbox.js");
  const cleanerIds = Array.from({ length: 36 }, (_, index) => `load-cleaner-${index}`);
  const rounds = 8;
  const workers = 12;
  const syntheticMembers = admin.batch();
  for (const cleanerId of cleanerIds) {
    syntheticMembers.set(org.collection("members").doc(`uid-${cleanerId}`), {
      role: "CLEANER", active: true, organizationId, cleanerId, sessionId: "session-1",
    });
    syntheticMembers.set(org.collection("cleaners").doc(cleanerId), { organizationId, name: cleanerId, active: true });
  }
  await syntheticMembers.commit();

  async function inWaves(items, handle) {
    const results = [];
    for (let start = 0; start < items.length; start += workers) {
      results.push(...await Promise.all(items.slice(start, start + workers).map(handle)));
    }
    return results;
  }

  let agendaSyncs = 0;
  let offerDeliveries = 0;
  const fanoutStarted = performance.now();
  for (let round = 0; round < rounds; round += 1) {
    const jobId = `load-offer-${round}`;
    const jobRef = job(jobId);
    await writeJob(jobId, { propertyName: `Synthetic Offer ${round}` });
    const beforeJob = await jobRef.get();
    const refs = cleanerIds.map((id) => jobRef.collection("offers").doc(id));
    const before = await admin.getAll(...refs);
    await createAutomaticJobOffers.run(manager("manager", { jobId, cleanerIds }));
    const after = await admin.getAll(...refs);
    const events = after.map((snapshot, index) => ({
      id: `synthetic-load-${round}-${index}`, params: { orgId: organizationId, jobId, offerId: snapshot.id },
      data: { before: before[index], after: snapshot },
    }));
    await inWaves(events, (event) => syncCleanerAgendaOnOfferWrite.run(event));
    offerDeliveries += events.length;
    if (round === 0) {
      await inWaves(events, (event) => syncCleanerAgendaOnOfferWrite.run(event));
      offerDeliveries += events.length;
    }
    await syncCleanerAgendaOnJobWrite.run({
      id: `synthetic-load-job-${round}`, params: { orgId: organizationId, jobId },
      data: { before: beforeJob, after: await jobRef.get() },
    });
    agendaSyncs += 1;
  }
  const fanoutMs = Math.round(performance.now() - fanoutStarted);
  assert.equal((await org.collection("cleanerAgenda").get()).size, 288);

  async function loadWave() {
    const { counts, database } = countInboxReads();
    const start = performance.now();
    const requests = await inWaves(cleanerIds, async (cleanerId) => {
      const requestedAt = performance.now();
      const page = await listNotificationInboxForRequest(database, {
        organizationId, request: cleaner(cleanerId, { pageSize: 25 }),
      });
      return { page, ms: performance.now() - requestedAt };
    });
    const duration = Math.round(performance.now() - start);
    const durations = requests.map(({ ms }) => ms).sort((a, b) => a - b);
    const percentile = (rank) => Math.round(durations[Math.ceil(rank * durations.length) - 1]);
    return {
      pages: requests.map(({ page }) => page),
      measurements: { duration, p50: percentile(0.5), p95: percentile(0.95), ...counts },
    };
  }

  const first = await loadWave();
  const distinctIds = new Set(first.pages.flatMap(({ items }) => items.map(({ id }) => id)));
  assert.equal(distinctIds.size, 288);
  assert.ok(first.pages.every((page) => page.items.length === rounds && page.unreadCount === rounds
    && !page.hasOlder && page.items.every(({ type, openable }) => type === "NEW_OFFER" && openable)));

  await inWaves(cleanerIds.slice(0, workers).map((cleanerId, index) => ({ cleanerId, id: first.pages[index].items[0].id })),
    ({ cleanerId, id }) => markNotificationRead.run(cleaner(cleanerId, { id })));
  const refresh = await loadWave();
  assert.deepEqual(refresh.pages.map(({ unreadCount }) => unreadCount),
    cleanerIds.map((_, index) => (index < workers ? rounds - 1 : rounds)));
  assert.ok(refresh.pages.every(({ items }, index) => items.every(({ id }) => first.pages[index].items.some((item) => item.id === id))));
  for (const { measurements } of [first, refresh]) {
    const { queryRows, documents, operations, jobs, offers } = measurements;
    assert.deepEqual({ queryRows, documents, operations, jobs, offers }, {
      queryRows: 288, documents: 936, operations: 180, jobs: 288, offers: 288,
    });
  }
  context.diagnostic(`cleaner load ${JSON.stringify({
    cleaners: cleanerIds.length, events: distinctIds.size, maxConcurrent: workers,
    offerDeliveries, agendaSyncs, fanoutMs, initial: first.measurements, refresh: refresh.measurements,
  })}`);
});
