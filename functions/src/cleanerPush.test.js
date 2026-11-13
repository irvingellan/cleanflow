import { afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { cleanerAccountUid } from "./cleanerHubAccess.js";
import {
  deactivateCleanerDevice, getCleanerDeviceStatus, registerCleanerDevice,
} from "./cleanerPushDevices.js";
import { processCleanerNotification } from "./cleanerPushDelivery.js";
import { isCleanerPushEnabledProfile, isCleanerPushPilotApproval, resolveCleanerPushMode } from "./cleanerPushPilot.js";
import { managerFcmTimeoutMs } from "./managerFcmDelivery.js";
import { notificationOutcomeLog } from "./notificationOutcomeLog.js";
import { awaitCleanerPushTest, cleanerPushOverview, pushTestLimits, requestCleanerPushTest } from "./cleanerPushTest.js";

const organizationId = "synthetic-org";
const cleanerId = "cleaner-a";
const uid = cleanerAccountUid(organizationId, cleanerId);
const sessionA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sessionB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const orgPath = `organizations/${organizationId}`;
const memberPath = `${orgPath}/members/${uid}`;
const cleanerPath = `${orgPath}/cleaners/${cleanerId}`;
const jobId = "job-test";
const eventId = "a".repeat(64);
const eventPath = `${orgPath}/cleanerNotificationInboxes/${cleanerId}/items/${eventId}`;
const deliveryPath = `${orgPath}/cleanerNotificationDeliveries/${eventId}`;
const registration = {
  deviceId: "synthetic-installation-a", token: "synthetic-fcm-registration-token-A", platform: "android",
  permission: "granted", language: "pt",
};
const otherRegistration = {
  ...registration, deviceId: "synthetic-installation-b", token: "synthetic-fcm-registration-token-B",
  platform: "ios-pwa",
};

function identity(sessionId = sessionA, id = cleanerId) {
  return { organizationId, cleanerId: id, uid: cleanerAccountUid(organizationId, id), sessionId };
}

function addCleaner(records, id, sessions) {
  const user = cleanerAccountUid(organizationId, id);
  records.set(`${orgPath}/members/${user}`, {
    role: "CLEANER", organizationId, cleanerId: id, active: true, sessionId: sessions.at(-1), sessionIds: sessions,
  });
  records.set(`${orgPath}/cleaners/${id}`, { active: true, organizationId });
}

function fixture({ beforeReceiptUpdate } = {}) {
  const records = new Map([
    [`${orgPath}/jobs/${jobId}`, {
      organizationId, operationalStatus: "ASSIGNED", schemaVersion: 2, assignedCleanerIds: [cleanerId],
      checklistContextRevision: 1, scheduleRevision: 0, propertyName: "private-property-marker",
    }],
    [`${orgPath}/jobs/${jobId}/assignments/assignment-a`, {
      organizationId, jobId, cleanerId, isActive: true, executionStatus: "ASSIGNED",
    }],
    [eventPath, {
      eventId, organizationId, cleanerId, type: "ASSIGNED", jobId, eventVersion: 1, processingState: "STORED",
      createdAt: Timestamp.now(), transitionKey: "assignment-a", contextRevision: 1,
    }],
  ]);
  addCleaner(records, cleanerId, [sessionA, sessionB]);

  function reference(path) {
    return {
      path, id: path.split("/").at(-1),
      doc: (id) => reference(`${path}/${id}`),
      collection: (name) => reference(`${path}/${name}`),
      get: async () => snapshot(path),
      update: async (patch) => {
        if (path === deliveryPath) await beforeReceiptUpdate?.();
        records.set(path, { ...records.get(path), ...patch });
      },
      where: (key, _, expected) => ({ path, predicate: (record) => record[key] === expected }),
    };
  }
  function snapshot(path) {
    const data = records.get(path);
    return { id: path.split("/").at(-1), exists: records.has(path), ref: reference(path), data: () => data };
  }
  let queue = Promise.resolve();
  const database = {
    doc: reference, collection: reference,
    runTransaction(operation) {
      const run = queue.then(async () => {
        const writes = [];
        const result = await operation({
          get: async (ref) => ref.predicate ? {
            docs: [...records.keys()].filter((path) => path.startsWith(`${ref.path}/`)
              && !path.slice(ref.path.length + 1).includes("/") && ref.predicate(records.get(path))).map(snapshot),
          } : snapshot(ref.path),
          set: (ref, data, opts) => writes.push(() => records.set(ref.path, opts?.merge ? { ...records.get(ref.path), ...data } : data)),
          create: (ref, data) => writes.push(() => {
            if (records.has(ref.path)) throw new Error("Unexpected duplicate create.");
            records.set(ref.path, data);
          }),
          update: (ref, data) => writes.push(() => records.set(ref.path, { ...records.get(ref.path), ...data })),
          delete: (ref) => writes.push(() => records.delete(ref.path)),
        });
        for (const write of writes) write();
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return { database, records };
}

const register = (f, data = registration, who = identity()) => registerCleanerDevice(f.database, who, data, "enabled");
const status = (f, deviceId = registration.deviceId, who = identity()) => getCleanerDeviceStatus(f.database, who, { deviceId }, "enabled");
const deactivate = (f, result, data = registration, who = identity(), reason = "SIGNED_OUT") =>
  deactivateCleanerDevice(f.database, who, {
    deviceId: data.deviceId, token: data.token, registrationRevision: result.registrationRevision, reason,
  });
const deliver = (f, sendFcm) => processCleanerNotification({ database: f.database, organizationId, cleanerId, eventId, sendFcm, mode: "enabled" });
const accepted = { success: true, messageId: "synthetic-provider-accepted" };
const invalid = { success: false, error: { code: "messaging/registration-token-not-registered" } };
const batch = (...responses) => ({
  responses, successCount: responses.filter((item) => item.success).length,
  failureCount: responses.filter((item) => !item.success).length,
});

afterEach(() => vi.useRealTimers());

describe("cleaner device lifecycle", () => {
  it("distinguishes failed audit persistence from provider acceptance without a resend", async () => {
    const f = fixture({ beforeReceiptUpdate: () => { throw new Error("synthetic write failure"); } });
    await register(f);
    const sendFcm = vi.fn(async () => batch(accepted));
    const result = notificationOutcomeLog(await deliver(f, sendFcm));
    expect(result).toMatchObject({ deliveryStatus: "FCM_ACCEPTED", acceptedByFcmDevices: 1,
      targetDeviceCount: 1, auditRecorded: false });
    await deliver(f, sendFcm);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(f.records.get(eventPath)).toMatchObject({ processingState: "STORED" });
  });
  it("keeps two installations independently active and repeats enrollment without changing the binding", async () => {
    const f = fixture();
    const first = await register(f);
    const second = await register(f, otherRegistration, identity(sessionB));
    expect(first.bindingId).not.toBe(second.bindingId);
    expect(await register(f)).toEqual(first);
    expect(await deactivate(f, first)).toEqual({ deactivated: true });
    expect(await status(f)).toEqual({ state: "signed-out", registrationRevision: 1 });
    expect(await status(f, otherRegistration.deviceId, identity(sessionB))).toEqual({ state: "active", registrationRevision: 1 });
    expect(await register(f)).toMatchObject({ registered: true, registrationRevision: 2 });
  });

  it("issues a new revision and binding for an explicit rebind, and rejects malformed rebind values", async () => {
    const f = fixture();
    const first = await register(f);
    expect(await register(f)).toEqual(first);
    const rebound = await register(f, { ...registration, rebind: true });
    expect(rebound).toMatchObject({ registered: true, registrationRevision: 2 });
    expect(rebound.bindingId).not.toBe(first.bindingId);
    expect(await status(f)).toEqual({ state: "active", registrationRevision: 2 });
    await expect(register(f, { ...registration, rebind: false })).rejects.toThrow();
    await expect(register(f, { ...registration, rebind: "yes" })).rejects.toThrow();
  });

  it("keeps late sign-out and late provider invalidation from deactivating a replacement", async () => {
    const f = fixture();
    const first = await register(f);
    const rotated = { ...registration, token: `${registration.token}-new` };
    const sendFcm = vi.fn(async () => {
      await register(f, rotated);
      return batch(invalid);
    });
    await deliver(f, sendFcm);
    expect(await deactivate(f, first)).toEqual({ deactivated: false });
    expect(await status(f)).toEqual({ state: "active", registrationRevision: 2 });
    expect(f.records.get(deliveryPath)).toMatchObject({ invalidated: 0, deliveryStatus: "FAILED" });
  });

  it.each([
    ["same installation, new token", { ...registration, token: `${registration.token}-new-account` }],
    ["new installation, same token", { ...registration, deviceId: "synthetic-installation-recreated" }],
  ])("only selects the current binding after an account switch with %s", async (_, replacementRegistration) => {
    const f = fixture();
    const first = await register(f);
    const other = identity("cccccccccccccccccccccccccccccccc", "cleaner-b");
    addCleaner(f.records, other.cleanerId, [other.sessionId]);
    const replacement = await register(f, replacementRegistration, other);
    expect(replacement.bindingId).not.toBe(first.bindingId);
    expect(await status(f)).toMatchObject({ state: "superseded" });
    const sendFcm = vi.fn();
    await deliver(f, sendFcm);
    expect(sendFcm).not.toHaveBeenCalled();
    await deactivate(f, first);
    expect(await status(f, replacementRegistration.deviceId, other)).toMatchObject({ state: "active" });
  });

  it("rejects forged identity fields and revoked sessions, and keeps permission loss distinct from logout", async () => {
    const f = fixture();
    await expect(register(f, { ...registration, cleanerId: "other-cleaner" })).rejects.toMatchObject({ code: "invalid-argument" });
    const first = await register(f);
    expect(await deactivate(f, first, registration, identity(), "PERMISSION_REVOKED")).toEqual({ deactivated: true });
    expect(await status(f)).toMatchObject({ state: "permission-revoked" });
    f.records.set(memberPath, { ...f.records.get(memberPath), active: false });
    await expect(register(f)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(status(f)).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("cleaner FCM dispatch", () => {
  it("invokes the transport immediately after the durable authorization claim", async () => {
    const order = [];
    const f = fixture({ beforeReceiptUpdate: () => { order.push("receipt-update"); } });
    await register(f);
    await deliver(f, async () => {
      order.push("provider");
      expect(f.records.get(deliveryPath)).toMatchObject({
        deliveryStatus: "UNKNOWN", pendingProviderResult: true,
      });
      return batch(accepted);
    });
    expect(order).toEqual(["provider", "receipt-update"]);
    expect(f.records.get(deliveryPath)).toMatchObject({
      deliveryStatus: "FCM_ACCEPTED", pendingProviderResult: false,
      attemptedAt: expect.any(Timestamp), completedAt: expect.anything(),
    });
  });

  it("claims once, selects only the authorized recipient's installations and persists a private outcome per install", async () => {
    const f = fixture();
    const first = await register(f);
    const second = await register(f, otherRegistration, identity(sessionB));
    const other = identity("cccccccccccccccccccccccccccccccc", "cleaner-b");
    addCleaner(f.records, other.cleanerId, [other.sessionId]);
    await register(f, { ...registration, deviceId: "synthetic-other-cleaner-install", token: `${registration.token}-other-account` }, other);
    const sendFcm = vi.fn().mockResolvedValue(batch(invalid, accepted));

    const results = await Promise.all([deliver(f, sendFcm), deliver(f, sendFcm)]);
    const logged = results.map(notificationOutcomeLog);
    expect(logged).toContainEqual({ deliveryStatus: "PARTIAL", targetDeviceCount: 2,
      acceptedByFcmDevices: 1, rejectedDevices: 1, unknownDevices: 0,
      invalidated: 1, invalidDeviceCleanupFailed: false, auditRecorded: true });
    expect(JSON.stringify(logged)).not.toMatch(/synthetic-fcm-registration-token|synthetic-provider-accepted|cleaner-a|synthetic-installation|devices|stages/);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    const messages = sendFcm.mock.calls[0][0];
    expect(messages.map(({ token, data }) => [token, data.cleanerBindingId])).toEqual([
      [registration.token, first.bindingId], [otherRegistration.token, second.bindingId],
    ]);
    for (const message of messages) {
      expect(message).not.toHaveProperty("notification");
      expect(message.data).toMatchObject({ link: "/agenda", eventId });
      expect(JSON.stringify(message.data)).not.toMatch(/private-property-marker|job-test|cleaner-a|assignment-a/);
    }
    expect(f.records.get(deliveryPath)).toMatchObject({
      deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, rejectedDevices: 1, unknownDevices: 0, invalidated: 1,
      devices: [{ outcome: "REJECTED" }, { outcome: "PROVIDER_ACCEPTED" }],
    });
    expect(JSON.stringify(f.records.get(deliveryPath))).not.toMatch(/synthetic-fcm-registration-token|synthetic-provider-accepted/);
    expect(await status(f)).toMatchObject({ state: "invalidated" });
    expect(await status(f, otherRegistration.deviceId, identity(sessionB))).toMatchObject({ state: "active" });
    await expect(register(f)).rejects.toMatchObject({ code: "failed-precondition", details: { reason: "fcm-token-invalidated" } });
    await expect(register(f, { ...registration, token: `${registration.token}-renewed` })).resolves.toMatchObject({ registrationRevision: 2 });
    expect(f.records.get(eventPath)).toMatchObject({ processingState: "STORED" });
  });

  it("marks ambiguous timeout unknown and never tries a second provider or replays the event", async () => {
    const f = fixture();
    await register(f);
    vi.useFakeTimers();
    const sendFcm = vi.fn(() => new Promise(() => {}));
    const pending = deliver(f, sendFcm);
    await vi.advanceTimersByTimeAsync(managerFcmTimeoutMs + 1);
    expect(notificationOutcomeLog(await pending)).toMatchObject({ deliveryStatus: "UNKNOWN",
      targetDeviceCount: 1, acceptedByFcmDevices: null, rejectedDevices: null,
      unknownDevices: 1, failureCode: "deadline-exceeded", auditRecorded: true });
    await deliver(f, sendFcm);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(f.records.get(deliveryPath)).toMatchObject({
      deliveryStatus: "UNKNOWN", unknownDevices: 1, failureCode: "deadline-exceeded", devices: [{ outcome: "UNKNOWN" }],
    });
    expect(f.records.get(eventPath)).toMatchObject({ processingState: "STORED" });
  });

  it.each([
    ["revoked", (records) => records.set(memberPath, { ...records.get(memberPath), active: false })],
    ["inactive-profile", (records) => records.set(cleanerPath, { active: false })],
    ["outdated-assignment", (records) => records.set(`${orgPath}/jobs/${jobId}`, {
      ...records.get(`${orgPath}/jobs/${jobId}`), assignedCleanerIds: ["cleaner-b"],
    })],
  ])("suppresses ineligible delivery for %s while preserving the Inbox", async (_, change) => {
    const f = fixture();
    await register(f);
    change(f.records);
    const sendFcm = vi.fn();
    await deliver(f, sendFcm);
    expect(sendFcm).not.toHaveBeenCalled();
    expect(f.records.get(eventPath)).toMatchObject({ processingState: "STORED" });
  });
});

describe("cleaner push pilot eligibility", () => {
  it("keeps missing, mistyped, and broad Production modes disabled", () => {
    for (const configured of [undefined, "", "disabled", "enabled", "typo"]) {
      expect(resolveCleanerPushMode(configured, "production")).toBe("disabled");
    }
    expect(resolveCleanerPushMode("pilot", "production")).toBe("disabled");
    expect(resolveCleanerPushMode("pilot", "production", "b".repeat(40))).toBe("pilot");
    expect(resolveCleanerPushMode("enabled", "sandbox")).toBe("enabled");
    expect(resolveCleanerPushMode("pilot", "unknown")).toBe("disabled");
  });

  it("requires an exact current grant and rejects events predating approval", () => {
    const identity = {
      organizationId: "demo", cleanerId: "example", uid: "example-uid", sessionId: "example-session",
      deviceId: "example-installation-id",
    };
    const releaseSha = "b".repeat(40);
    const options = { releaseSha, nowMs: 2000, eventAtMs: 1500 };
    const approval = { ...identity, active: true, releaseSha, approvedAt: { toMillis: () => 1000 }, expiresAt: { toMillis: () => 2500 } };
    expect(isCleanerPushPilotApproval(approval, identity, options)).toBe(true);
    expect(isCleanerPushPilotApproval(approval, identity, { ...options, releaseSha: "a".repeat(40) })).toBe(false);
    for (const key of Object.keys(identity)) {
      expect(isCleanerPushPilotApproval({ ...approval, [key]: "other" }, identity, options)).toBe(false);
    }
    expect(isCleanerPushPilotApproval(approval, identity, { ...options, nowMs: 2500 })).toBe(false);
    expect(isCleanerPushPilotApproval(approval, identity, { ...options, eventAtMs: 999 })).toBe(false);
    expect(isCleanerPushPilotApproval({ ...approval, active: false }, identity, options)).toBe(false);
    expect(isCleanerPushPilotApproval({ ...approval, expiresAt: 2500 }, identity, options)).toBe(false);
    expect(isCleanerPushPilotApproval({ ...approval, approvedAt: { toMillis: "invalid" } }, identity, options)).toBe(false);
    expect(isCleanerPushPilotApproval({ ...approval, deviceId: undefined }, { ...identity, deviceId: undefined }, options)).toBe(false);
  });
});

describe("cleaner push pilot test notice", () => {
  const testEvent = {
    eventId, organizationId, cleanerId, type: "PUSH_TEST", eventVersion: 1, processingState: "STORED",
    priority: "HIGH", transitionKey: "operator-test",
  };

  it("reaches registered installations without a Job and records the private outcome", async () => {
    const f = fixture();
    await register(f);
    f.records.set(eventPath, { ...testEvent, createdAt: Timestamp.now() });
    const sendFcm = vi.fn(async () => batch(accepted));

    await expect(deliver(f, sendFcm)).resolves.toMatchObject({ deliveryStatus: "FCM_ACCEPTED", acceptedByFcmDevices: 1 });
    const [messages] = sendFcm.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(JSON.stringify(messages)).not.toContain("private-property-marker");
    expect(f.records.get(deliveryPath)).toMatchObject({ type: "PUSH_TEST", acceptedByFcmDevices: 1, targetDeviceCount: 1 });
  });

  it("in pilot mode sends only to an installation with a current grant made before the test", async () => {
    const release = "c".repeat(40);
    vi.stubEnv("CLEANER_PUSH_PILOT_RELEASE", release);
    try {
      const f = fixture();
      await register(f);
      await register(f, otherRegistration, identity(sessionB));
      const approvedAt = Timestamp.fromMillis(Date.now() - 60_000);
      f.records.set(`${orgPath}/cleanerPushPilotSessions/${sessionA}`, {
        active: true, organizationId, cleanerId, uid, sessionId: sessionA, deviceId: registration.deviceId,
        releaseSha: release, approvedAt, expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      });
      f.records.set(eventPath, { ...testEvent, createdAt: Timestamp.now() });
      const sendFcm = vi.fn(async () => batch(accepted));

      await processCleanerNotification({ database: f.database, organizationId, cleanerId, eventId, sendFcm, mode: "pilot" });
      const [messages] = sendFcm.mock.calls[0];
      expect(messages.map(({ token }) => token)).toEqual([registration.token]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("skips a test notice when no installation is approved", async () => {
    vi.stubEnv("CLEANER_PUSH_PILOT_RELEASE", "c".repeat(40));
    try {
      const f = fixture();
      await register(f);
      f.records.set(eventPath, { ...testEvent, createdAt: Timestamp.now() });
      const sendFcm = vi.fn();
      await expect(processCleanerNotification({ database: f.database, organizationId, cleanerId, eventId, sendFcm, mode: "pilot" }))
        .resolves.toEqual({ skipped: "NO_ACTIVE_DEVICES" });
      expect(sendFcm).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("manager phone-alert switch", () => {
  it("lets pilot mode deliver to every registered installation of an enabled cleaner, for later events only", async () => {
    vi.stubEnv("CLEANER_PUSH_PILOT_RELEASE", "c".repeat(40));
    try {
      const f = fixture();
      await register(f);
      await register(f, otherRegistration, identity(sessionB));
      const enabledAt = Timestamp.fromMillis(Date.now() - 60_000);
      f.records.set(cleanerPath, { ...f.records.get(cleanerPath), pushAlertsEnabled: true, pushAlertsEnabledAt: enabledAt });
      f.records.set(eventPath, { ...f.records.get(eventPath), createdAt: Timestamp.now() });
      const sendFcm = vi.fn(async (messages) => batch(...messages.map(() => accepted)));
      await processCleanerNotification({ database: f.database, organizationId, cleanerId, eventId, sendFcm, mode: "pilot" });
      expect(sendFcm.mock.calls[0][0].map(({ token }) => token).sort()).toEqual([registration.token, otherRegistration.token].sort());

      const old = fixture();
      await register(old);
      old.records.set(cleanerPath, { ...old.records.get(cleanerPath), pushAlertsEnabled: true, pushAlertsEnabledAt: Timestamp.now() });
      old.records.set(eventPath, { ...old.records.get(eventPath), createdAt: Timestamp.fromMillis(Date.now() - 120_000) });
      const oldSend = vi.fn();
      await expect(processCleanerNotification({ database: old.database, organizationId, cleanerId, eventId, sendFcm: oldSend, mode: "pilot" }))
        .resolves.toEqual({ skipped: "NO_ACTIVE_DEVICES" });
      expect(oldSend).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("is ignored when switched off, without a timestamp, or for an inactive cleaner", () => {
    const who = { organizationId, cleanerId };
    const at = Timestamp.fromMillis(Date.now() - 1000);
    expect(isCleanerPushEnabledProfile({ pushAlertsEnabled: true, pushAlertsEnabledAt: at, organizationId }, who)).toBe(true);
    expect(isCleanerPushEnabledProfile({ pushAlertsEnabled: false, pushAlertsEnabledAt: at }, who)).toBe(false);
    expect(isCleanerPushEnabledProfile({ pushAlertsEnabled: true, pushAlertsEnabledAt: null }, who)).toBe(false);
    expect(isCleanerPushEnabledProfile({ pushAlertsEnabled: true, pushAlertsEnabledAt: at, active: false }, who)).toBe(false);
    expect(isCleanerPushEnabledProfile({ pushAlertsEnabled: true, pushAlertsEnabledAt: at, organizationId: "other" }, who)).toBe(false);
  });
});

it("lets an enabled cleaner enroll in pilot mode without a per-device grant", async () => {
  vi.stubEnv("CLEANER_PUSH_PILOT_RELEASE", "c".repeat(40));
  try {
    const f = fixture();
    await expect(registerCleanerDevice(f.database, identity(), registration, "pilot")).rejects.toThrow();
    f.records.set(cleanerPath, { ...f.records.get(cleanerPath), pushAlertsEnabled: true, pushAlertsEnabledAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expect(registerCleanerDevice(f.database, identity(), registration, "pilot")).resolves.toBeTruthy();
    expect((await getCleanerDeviceStatus(f.database, identity(), { deviceId: registration.deviceId }, "pilot")).state).not.toBe("pilot-ineligible");
  } finally {
    vi.unstubAllEnvs();
  }
});

describe("manager and cleaner test notices", () => {
  const manager = { role: "MANAGER", uid: "synthetic-manager" };
  const cleaner = { role: "CLEANER", uid };
  const at = Date.parse("2026-11-05T12:00:00Z");
  const testRequest = (f, overrides = {}) => requestCleanerPushTest(f.database, {
    organizationId, cleanerId, requester: manager, mode: "enabled", now: at, timestamp: () => Timestamp.now(), ...overrides,
  });
  const deliverTest = async (f, id) => {
    const sendFcm = vi.fn(async (messages) => batch(...messages.map(() => accepted)));
    await processCleanerNotification({ database: f.database, organizationId, cleanerId, eventId: id, sendFcm, mode: "enabled" });
    return sendFcm;
  };

  it("stores one PUSH_TEST that the regular sender delivers to every active phone", async () => {
    const f = fixture();
    await register(f);
    await register(f, otherRegistration, identity(sessionB));
    expect(await cleanerPushOverview(f.database, { organizationId, cleanerId, mode: "enabled", now: at }))
      .toEqual({ state: "ready", alertsEnabled: false, activeDevices: 2 });
    const stored = await testRequest(f);
    expect(stored).toMatchObject({ state: "stored", targetDeviceCount: 2 });
    const record = f.records.get(`${orgPath}/cleanerNotificationInboxes/${cleanerId}/items/${stored.eventId}`);
    expect(record).toMatchObject({ type: "PUSH_TEST", processingState: "STORED", requestedByRole: "MANAGER", requestedByUid: manager.uid });
    expect(record).not.toHaveProperty("targetSessionId");
    const sendFcm = await deliverTest(f, stored.eventId);
    expect(sendFcm.mock.calls[0][0]).toHaveLength(2);
    await expect(awaitCleanerPushTest(f.database, { organizationId, eventId: stored.eventId, wait: async () => {} }))
      .resolves.toEqual({ state: "sent", acceptedDevices: 2, targetDevices: 2 });
  });

  it("sends a cleaner's own test only to the phone that asked for it", async () => {
    const f = fixture();
    await register(f);
    await register(f, otherRegistration, identity(sessionB));
    const stored = await testRequest(f, { requester: cleaner, targetSessionId: sessionB });
    expect(stored).toMatchObject({ state: "stored", targetDeviceCount: 1 });
    const sendFcm = await deliverTest(f, stored.eventId);
    expect(sendFcm.mock.calls[0][0].map(({ token }) => token)).toEqual([otherRegistration.token]);
  });

  it("limits tests per minute and per day, and refuses without phones or transport", async () => {
    const f = fixture();
    expect(await testRequest(f)).toEqual({ state: "no-devices" });
    await register(f);
    expect(await testRequest(f, { mode: "disabled" })).toEqual({ state: "unavailable" });
    expect((await testRequest(f)).state).toBe("stored");
    expect(await testRequest(f, { now: at + 30_000 })).toEqual({ state: "rate-limited", retryAfterSeconds: 30 });
    for (let index = 1; index < pushTestLimits.perDay; index += 1) {
      expect((await testRequest(f, { now: at + index * pushTestLimits.minIntervalMs })).state).toBe("stored");
    }
    expect(await testRequest(f, { now: at + pushTestLimits.perDay * pushTestLimits.minIntervalMs })).toEqual({ state: "daily-limit" });
    expect((await testRequest(f, { now: at + 86_400_000 })).state).toBe("stored");
    await expect(testRequest(f, { requester: { role: "ADMIN", uid: "x" } })).rejects.toThrow();
  });

  it("in pilot mode counts and reaches phones only after the manager switch is on", async () => {
    const f = fixture();
    await register(f);
    const pilot = { mode: "pilot" };
    expect(await testRequest(f, pilot)).toEqual({ state: "no-devices" });
    f.records.set(cleanerPath, { ...f.records.get(cleanerPath), pushAlertsEnabled: true, pushAlertsEnabledAt: Timestamp.fromMillis(at - 60_000) });
    expect(await cleanerPushOverview(f.database, { organizationId, cleanerId, mode: "pilot", now: at }))
      .toEqual({ state: "ready", alertsEnabled: true, activeDevices: 1 });
    expect(await testRequest(f, pilot)).toMatchObject({ state: "stored", targetDeviceCount: 1 });
  });
});
