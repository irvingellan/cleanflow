import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  currentDeviceTestCooldownMs,
  currentDeviceTestTimeoutMs,
  sendCurrentManagerTestNotification,
} from "./currentDeviceNotificationTest.js";
import { registrationDocumentId } from "./notificationLab.js";

const organizationId = "synthetic-organization";
const userId = "synthetic-manager";
const deviceId = "12345678-1234-4567-89ab-123456789abc";
const anotherDeviceId = "12345678-1234-4567-89ab-123456789def";
const token = "synthetic-fcm-registration-token-with-enough-length";
const refreshedToken = "refreshed-synthetic-registration-token-with-enough-length";
const registrationId = createHash("sha256").update(`${userId}:${deviceId}`).digest("hex");
const devicePath = `managerPushDevices/${registrationId}`;
const membershipPath = `organizations/${organizationId}/members/${userId}`;
const managerMembership = { role: "MANAGER", active: true };

function fakeDatabase(seed = {}) {
  const records = new Map(Object.entries(seed));
  const reads = [];
  const writes = [];
  let queue = Promise.resolve();
  const snapshot = (path) => {
    reads.push(path);
    return { exists: records.has(path), id: path.split("/").at(-1), data: () => records.get(path) };
  };
  const put = (path, value, merge = false) => {
    records.set(path, merge ? { ...records.get(path), ...value } : value);
    writes.push(path);
  };
  const doc = (path) => ({
    path, id: path.split("/").at(-1), get: async () => snapshot(path),
    update: async (value) => put(path, value, true),
  });
  return {
    records, reads, writes, doc,
    runTransaction(callback) {
      const execution = queue.then(() => callback({
        get: async (ref) => snapshot(ref.path),
        set: (ref, value) => put(ref.path, value),
        create: (ref, value) => {
          if (records.has(ref.path)) throw new Error("Already exists.");
          put(ref.path, value);
        },
        update: (ref, value) => put(ref.path, value, true),
      }));
      queue = execution.catch(() => {});
      return execution;
    },
  };
}

function seededDatabase() {
  return fakeDatabase({
    [membershipPath]: managerMembership,
    [devicePath]: { organizationId, userId, active: true, token },
  });
}

function run(database, overrides = {}) {
  return sendCurrentManagerTestNotification({
    database, organizationId,
    request: { auth: { uid: userId }, data: { deviceId, confirm: true } },
    sendFcm: async () => "projects/synthetic/messages/test",
    now: () => 1_000_000,
    ...overrides,
  });
}

function failedProvider(code = "messaging/registration-token-not-registered") {
  return vi.fn(async () => { throw Object.assign(new Error("Synthetic rejection"), { code }); });
}

function auditRecords(database) {
  return [...database.records.entries()].filter(([path]) => path.includes("/currentDeviceNotificationTests/"));
}

