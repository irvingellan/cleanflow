import { afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { readyPublicChecklistForReview } from "./checklistCapabilityService.js";
import {
  checklistReviewFcmMessages,
  checklistReviewNotificationCollection,
  checklistReviewNotificationEventId,
  checklistReviewNotificationType,
  processChecklistReviewNotification,
} from "./checklistReviewNotifications.js";

afterEach(() => vi.useRealTimers());

function fcmBatch(responses) {
  return {
    responses,
    successCount: responses.filter((response) => response.success).length,
    failureCount: responses.filter((response) => !response.success).length,
  };
}

function fcmAcceptedBatch(count) {
  return fcmBatch(Array.from({ length: count }, (_, index) => ({
    success: true, messageId: `synthetic-message-${index}`,
  })));
}

const organizationId = "cleanflow-demo";
const jobId = "synthetic-job";
const runId = "initial";
const tokenHash = "synthetic-hash-only";
const now = new Date("2026-09-24T18:00:00.000Z");
const runPath = `organizations/${organizationId}/jobs/${jobId}/checklistRuns/${runId}`;
const capabilityPath = `${runPath}/checklistCapabilities/active`;
const draftPath = `${runPath}/drafts/current`;
const evidencePath = `${runPath}/evidence/living-belongings`;
const eventId = checklistReviewNotificationEventId(organizationId, jobId, runId);
const notificationPath = `${runPath}/${checklistReviewNotificationCollection}/${eventId}`;
const request = { submissionId: "review-submission-0001", baseRevision: 3 };

const fixtures = {
  job: {
    operationalStatus: "ASSIGNED",
    assignedCleanerIds: ["synthetic-cleaner"],
    checklistContextRevision: 2,
  },
  run: {
    status: "DRAFT",
    definitionVersion: 1,
    propertySnapshot: { propertyName: "Synthetic property" },
    jobSnapshot: { scheduledDate: "2026-09-24" },
    resolvedDefinition: {
      sections: [{ items: [
        { id: "beds" },
        { id: "pool", canBeNotApplicable: true },
        { id: "living-belongings", requiresPhoto: true },
      ] }],
      inventoryItems: [{ id: "soap" }],
    },
  },
  capability: {
    tokenHash,
    status: "ACTIVE",
    cleanerId: "synthetic-cleaner",
    contextRevision: 2,
    rotation: 1,
    expiresAt: Timestamp.fromMillis(now.getTime() + 60_000),
  },
  draft: {
    revision: 3,
    checklistAnswers: { beds: "DONE", pool: "NOT_APPLICABLE", "living-belongings": "DONE" },
    inventoryAnswers: { soap: "LOW" },
    issueNotes: "Synthetic issue note",
    generalNotes: "Synthetic general note",
  },
  evidence: {
    requirementId: "living-belongings",
    status: "SAVED",
    contentType: "image/jpeg",
    sizeBytes: 128,
  },
};

function fakeReference(database, path) {
  return {
    path,
    collection(name) {
      return { doc: (id) => fakeReference(database, `${path}/${name}/${id}`) };
    },
    async update(data) {
      const existing = database.documents.get(path);
      if (!existing) throw new Error(`Missing synthetic document: ${path}`);
      database.documents.set(path, { ...existing, ...data });
    },
  };
}

function fakeSnapshot(reference, data) {
  return {
    ref: reference,
    exists: data !== undefined,
    data: () => data,
  };
}

function createFakeDatabase({ overrides = {} } = {}) {
  const database = {
    documents: new Map([
      [`organizations/${organizationId}/jobs/${jobId}`, { ...fixtures.job }],
      [runPath, structuredClone(fixtures.run)],
      [capabilityPath, { ...fixtures.capability }],
      [draftPath, structuredClone(fixtures.draft)],
      [evidencePath, { ...fixtures.evidence }],
      ...Object.entries(overrides),
    ]),
    doc(path) { return fakeReference(database, path); },
  };

  let transactionTail = Promise.resolve();
  database.runTransaction = (operation) => {
    const previous = transactionTail;
    let release;
    transactionTail = new Promise((resolve) => { release = resolve; });
    return previous.then(async () => {
      const writes = [];
      const transaction = {
        async get(reference) {
          return fakeSnapshot(reference, database.documents.get(reference.path));
        },
        update(reference, data) { writes.push({ type: "update", reference, data }); },
        create(reference, data) { writes.push({ type: "create", reference, data }); },
      };
      const result = await operation(transaction);
      for (const write of writes) {
        const current = database.documents.get(write.reference.path);
        if (write.type === "create" && current !== undefined) throw new Error("Document already exists.");
        if (write.type === "update" && current === undefined) throw new Error("Document does not exist.");
        database.documents.set(
          write.reference.path,
          write.type === "update" ? { ...current, ...write.data } : write.data,
        );
      }
      return result;
    }).finally(() => release());
  };
  database.collectionGroup = (collectionName) => ({
    where(field, _operator, value) {
      return {
        limit() {
          return {
            async get() {
              if (collectionName !== "checklistCapabilities" || field !== "tokenHash") {
                return { size: 0, docs: [] };
              }
              const capability = database.documents.get(capabilityPath);
              const docs = capability?.tokenHash === value
                ? [fakeSnapshot(database.doc(capabilityPath), capability)] : [];
              return { size: docs.length, docs };
            },
          };
        },
      };
    },
  });
  return database;
}

function handoff(database, submittedRequest = request) {
  return readyPublicChecklistForReview(database, {
    organizationId,
    tokenHash,
    request: submittedRequest,
    now,
  });
}

function deliveryData() {
  return {
    eventId,
    eventType: checklistReviewNotificationType,
    deliveryProvider: "fcm",
    deliveryStatus: "PENDING",
  };
}

function managerDevice(language, suffix, database) {
  const path = `managerPushDevices/synthetic-registration-${suffix}`;
  const data = {
    token: `synthetic-fcm-token-${suffix}`, language, active: true,
    organizationId, userId: `synthetic-manager-${suffix}`,
  };
  if (database) database.documents.set(path, { ...data });
  return { ref: { path }, data: () => data };
}

function processDelivery(database, options = {}) {
  return processChecklistReviewNotification({
    database,
    deliveryReference: database.doc(notificationPath),
    deliveryData: database.documents.get(notificationPath) || deliveryData(),
    organizationId,
    jobId,
    runId,
    eventId,
    loadManagerDevices: vi.fn().mockResolvedValue([managerDevice("en", "one")]),
    sendFcm: vi.fn().mockResolvedValue(fcmAcceptedBatch(1)),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...options,
  });
}

describe("checklist review handoff notifications", () => {
  it("atomically creates one stable FCM outbox event with the first valid DRAFT to READY transition", async () => {
    const database = createFakeDatabase();
    const result = await handoff(database);

    expect(result.duplicate).toBe(false);
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
    expect(database.documents.get(notificationPath)).toMatchObject({
      eventId,
      eventType: checklistReviewNotificationType,
      deliveryProvider: "fcm",
      deliveryStatus: "PENDING",
    });
    expect(checklistReviewNotificationEventId(organizationId, jobId, runId)).toBe(eventId);
    expect(checklistReviewNotificationEventId(organizationId, "another-job", runId)).not.toBe(eventId);

    const retry = await handoff(database);
    expect(retry.duplicate).toBe(true);
    expect([...database.documents.keys()].filter((path) => path.startsWith(`${runPath}/${checklistReviewNotificationCollection}/`)))
      .toHaveLength(1);
  });

  it("does not create an event for incomplete requirements or an invalid capability", async () => {
    const incomplete = createFakeDatabase({ overrides: { [evidencePath]: undefined } });
    await expect(handoff(incomplete)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(incomplete.documents.get(runPath).status).toBe("DRAFT");
    expect(incomplete.documents.has(notificationPath)).toBe(false);

    const invalid = createFakeDatabase({ overrides: { [capabilityPath]: { ...fixtures.capability, status: "REVOKED" } } });
    await expect(handoff(invalid)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(invalid.documents.get(runPath).status).toBe("DRAFT");
    expect(invalid.documents.has(notificationPath)).toBe(false);
  });

  it("serializes concurrent identical submissions and duplicate trigger deliveries to one FCM attempt", async () => {
    const database = createFakeDatabase();
    const submissions = await Promise.all([handoff(database), handoff(database)]);
    expect(submissions.map((result) => result.duplicate).sort()).toEqual([false, true]);

    const sendFcm = vi.fn().mockResolvedValue(fcmAcceptedBatch(3));
    const loadManagerDevices = vi.fn().mockResolvedValue([
      managerDevice("en", "one"), managerDevice("pt", "two"), managerDevice("es", "three"),
    ]);
    const attempt = () => processDelivery(database, { sendFcm, loadManagerDevices });
    const outcomes = await Promise.all([attempt(), attempt()]);

    expect(outcomes.filter((outcome) => outcome.deliveryStatus === "FCM_ACCEPTED")).toHaveLength(1);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
    expect(database.documents.get(notificationPath)).toMatchObject({
      deliveryStatus: "FCM_ACCEPTED",
      targetDeviceCount: 3,
      acceptedByFcmDevices: 3,
      failedDevices: 0,
    });
    expect(database.documents.get(notificationPath)).not.toHaveProperty("deliveredDevices");

    const messages = sendFcm.mock.calls[0][0];
    expect(messages.map(({ data }) => [data.title, data.body])).toEqual([
      ["Checklist received", "A service is waiting for your review. Open CleanFlow."],
      ["Checklist recebido", "Há um serviço aguardando sua revisão. Abra o CleanFlow."],
      ["Lista de limpieza recibida", "Hay un servicio esperando tu revisión. Abre CleanFlow."],
    ]);
    for (const { data } of messages) {
      expect(data).toMatchObject({ eventId, eventType: checklistReviewNotificationType, link: "/" });
      expect(data).not.toHaveProperty("jobId");
      expect(data).not.toHaveProperty("runId");
      expect(data).not.toHaveProperty("answers");
      expect(data).not.toHaveProperty("notes");
    }
  });

  it("records no eligible devices without sending and preserves READY_FOR_REVIEW", async () => {
    const database = createFakeDatabase();
    await handoff(database);
    const sendFcm = vi.fn();
    const outcome = await processDelivery(database, {
      loadManagerDevices: vi.fn().mockResolvedValue([]),
      sendFcm,
    });

    expect(outcome.deliveryStatus).toBe("NO_ACTIVE_DEVICES");
    expect(sendFcm).not.toHaveBeenCalled();
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
    expect(database.documents.get(notificationPath)).toMatchObject({
      deliveryStatus: "NO_ACTIVE_DEVICES",
      targetDeviceCount: 0,
    });
  });

  it("records ambiguous provider failure without changing the successful handoff or retrying", async () => {
    const database = createFakeDatabase();
    await handoff(database);
    const sendFcm = vi.fn().mockRejectedValue(Object.assign(new Error("synthetic token must not be stored"), {
      code: "messaging/network-error",
    }));
    const options = {
      loadManagerDevices: vi.fn().mockResolvedValue([managerDevice("en", "one")]),
      sendFcm,
    };

    const outcome = await processDelivery(database, options);
    expect(outcome.deliveryStatus).toBe("UNKNOWN");
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
    expect(database.documents.get(notificationPath)).toMatchObject({
      deliveryStatus: "UNKNOWN",
      failureCode: "messaging/network-error",
      failureSummary: "FCM did not confirm whether the notification was accepted.",
    });
    expect(JSON.stringify(database.documents.get(notificationPath))).not.toContain("synthetic token must not be stored");

    await processDelivery(database, options);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
  });

  it("uses only the requested language copy and an authenticated manager destination", () => {
    const messages = checklistReviewFcmMessages([
      managerDevice("en", "one"), managerDevice("pt", "two"), managerDevice("es", "three"),
    ], eventId);

    expect(messages.map(({ data }) => data.title)).toEqual([
      "Checklist received", "Checklist recebido", "Lista de limpieza recibida",
    ]);
    expect(messages.every(({ data }) => data.link === "/")).toBe(true);
  });

  it("audits a mixed healthy/stale batch and deactivates only the conclusively stale registration", async () => {
    const database = createFakeDatabase();
    await handoff(database);
    const healthy = managerDevice("en", "healthy", database);
    const stale = managerDevice("pt", "stale", database);
    const sendFcm = vi.fn().mockResolvedValue(fcmBatch([
      { success: true, messageId: "synthetic-accepted-message" },
      { success: false, error: { code: "messaging/registration-token-not-registered" } },
    ]));
    const options = { loadManagerDevices: vi.fn().mockResolvedValue([healthy, stale]), sendFcm };

    await expect(processDelivery(database, options)).resolves.toMatchObject({
      deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, failedDevices: 1,
      unknownDevices: 0, invalidated: 1, invalidDeviceCleanupFailed: false,
    });
    expect(database.documents.get(healthy.ref.path).active).toBe(true);
    expect(database.documents.get(stale.ref.path).active).toBe(false);
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
    await processDelivery(database, options);
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("does not deactivate a stale snapshot when the registration token refreshes during send", async () => {
    const database = createFakeDatabase();
    await handoff(database);
    const stale = managerDevice("en", "refresh-race", database);
    const sendFcm = vi.fn(async () => {
      database.documents.set(stale.ref.path, {
        ...stale.data(), token: "synthetic-fresh-token",
      });
      return fcmBatch([{ success: false, error: { code: "messaging/invalid-registration-token" } }]);
    });

    await expect(processDelivery(database, {
      loadManagerDevices: vi.fn().mockResolvedValue([stale]), sendFcm,
    })).resolves.toMatchObject({ deliveryStatus: "FAILED", invalidated: 0 });
    expect(database.documents.get(stale.ref.path)).toMatchObject({ active: true, token: "synthetic-fresh-token" });
  });

  it("keeps a confirmed PARTIAL provider result when invalid-device cleanup fails", async () => {
    const database = createFakeDatabase();
    await handoff(database);
    const healthy = managerDevice("en", "healthy", database);
    const stale = managerDevice("pt", "stale", database);
    const originalTransaction = database.runTransaction;
    let transactionCount = 0;
    database.runTransaction = (operation) => {
      transactionCount += 1;
      return transactionCount === 1 ? originalTransaction(operation)
        : Promise.reject(new Error("Synthetic cleanup failure"));
    };
    const sendFcm = vi.fn().mockResolvedValue(fcmBatch([
      { success: true, messageId: "synthetic-accepted-message" },
      { success: false, error: { code: "messaging/invalid-registration-token" } },
    ]));

    const result = await processDelivery(database, {
      loadManagerDevices: vi.fn().mockResolvedValue([healthy, stale]), sendFcm,
    });
    expect(result).toMatchObject({
      deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, failedDevices: 1,
      invalidated: 0, invalidDeviceCleanupFailed: true,
    });
    expect(database.documents.get(notificationPath)).toMatchObject(result);
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("persists known PARTIAL after the five-second cleanup deadline and never repeats the FCM attempt", async () => {
    vi.useFakeTimers();
    const database = createFakeDatabase();
    await handoff(database);
    const healthy = managerDevice("en", "healthy", database);
    const stale = managerDevice("pt", "stale", database);
    const originalTransaction = database.runTransaction;
    let transactionCount = 0;
    database.runTransaction = (operation) => {
      transactionCount += 1;
      return transactionCount === 2 ? new Promise(() => {}) : originalTransaction(operation);
    };
    const sendFcm = vi.fn().mockResolvedValue(fcmBatch([
      { success: true, messageId: "synthetic-accepted-message" },
      { success: false, error: { code: "messaging/invalid-registration-token" } },
    ]));
    const options = { loadManagerDevices: vi.fn().mockResolvedValue([healthy, stale]), sendFcm };
    const pending = processDelivery(database, options);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(database.documents.get(notificationPath).deliveryStatus).toBe("SENDING");
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({
      deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, failedDevices: 1,
      unknownDevices: 0, invalidated: 0, invalidDeviceCleanupFailed: true,
    });
    expect(database.documents.get(notificationPath)).toMatchObject({
      deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, failedDevices: 1,
      invalidDeviceCleanupFailed: true,
    });
    await expect(processDelivery(database, options)).resolves.toEqual({ skipped: "already-claimed" });
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
  });

  it("times out a stalled FCM attempt after 15 seconds as UNKNOWN and never replays it", async () => {
    vi.useFakeTimers();
    const database = createFakeDatabase();
    await handoff(database);
    const sendFcm = vi.fn(() => new Promise(() => {}));
    const options = { sendFcm };
    const pending = processDelivery(database, options);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(database.documents.get(notificationPath).deliveryStatus).toBe("SENDING");
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({
      deliveryStatus: "UNKNOWN", failureCode: "deadline-exceeded",
      acceptedByFcmDevices: null, failedDevices: null,
    });
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
    await expect(processDelivery(database, options)).resolves.toEqual({ skipped: "already-claimed" });
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite UNKNOWN or resend when an accepted provider response arrives after the deadline", async () => {
    vi.useFakeTimers();
    const database = createFakeDatabase();
    await handoff(database);
    let resolveProvider;
    const sendFcm = vi.fn(() => new Promise((resolve) => { resolveProvider = resolve; }));
    const options = { sendFcm };
    const pending = processDelivery(database, options);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toMatchObject({ deliveryStatus: "UNKNOWN", failureCode: "deadline-exceeded" });
    resolveProvider(fcmAcceptedBatch(1));
    await vi.advanceTimersByTimeAsync(1);
    expect(database.documents.get(notificationPath).deliveryStatus).toBe("UNKNOWN");
    await expect(processDelivery(database, options)).resolves.toEqual({ skipped: "already-claimed" });
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
  });

  it("does not repeat a known FCM acceptance if the audit outcome cannot be written", async () => {
    const database = createFakeDatabase();
    await handoff(database);
    const originalDoc = database.doc;
    database.doc = (path) => {
      const reference = originalDoc(path);
      return path === notificationPath ? {
        ...reference, update: async () => { throw new Error("Synthetic outcome write failure"); },
      } : reference;
    };
    const sendFcm = vi.fn().mockResolvedValue(fcmAcceptedBatch(1));
    const options = { sendFcm };
    await expect(processDelivery(database, options)).resolves.toMatchObject({ deliveryStatus: "FCM_ACCEPTED" });
    expect(database.documents.get(notificationPath).deliveryStatus).toBe("SENDING");
    await expect(processDelivery(database, options)).resolves.toEqual({ skipped: "already-claimed" });
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(database.documents.get(runPath).status).toBe("READY_FOR_REVIEW");
  });

  it("survives five bounded repeated submission/trigger races without a second logical send", async () => {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const database = createFakeDatabase();
      const submissions = await Promise.all([handoff(database), handoff(database), handoff(database)]);
      expect(submissions.filter((result) => result.duplicate === false)).toHaveLength(1);
      const sendFcm = vi.fn().mockResolvedValue(fcmAcceptedBatch(1));
      const results = await Promise.all([
        processDelivery(database, { sendFcm }), processDelivery(database, { sendFcm }),
        processDelivery(database, { sendFcm }),
      ]);
      expect(results.filter((result) => result.deliveryStatus === "FCM_ACCEPTED")).toHaveLength(1);
      expect(sendFcm).toHaveBeenCalledTimes(1);
      expect([...database.documents.keys()].filter((path) => path.startsWith(`${runPath}/${checklistReviewNotificationCollection}/`)))
        .toEqual([notificationPath]);
    }
  });

  it.each([
    { successCount: 1, failureCount: 0 },
    { successCount: 1, failureCount: 0, responses: [] },
    { successCount: 1, failureCount: 0, responses: [{ success: false, error: { code: "messaging/invalid-registration-token" } }] },
  ])("does not fabricate success or deactivate registrations for malformed FCM result %#", async (response) => {
    const database = createFakeDatabase();
    await handoff(database);
    const device = managerDevice("en", "malformed", database);
    const sendFcm = vi.fn().mockResolvedValue(response);
    const options = { loadManagerDevices: vi.fn().mockResolvedValue([device]), sendFcm };
    await expect(processDelivery(database, options)).resolves.toMatchObject({
      deliveryStatus: "UNKNOWN", failureCode: "unreadable-provider-response",
      acceptedByFcmDevices: null, failedDevices: null,
    });
    expect(database.documents.get(device.ref.path).active).toBe(true);
    await processDelivery(database, options);
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("does not put arbitrary provider error detail into the delivery record", async () => {
    const database = createFakeDatabase();
    await handoff(database);
    await expect(processDelivery(database, {
      sendFcm: vi.fn().mockRejectedValue({ code: "synthetic-private-value", message: "synthetic-private-details" }),
    })).resolves.toMatchObject({ deliveryStatus: "UNKNOWN", failureCode: "provider-error" });
    expect(JSON.stringify(database.documents.get(notificationPath))).not.toContain("synthetic-private");
  });
});
