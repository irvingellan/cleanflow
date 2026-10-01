import { afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  managerOperationalFcmMessages, managerOperationalNotificationEventId,
  managerOperationalNotificationTypes as types, processManagerOperationalNotification,
} from "./managerOperationalNotifications.js";
import { respondToPublicOffer } from "./publicOfferResponseService.js";
import { acknowledgePublicOfferAssignment } from "./publicOfferAssignmentAcknowledgment.js";
import { managerFcmTimeoutMs } from "./managerFcmDelivery.js";

const organizationId = "synthetic-org";
const jobId = "job-a";
const jobPath = `organizations/${organizationId}/jobs/${jobId}`;
const offerPath = `${jobPath}/offers/offer-a`;
const assignmentPath = `${jobPath}/assignments/assignment-a`;
const now = new Date("2026-10-01T12:00:00Z");
const tokenHash = "synthetic-hash-only";
const interestId = managerOperationalNotificationEventId({ organizationId, jobId, eventType: types.interest, offerId: "offer-a" });
const acknowledgmentId = managerOperationalNotificationEventId({
  organizationId, jobId, eventType: types.acknowledgment, offerId: "offer-a", assignmentId: "assignment-a",
});
const eventPath = (id) => `${jobPath}/managerNotificationDeliveries/${id}`;
const batch = (...responses) => ({
  responses, successCount: responses.filter((item) => item.success).length,
  failureCount: responses.filter((item) => !item.success).length,
});
const accepted = () => ({ success: true, messageId: "synthetic-message-id" });

function fixture({ job = {}, offer = {}, assignment = {} } = {}) {
  const documents = new Map([
    [jobPath, { schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"],
      propertyName: "Synthetic property", clientPrice: 900, notes: "private-job-note", ...job }],
    [offerPath, { status: "PENDING", cleanerId: "cleaner-a", publicOfferTokenHash: tokenHash,
      publicOfferExpiresAt: { toMillis: () => now.getTime() + 60_000 }, ...offer }],
    [assignmentPath, { organizationId, jobId, cleanerId: "cleaner-a", sourceOfferId: "offer-a",
      isActive: true, ...assignment }],
    [`organizations/${organizationId}/cleaners/cleaner-a`, { name: "Synthetic cleaner", phone: "private-phone" }],
  ]);
  const snapshot = (path) => ({
    id: path.split("/").at(-1), exists: documents.has(path), ref: reference(path), data: () => documents.get(path),
  });
  function reference(path) {
    return {
      path, id: path.split("/").at(-1),
      collection: (name) => reference(`${path}/${name}`), doc: (id) => reference(`${path}/${id}`),
      get: async () => snapshot(path),
      update: async (patch) => {
        if (!documents.has(path)) throw new Error("Synthetic missing document.");
        documents.set(path, { ...documents.get(path), ...patch });
      },
    };
  }
  let queue = Promise.resolve();
  const database = {
    documents, doc: reference, getAll: async (...refs) => refs.map((ref) => snapshot(ref.path)),
    runTransaction(operation) {
      const result = queue.then(async () => {
        const writes = [];
        const transaction = {
          get: async (ref) => documents.has(ref.path) ? snapshot(ref.path) : {
            ...snapshot(ref.path), docs: [...documents.keys()].filter((path) =>
              path.startsWith(`${ref.path}/`) && !path.slice(ref.path.length + 1).includes("/"))
              .map(snapshot),
          },
          create: (ref, data) => writes.push({ ref, data, create: true }),
          update: (ref, data) => writes.push({ ref, data, create: false }),
        };
        const outcome = await operation(transaction);
        for (const { ref, create } of writes) {
          if (create === documents.has(ref.path)) throw new Error("Synthetic write precondition failed.");
        }
        for (const { ref, data, create } of writes) documents.set(ref.path, create ? data : { ...documents.get(ref.path), ...data });
        return outcome;
      });
      queue = result.catch(() => undefined);
      return result;
    },
  };
  return database;
}

function respond(database, options = {}) {
  return respondToPublicOffer(database, {
    organizationId, jobReference: database.doc(jobPath), offerReference: database.doc(offerPath),
    tokenHash, status: "INTERESTED", now, ...options,
  });
}
function acknowledge(database, options = {}) {
  return acknowledgePublicOfferAssignment(database, {
    organizationId, jobReference: database.doc(jobPath), offerReference: database.doc(offerPath), tokenHash, now, ...options,
  });
}
function device(language = "en") {
  return { data: () => ({ language, token: "synthetic-fcm-token-never-persisted", active: true, organizationId }) };
}
function process(database, id = interestId, options = {}) {
  return processManagerOperationalNotification({
    database, organizationId, jobId, eventId: id, deliveryReference: database.doc(eventPath(id)),
    loadManagerDevices: async () => [device()], sendFcm: async () => batch(accepted()), ...options,
  });
}
afterEach(() => vi.useRealTimers());