describe("manager current-device notification test", () => {
  it("uses the same exact UID + local UUID registration derivation as enrollment", async () => {
    expect(registrationDocumentId(userId, deviceId)).toBe(registrationId);
    const database = seededDatabase();
    await run(database);
    expect(database.reads).toContain(devicePath);
    expect(database.reads.filter((path) => path.startsWith("managerPushDevices/")))
      .toEqual([devicePath]);
  });

  it("allows an ordinary active manager and sends one fixed display-capable notification", async () => {
    const database = seededDatabase();
    const sendFcm = vi.fn(async () => "projects/synthetic/messages/test");
    const result = await run(database, { sendFcm });
    expect(sendFcm).toHaveBeenCalledExactlyOnceWith({
      token,
      notification: { title: "CleanFlow Test", body: "Notifications are working on this device." },
      data: {
        title: "CleanFlow Test", body: "Notifications are working on this device.",
        eventType: "CURRENT_DEVICE_TEST", link: "/",
      },
      webpush: {
        headers: { Urgency: "normal" },
        notification: {
          title: "CleanFlow Test", body: "Notifications are working on this device.",
          icon: "/icon-192.png", badge: "/icon-192.png",
          tag: "cleanflow-current-device-test", data: { link: "/" },
        },
      },
    });
    expect(result).toEqual({
      provider: "fcm", attempted: 1, status: "FCM_ACCEPTED", providerAccepted: true,
      invalidated: false, recoveryAllowed: false, auditRecorded: true,
    });
    expect(auditRecords(database)).toHaveLength(1);
    expect(auditRecords(database)[0][1]).toMatchObject({
      userId, registrationId, provider: "fcm", testType: "CURRENT_DEVICE",
      status: "FCM_ACCEPTED", providerAccepted: true, recoveryAttempt: false,
    });
    expect(JSON.stringify(auditRecords(database))).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(registrationId);
    expect(database.writes.every((path) => !path.includes("/jobs/"))).toBe(true);
  });

  it.each([undefined, { uid: userId, token: { firebase: { sign_in_provider: "anonymous" } } }])(
    "denies unauthenticated/anonymous accounts before any provider attempt", async (auth) => {
      const database = seededDatabase();
      const sendFcm = vi.fn();
      await expect(run(database, {
        request: { auth, data: { deviceId, confirm: true } }, sendFcm,
      })).rejects.toMatchObject({ code: "unauthenticated" });
      expect(sendFcm).not.toHaveBeenCalled();
      expect(database.writes).toEqual([]);
    },
  );

  it.each([undefined, { role: "MANAGER", active: false }, { role: "CLEANER", active: true }])(
    "denies inactive, missing or non-manager membership", async (membership) => {
      const database = seededDatabase();
      database.records.set(membershipPath, membership);
      const sendFcm = vi.fn();
      await expect(run(database, { sendFcm })).rejects.toMatchObject({ code: "permission-denied" });
      expect(sendFcm).not.toHaveBeenCalled();
      expect(database.writes).toEqual([]);
    },
  );

  it("rechecks membership atomically with the cooldown claim", async () => {
    const database = seededDatabase();
    const transaction = database.runTransaction.bind(database);
    database.runTransaction = (callback) => {
      database.records.set(membershipPath, { role: "MANAGER", active: false });
      return transaction(callback);
    };
    const sendFcm = vi.fn();
    await expect(run(database, { sendFcm })).rejects.toMatchObject({ code: "permission-denied" });
    expect(sendFcm).not.toHaveBeenCalled();
    expect(database.writes).toEqual([]);
  });

  it("rejects arbitrary target identity, tokens, messages, links and organizations", async () => {
    const database = seededDatabase();
    const sendFcm = vi.fn();
    for (const extra of [
      { targetRegistrationId: registrationId }, { registrationId }, { token },
      { title: "Injected" }, { body: "Injected" }, { link: "https://example.invalid" },
      { userId: "another-manager" }, { uid: "another-manager" }, { organizationId: "another-org" },
      { recovery: true },
    ]) {
      await expect(run(database, {
        request: { auth: { uid: userId }, data: { deviceId, confirm: true, ...extra } }, sendFcm,
      })).rejects.toMatchObject({ code: "invalid-argument" });
    }
    expect(sendFcm).not.toHaveBeenCalled();
    expect(database.writes).toEqual([]);
  });

  it.each([
    null, {}, { deviceId, confirm: false }, { deviceId },
    { deviceId: registrationId, confirm: true }, { deviceId: "../other", confirm: true },
    { deviceId: "12345678-1234-1567-89ab-123456789abc", confirm: true },
  ])("requires exactly a UUIDv4 and explicit confirmation", async (data) => {
    const database = seededDatabase();
    const sendFcm = vi.fn();
    await expect(run(database, { request: { auth: { uid: userId }, data }, sendFcm }))
      .rejects.toMatchObject({ code: "invalid-argument" });
    expect(database.writes).toEqual([]);
    expect(sendFcm).not.toHaveBeenCalled();
  });

  it.each([{ userId: "another-manager" }, { organizationId: "another-organization" }])(
    "rejects ownership or organization mismatch on the derived registration", async (change) => {
      const database = seededDatabase();
      database.records.set(devicePath, { ...database.records.get(devicePath), ...change });
      const sendFcm = vi.fn();
      await expect(run(database, { sendFcm })).rejects.toMatchObject({ code: "permission-denied" });
      expect(sendFcm).not.toHaveBeenCalled();
      expect(database.writes).toEqual([]);
    },
  );

  it.each([undefined, { active: false }, { token: "short" }, { token: "x".repeat(4097) }])(
    "rejects absent, inactive or malformed stored registration", async (change) => {
      const database = seededDatabase();
      if (change === undefined) database.records.delete(devicePath);
      else database.records.set(devicePath, { ...database.records.get(devicePath), ...change });
      const sendFcm = vi.fn();
      await expect(run(database, { sendFcm })).rejects.toMatchObject({ code: "failed-precondition" });
      expect(sendFcm).not.toHaveBeenCalled();
      expect(database.writes).toEqual([]);
    },
  );

  it("claims once for concurrent calls and applies one manager-wide cooldown across devices", async () => {
    const database = seededDatabase();
    const sendFcm = vi.fn(async () => "projects/synthetic/messages/test");
    const outcomes = await Promise.allSettled([run(database, { sendFcm }), run(database, { sendFcm })]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected"))
      .toMatchObject([{ reason: { code: "resource-exhausted" } }]);
    database.records.set(`managerPushDevices/${registrationDocumentId(userId, anotherDeviceId)}`, {
      organizationId, userId, active: true, token,
    });
    await expect(run(database, {
      sendFcm, request: { auth: { uid: userId }, data: { deviceId: anotherDeviceId, confirm: true } },
    })).rejects.toMatchObject({ code: "resource-exhausted" });
    await expect(run(database, { sendFcm, now: () => 1_000_000 + currentDeviceTestCooldownMs - 1 }))
      .rejects.toMatchObject({ code: "resource-exhausted" });
    expect(sendFcm).toHaveBeenCalledTimes(1);
    await run(database, { sendFcm, now: () => 1_000_000 + currentDeviceTestCooldownMs });
    expect(sendFcm).toHaveBeenCalledTimes(2);
  });

  it.each(["messaging/invalid-registration-token", "messaging/registration-token-not-registered"])(
    "invalidates confirmed stale tokens, and permits exactly one changed-token recovery", async (code) => {
      const database = seededDatabase();
      const rejected = await run(database, { sendFcm: failedProvider(code) });
      expect(rejected).toMatchObject({
        status: "FAILED", failureCode: code, providerAccepted: false,
        invalidated: true, recoveryAllowed: true,
      });
      expect(database.records.get(devicePath).active).toBe(false);
      // A client re-registering the same token cannot bypass the cooldown.
      database.records.set(devicePath, { ...database.records.get(devicePath), active: true });
      await expect(run(database)).rejects.toMatchObject({ code: "resource-exhausted" });
      database.records.set(devicePath, { ...database.records.get(devicePath), token: refreshedToken });
      const recoverySend = failedProvider(code);
      expect(await run(database, { sendFcm: recoverySend, now: () => 1_001_000 })).toMatchObject({
        status: "FAILED", recoveryAllowed: false,
      });
      expect(recoverySend).toHaveBeenCalledTimes(1);
      database.records.set(devicePath, {
        ...database.records.get(devicePath), active: true, token: `${refreshedToken}-again`,
      });
      await expect(run(database)).rejects.toMatchObject({ code: "resource-exhausted" });
      expect(auditRecords(database)).toHaveLength(2);
      expect(auditRecords(database)[1][1].recoveryAttempt).toBe(true);
    },
  );

  it("concurrent refreshed-token recovery requests permit only one provider send", async () => {
    const database = seededDatabase();
    await run(database, { sendFcm: failedProvider() });
    database.records.set(devicePath, { ...database.records.get(devicePath), active: true, token: refreshedToken });
    const sendFcm = vi.fn(async () => "projects/synthetic/messages/recovery");
    const outcomes = await Promise.allSettled([run(database, { sendFcm }), run(database, { sendFcm })]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected"))
      .toMatchObject([{ reason: { code: "resource-exhausted" } }]);
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate a newer token refreshed during provider dispatch", async () => {
    const database = seededDatabase();
    const result = await run(database, {
      sendFcm: async () => {
        database.records.set(devicePath, { ...database.records.get(devicePath), token: refreshedToken });
        throw Object.assign(new Error("Old token invalid"), { code: "messaging/invalid-registration-token" });
      },
    });
    expect(result).toMatchObject({ status: "FAILED", invalidated: false, recoveryAllowed: true });
    expect(database.records.get(devicePath)).toMatchObject({ active: true, token: refreshedToken });
  });

  it.each(["unavailable", "messaging/server-unavailable", "messaging/internal-error"])(
    "preserves uncertain provider outcomes without invalidation or a recovery bypass", async (code) => {
      const database = seededDatabase();
      const sendFcm = failedProvider(code);
      expect(await run(database, { sendFcm })).toMatchObject({
        status: "UNKNOWN", providerAccepted: null, invalidated: false, recoveryAllowed: false,
      });
      database.records.set(devicePath, { ...database.records.get(devicePath), token: refreshedToken });
      await expect(run(database, { sendFcm })).rejects.toMatchObject({ code: "resource-exhausted" });
      expect(sendFcm).toHaveBeenCalledTimes(1);
      expect(database.records.get(devicePath).active).toBe(true);
    },
  );

  it("does not expose arbitrary provider exception codes or private messages", async () => {
    const database = seededDatabase();
    const logger = { error: vi.fn() };
    const result = await run(database, { logger, sendFcm: failedProvider(token) });
    expect(result).toMatchObject({ status: "UNKNOWN", failureCode: "provider-error" });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(auditRecords(database))).not.toContain(token);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("classifies unreadable provider acceptance as UNKNOWN", async () => {
    const database = seededDatabase();
    expect(await run(database, { sendFcm: async () => undefined })).toMatchObject({
      status: "UNKNOWN", providerAccepted: null, recoveryAllowed: false,
      failureCode: "unreadable-provider-response",
    });
    expect(database.records.get(devicePath).active).toBe(true);
  });

  it("bounds a stalled provider to 15 seconds and never retries or clears its claim", async () => {
    vi.useFakeTimers();
    try {
      const database = seededDatabase();
      const sendFcm = vi.fn(() => new Promise(() => {}));
      const pending = run(database, { sendFcm });
      await vi.advanceTimersByTimeAsync(0);
      expect(sendFcm).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(currentDeviceTestTimeoutMs - 1);
      expect(auditRecords(database)[0][1].status).toBe("SENDING");
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toMatchObject({
        status: "UNKNOWN", failureCode: "deadline-exceeded", providerAccepted: null,
        recoveryAllowed: false, invalidated: false,
      });
      await expect(run(database, { sendFcm })).rejects.toMatchObject({ code: "resource-exhausted" });
      expect(sendFcm).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not turn provider acceptance into a retryable error if audit updating fails", async () => {
    const database = seededDatabase();
    const originalDoc = database.doc;
    database.doc = (path) => {
      const reference = originalDoc(path);
      if (path.includes("/currentDeviceNotificationTests/")) {
        reference.update = async () => { throw new Error(token); };
      }
      return reference;
    };
    const logger = { error: vi.fn() };
    expect(await run(database, { logger })).toMatchObject({
      status: "FCM_ACCEPTED", providerAccepted: true, auditRecorded: false, recoveryAllowed: false,
    });
    expect(logger.error).toHaveBeenCalledWith("Current-device notification test audit update failed.");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(token);
    await expect(run(database)).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("does not permit recovery when a conclusive rejection was not durably audited", async () => {
    const database = seededDatabase();
    const originalDoc = database.doc;
    database.doc = (path) => {
      const reference = originalDoc(path);
      if (path.includes("/currentDeviceNotificationTests/")) {
        reference.update = async () => { throw new Error("Synthetic audit unavailable"); };
      }
      return reference;
    };
    expect(await run(database, { sendFcm: failedProvider() })).toMatchObject({
      status: "FAILED", auditRecorded: false, recoveryAllowed: false,
    });
    database.records.set(devicePath, { ...database.records.get(devicePath), active: true, token: refreshedToken });
    await expect(run(database)).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(auditRecords(database)).toHaveLength(1);
  });
});
