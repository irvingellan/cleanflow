import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  developerTestCooldownMs,
  reportManagerDeviceHealth,
  sendDeveloperTestNotification,
} from "./notificationLab.js";

const organizationId = "test-organization";
const developerUid = "developer-uid";
const targetUid = "manager-uid";
const deviceId = "e1e2e3e4-1234-4567-89ab-a1b2c3d4e5f6";
const targetRegistrationId = createHash("sha256")
  .update(`${targetUid}:${deviceId}`).digest("hex");
const token = "synthetic-fcm-registration-token-with-enough-length";

function fakeDatabase(seed = {}) {
  const records = new Map(Object.entries(seed));
  const reads = [];
  const writes = [];
  let transactionQueue = Promise.resolve();

  function snapshot(path) {
    reads.push(path);
    return {
      exists: records.has(path),
      id: path.split("/").at(-1),
      data: () => records.get(path),
    };
  }

  function put(path, value, { create = false, merge = false } = {}) {
    if (create && records.has(path)) throw new Error("Document already exists.");
    records.set(path, merge ? { ...records.get(path), ...value } : value);
    writes.push(path);
  }

  function reference(path) {
    return {
      path,
      id: path.split("/").at(-1),
      get: async () => snapshot(path),
      update: async (value) => put(path, value, { merge: true }),
    };
  }

  return {
    records,
    reads,
    writes,
    doc: reference,
    runTransaction(callback) {
      const execution = transactionQueue.then(() => callback({
        get: async (ref) => snapshot(ref.path),
        set: (ref, value) => put(ref.path, value),
        create: (ref, value) => put(ref.path, value, { create: true }),
        update: (ref, value) => put(ref.path, value, { merge: true }),
      }));
      transactionQueue = execution.catch(() => {});
      return execution;
    },
  };
}

const managerMembership = { role: "MANAGER", active: true };
const healthInput = {
  deviceId,
  notificationPermission: "denied",
  serviceWorker: "ready",
  fcmRegistration: "missing",
  platform: "ios",
  browserClass: "safari",
  standalone: true,
  appVersion: "test-build",
};

function managerSeed({ activeDevice = true, targetMember = true } = {}) {
  return {
    [`organizations/${organizationId}/members/${developerUid}`]: managerMembership,
    [`organizations/${organizationId}/members/${targetUid}`]: targetMember ? managerMembership : { role: "MANAGER", active: false },
    [`managerPushDevices/${targetRegistrationId}`]: {
      organizationId,
      userId: targetUid,
      active: activeDevice,
      token,
    },
  };
}