describe("committed manager operational notification events", () => {
  it.each([1, 2])("legacy/v%s first INTERESTED response atomically records one event, repeated response cannot resend", async (schemaVersion) => {
    const database = fixture({ job: { schemaVersion, operationalStatus: "OFFERED" } });
    const beforeJob = database.documents.get(jobPath);
    await expect(respond(database)).resolves.toEqual({ state: "answered", status: "INTERESTED" });
    await expect(respond(database)).resolves.toEqual({ state: "answered", status: "INTERESTED" });
    expect(database.documents.get(eventPath(interestId))).toMatchObject({ deliveryStatus: "PENDING", eventType: types.interest });
    expect(database.documents.get(jobPath)).toBe(beforeJob);
    const sendFcm = vi.fn().mockResolvedValue(batch(accepted()));
    await process(database, interestId, { sendFcm });
    await process(database, interestId, { sendFcm });
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("a legacy Offer without a cleaner ID still responds safely using anonymous notification copy", async () => {
    const database = fixture({ offer: { cleanerId: undefined } });
    await respond(database);
    const sendFcm = vi.fn().mockResolvedValue(batch(accepted()));
    await process(database, interestId, { sendFcm });
    expect(sendFcm.mock.calls[0][0][0].data.body).toBe("A cleaner is interested in Synthetic property.");
  });

  it("DECLINED never produces an interest event, including a later INTERESTED retry", async () => {
    const database = fixture();
    await respond(database, { status: "DECLINED" });
    await expect(respond(database)).resolves.toMatchObject({ status: "DECLINED" });
    expect(database.documents.has(eventPath(interestId))).toBe(false);
  });

  it("a re-invite at the same Offer ID gets a distinct event from its existing server creation timestamp", async () => {
    const firstCreatedAt = Timestamp.fromMillis(now.getTime() - 2000);
    const secondCreatedAt = Timestamp.fromMillis(now.getTime() - 1000);
    const database = fixture({ offer: { createdAt: firstCreatedAt } });
    await respond(database);
    database.documents.set(offerPath, { ...database.documents.get(offerPath), status: "PENDING", createdAt: secondCreatedAt });
    await expect(respond(database)).resolves.toMatchObject({ state: "answered", status: "INTERESTED" });
    const events = [...database.documents.entries()].filter(([path]) => path.includes("managerNotificationDeliveries"));
    expect(events).toHaveLength(2);
    expect(new Set(events.map(([, data]) => data.eventId)).size).toBe(2);
    await respond(database);
    expect([...database.documents.keys()].filter((path) => path.includes("managerNotificationDeliveries"))).toHaveLength(2);
  });

  it("a reset legacy Offer with an existing receipt still responds successfully without duplicating the same event", async () => {
    const database = fixture();
    await respond(database);
    database.documents.set(offerPath, { ...database.documents.get(offerPath), status: "PENDING" });
    await expect(respond(database)).resolves.toMatchObject({ state: "answered", status: "INTERESTED" });
    expect([...database.documents.keys()].filter((path) => path.includes("managerNotificationDeliveries"))).toHaveLength(1);
  });

  it("delayed notification copy keeps the Property display name from the business transition", async () => {
    const database = fixture();
    await respond(database);
    database.documents.set(jobPath, { ...database.documents.get(jobPath), propertyName: "Different synthetic property" });
    const sendFcm = vi.fn().mockResolvedValue(batch(accepted()));
    await process(database, interestId, { sendFcm });
    expect(sendFcm.mock.calls[0][0][0].data.body).toBe("Synthetic cleaner is interested in Synthetic property.");
  });

  it("rechecks expiry using the current clock after a transaction waits/retries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const database = fixture();
    const transaction = database.runTransaction;
    database.runTransaction = (operation) => {
      vi.setSystemTime(now.getTime() + 61_000);
      return transaction(operation);
    };
    await expect(respond(database, { now: undefined })).resolves.toMatchObject({ state: "expired" });
    expect(database.documents.get(offerPath).status).toBe("PENDING");
    expect(database.documents.has(eventPath(interestId))).toBe(false);
  });

  it.each([
    [{ job: { archivedAt: true } }, {}, "unavailable"],
    [{ job: { operationalStatus: "IN_PROGRESS" } }, {}, "unavailable"],
    [{ offer: { publicOfferExpiresAt: { toMillis: () => now.getTime() } } }, {}, "expired"],
    [{}, { tokenHash: "wrong-synthetic-hash" }, "not-found"],
    [{}, { jobReference: { id: "job-a", path: "organizations/other/jobs/job-a" } }, "unavailable"],
  ])("invalid Offer response creates no event (%j)", async (overrides, options, state) => {
    const database = fixture(overrides);
    await expect(respond(database, options)).resolves.toMatchObject({ state });
    expect(database.documents.has(eventPath(interestId))).toBe(false);
    expect(database.documents.get(offerPath).status).toBe("PENDING");
  });

  it("first exact Assignment acknowledgment records one stable event; repeats never recreate it", async () => {
    const database = fixture({ offer: { status: "INTERESTED" } });
    const beforeJob = database.documents.get(jobPath);
    const beforeOffer = database.documents.get(offerPath);
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => acknowledge(database)));
    expect(outcomes.filter((result) => !result.repeated)).toHaveLength(1);
    expect(database.documents.get(eventPath(acknowledgmentId))).toMatchObject({
      eventType: types.acknowledgment, assignmentId: "assignment-a", offerId: "offer-a", deliveryStatus: "PENDING",
    });
    expect(database.documents.get(jobPath)).toBe(beforeJob);
    expect(database.documents.get(offerPath)).toBe(beforeOffer);
    const sendFcm = vi.fn().mockRejectedValue({ code: "messaging/network-error" });
    await process(database, acknowledgmentId, { sendFcm });
    expect(database.documents.get(assignmentPath).cleanerAcknowledgedAt).toBeDefined();
    await expect(acknowledge(database)).resolves.toMatchObject({ repeated: true });
    await process(database, acknowledgmentId, { sendFcm });
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("ten concurrent responses and ten trigger redeliveries still invoke one provider attempt", async () => {
    const database = fixture();
    await Promise.all(Array.from({ length: 10 }, () => respond(database)));
    const sendFcm = vi.fn().mockResolvedValue(batch(accepted()));
    await Promise.all(Array.from({ length: 10 }, () => process(database, interestId, { sendFcm })));
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect([...database.documents.keys()].filter((path) => path.includes("managerNotificationDeliveries"))).toHaveLength(1);
  });

  it("no eligible manager devices leaves the business operation successful and audits zero targets", async () => {
    const database = fixture();
    await respond(database);
    const sendFcm = vi.fn();
    await expect(process(database, interestId, { loadManagerDevices: async () => [], sendFcm }))
      .resolves.toMatchObject({ deliveryStatus: "NO_ACTIVE_DEVICES", targetDeviceCount: 0 });
    expect(sendFcm).not.toHaveBeenCalled();
    expect(database.documents.get(offerPath).status).toBe("INTERESTED");
  });

  it("a stalled provider records UNKNOWN after 15 seconds without retry or changing the Offer", async () => {
    vi.useFakeTimers();
    const database = fixture();
    await respond(database);
    const sendFcm = vi.fn(() => new Promise(() => {}));
    const attempt = process(database, interestId, { sendFcm });
    await vi.advanceTimersByTimeAsync(managerFcmTimeoutMs);
    await expect(attempt).resolves.toMatchObject({ deliveryStatus: "UNKNOWN", failureCode: "deadline-exceeded" });
    await process(database, interestId, { sendFcm });
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(database.documents.get(offerPath).status).toBe("INTERESTED");
  });

  it("outcome audit failure retains the claim, so trigger redelivery cannot dispatch twice", async () => {
    const database = fixture();
    await respond(database);
    const reference = database.doc(eventPath(interestId));
    reference.update = vi.fn().mockRejectedValue(new Error("Synthetic audit failure"));
    const sendFcm = vi.fn().mockResolvedValue(batch(accepted()));
    await process(database, interestId, { deliveryReference: reference, sendFcm });
    await process(database, interestId, { sendFcm });
    expect(database.documents.get(eventPath(interestId)).deliveryStatus).toBe("SENDING");
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("a wrong-organization event reference fails closed without claiming or sending", async () => {
    const database = fixture();
    await respond(database);
    const sendFcm = vi.fn();
    await expect(process(database, interestId, { organizationId: "other-org", sendFcm }))
      .resolves.toMatchObject({ skipped: "invalid-event" });
    expect(sendFcm).not.toHaveBeenCalled();
  });

  it("localizes only allowlisted cleaner/property names and omits private data and domain IDs", () => {
    for (const eventType of Object.values(types)) {
      const messages = managerOperationalFcmMessages([device("en"), device("pt"), device("es")], interestId, eventType, {
        cleanerName: "Synthetic cleaner", propertyName: "Synthetic property", token: "private-token",
        notes: "private-note", clientPrice: 900, accessCode: "private-access", cleanerPhone: "private-phone", jobId: "private-job",
      });
      expect(new Set(messages.map((message) => message.data.title)).size).toBe(3);
      for (const message of messages) {
        expect(Object.keys(message.data).sort()).toEqual(["body", "eventId", "eventType", "link", "title"]);
        expect(message.data.link).toBe("/");
        expect(JSON.stringify(message.data)).not.toMatch(/private|900/);
      }
    }
  });
});