describe("manager notification health snapshot", () => {
  it("records a denied, unregistered browser without needing an FCM token", async () => {
    const database = fakeDatabase({
      [`organizations/${organizationId}/members/${targetUid}`]: managerMembership,
    });
    const result = await reportManagerDeviceHealth({
      database, organizationId, userId: targetUid, input: healthInput,
      now: () => 1_000_000,
    });

    expect(result).toEqual({ recorded: true });
    const stored = database.records.get(
      `organizations/${organizationId}/managerNotificationDeviceHealth/${targetRegistrationId}`,
    );
    expect(stored).toMatchObject({
      userId: targetUid,
      notificationPermission: "denied",
      fcmRegistration: "missing",
      platform: "ios",
      browserClass: "safari",
    });
    expect(JSON.stringify(stored)).not.toContain(deviceId);
    expect(JSON.stringify(stored)).not.toContain("token");
    expect(database.writes).toEqual([
      `organizations/${organizationId}/managerNotificationDeviceHealth/${targetRegistrationId}`,
    ]);
  });

  it("rejects token, operational fields, and arbitrary user identities", async () => {
    const database = fakeDatabase({
      [`organizations/${organizationId}/members/${targetUid}`]: managerMembership,
    });
    for (const extra of [
      { token }, { jobId: "real-job" }, { userId: developerUid }, { errorMessage: "private" },
    ]) {
      await expect(reportManagerDeviceHealth({
        database, organizationId, userId: targetUid, input: { ...healthInput, ...extra },
      })).rejects.toMatchObject({ code: "invalid-argument" });
    }
    expect(database.writes).toEqual([]);
  });

  it("requires an active manager and rejects conflicting registration ownership", async () => {
    const database = fakeDatabase({
      [`organizations/${organizationId}/members/${targetUid}`]: { role: "MANAGER", active: false },
    });
    await expect(reportManagerDeviceHealth({
      database, organizationId, userId: targetUid, input: healthInput,
    })).rejects.toMatchObject({ code: "permission-denied" });

    database.records.set(`organizations/${organizationId}/members/${targetUid}`, managerMembership);
    database.records.set(`managerPushDevices/${targetRegistrationId}`, {
      userId: "another-manager", organizationId,
    });
    await expect(reportManagerDeviceHealth({
      database, organizationId, userId: targetUid, input: healthInput,
    })).rejects.toMatchObject({ code: "permission-denied" });
    expect(database.writes).toEqual([]);
  });

  it("bounds unchanged reports and allows later material changes", async () => {
    const database = fakeDatabase({
      [`organizations/${organizationId}/members/${targetUid}`]: managerMembership,
    });
    const report = (input, time) => reportManagerDeviceHealth({
      database, organizationId, userId: targetUid, input, now: () => time,
    });
    expect(await report(healthInput, 1_000_000)).toEqual({ recorded: true });
    expect(await report(healthInput, 1_100_000)).toEqual({ recorded: false });
    const granted = { ...healthInput, notificationPermission: "granted", fcmRegistration: "unknown" };
    expect(await report(granted, 1_105_000)).toEqual({ recorded: true });
    expect(await report({ ...granted, fcmRegistration: "registered" }, 1_110_000))
      .toEqual({ recorded: true });
    expect(await report({ ...granted, fcmRegistration: "registered" }, 1_121_000))
      .toEqual({ recorded: false });
    expect(database.writes).toHaveLength(3);
  });
});

describe("developer single-device FCM test", () => {
  function request(database, overrides = {}) {
    return sendDeveloperTestNotification({
      database,
      organizationId,
      developerUid,
      targetRegistrationId,
      confirm: true,
      sendFcm: async () => "projects/test/messages/synthetic",
      now: () => 1_000_000,
      ...overrides,
    });
  }

  it("sends one fixed synthetic message and records provider acceptance, not phone delivery", async () => {
    const database = fakeDatabase(managerSeed());
    const sendFcm = vi.fn(async () => "projects/test/messages/synthetic");
    const result = await request(database, {
      sendFcm,
      title: "injected title",
      body: "injected body",
      token: "attacker token",
    });

    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(sendFcm.mock.calls[0][0]).toMatchObject({
      token,
      data: {
        title: "CleanFlow Test",
        body: "Developer notification test.",
        eventType: "DEV_TEST",
        link: "/",
      },
    });
    expect(result).toEqual({
      attempted: 1, provider: "fcm", providerAccepted: true,
      invalidated: false, status: "FCM_ACCEPTED", auditRecorded: true,
    });
    const audit = [...database.records.entries()]
      .find(([path]) => path.includes("/developerNotificationTests/"))?.[1];
    expect(audit).toMatchObject({
      developerUid,
      targetRegistrationId,
      provider: "fcm",
      testType: "BASIC",
      status: "FCM_ACCEPTED",
      providerAccepted: true,
    });
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain("CleanFlow Test");
    expect(database.writes.every((path) => !path.includes("/jobs/"))).toBe(true);
  });

  it("rejects malformed targets, confirmation missing, and inactive devices before send", async () => {
    const database = fakeDatabase(managerSeed({ activeDevice: false }));
    const sendFcm = vi.fn();
    await expect(request(database, { targetRegistrationId: "not-a-device", sendFcm }))
      .rejects.toMatchObject({ code: "invalid-argument" });
    await expect(request(database, { confirm: false, sendFcm }))
      .rejects.toMatchObject({ code: "invalid-argument" });
    await expect(request(database, { sendFcm }))
      .rejects.toMatchObject({ code: "failed-precondition" });
    expect(sendFcm).not.toHaveBeenCalled();
    expect(database.writes).toEqual([]);
  });

  it("rejects removed developer or target manager before dispatch", async () => {
    const database = fakeDatabase(managerSeed({ targetMember: false }));
    const sendFcm = vi.fn();
    await expect(request(database, { sendFcm }))
      .rejects.toMatchObject({ code: "failed-precondition" });
    database.records.set(`organizations/${organizationId}/members/${targetUid}`, managerMembership);
    database.records.set(`organizations/${organizationId}/members/${developerUid}`, {
      role: "MANAGER", active: false,
    });
    await expect(request(database, { sendFcm }))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect(sendFcm).not.toHaveBeenCalled();
  });

  it("enforces cooldown for sequential and concurrent requests without retrying", async () => {
    const database = fakeDatabase(managerSeed());
    const sendFcm = vi.fn(async () => "projects/test/messages/synthetic");
    const outcomes = await Promise.allSettled([
      request(database, { sendFcm }),
      request(database, { sendFcm }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected"))
      .toMatchObject([{ reason: { code: "resource-exhausted" } }]);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    await expect(request(database, { sendFcm, now: () => 1_000_000 + developerTestCooldownMs - 1 }))
      .rejects.toMatchObject({ code: "resource-exhausted" });
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });

  it("invalidates only a confirmed bad token and records a failed provider attempt", async () => {
    const database = fakeDatabase(managerSeed());
    const error = Object.assign(new Error("No longer registered"), {
      code: "messaging/registration-token-not-registered",
    });
    const result = await request(database, { sendFcm: async () => { throw error; } });
    expect(result).toMatchObject({
      providerAccepted: false,
      invalidated: true,
      status: "FAILED",
      failureCode: "messaging/registration-token-not-registered",
    });
    expect(database.records.get(`managerPushDevices/${targetRegistrationId}`).active).toBe(false);
  });

  it("does not deactivate a refreshed token if the old token is rejected", async () => {
    const database = fakeDatabase(managerSeed());
    const error = Object.assign(new Error("Old token rejected"), {
      code: "messaging/invalid-registration-token",
    });
    const result = await request(database, {
      sendFcm: async () => {
        database.records.set(`managerPushDevices/${targetRegistrationId}`, {
          ...database.records.get(`managerPushDevices/${targetRegistrationId}`),
          token: "new-synthetic-fcm-registration-token-with-enough-length",
        });
        throw error;
      },
    });
    expect(result).toMatchObject({ status: "FAILED", invalidated: false });
    expect(database.records.get(`managerPushDevices/${targetRegistrationId}`).active).toBe(true);
  });

  it("classifies uncertain errors or unreadable acceptance as UNKNOWN, never retries", async () => {
    const database = fakeDatabase(managerSeed());
    const sendFcm = vi.fn(async () => { throw Object.assign(new Error("Network"), { code: "unavailable" }); });
    const result = await request(database, { sendFcm });
    expect(result).toMatchObject({
      providerAccepted: null, status: "UNKNOWN", invalidated: false, failureCode: "unavailable",
    });
    await expect(request(database, { sendFcm })).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(sendFcm).toHaveBeenCalledTimes(1);

    const unreadableDatabase = fakeDatabase(managerSeed());
    expect(await request(unreadableDatabase, { sendFcm: async () => undefined }))
      .toMatchObject({ status: "UNKNOWN", failureCode: "unreadable-provider-response" });
  });

  it("bounds a stalled provider call and leaves its outcome UNKNOWN", async () => {
    vi.useFakeTimers();
    try {
      const database = fakeDatabase(managerSeed());
      const sendFcm = vi.fn(() => new Promise(() => {}));
      const pending = request(database, { sendFcm });
      await vi.waitFor(() => expect(sendFcm).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await pending).toMatchObject({
        status: "UNKNOWN", providerAccepted: null,
        invalidated: false, failureCode: "deadline-exceeded",
      });
      expect(sendFcm).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
