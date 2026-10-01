import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundedManagerFcmSend,
  deactivateInvalidManagerDevices,
  invalidManagerFcmToken,
  loadEligibleManagerPushDevices,
  managerFcmCleanupTimeoutMs,
  managerFcmFailureCode,
  managerFcmTimeoutMs,
  normalizeManagerFcmResult,
} from "./managerFcmDelivery.js";

afterEach(() => vi.useRealTimers());

const accepted = (suffix = "one") => ({ success: true, messageId: `synthetic-message-${suffix}` });
const rejected = (code) => ({ success: false, error: { code } });
const batch = (responses) => ({
  responses,
  successCount: responses.filter((item) => item.success === true).length,
  failureCount: responses.filter((item) => item.success === false).length,
});

function deviceFixture(currentChanges = {}, { missing = false, transactionFailure = false } = {}) {
  const original = {
    active: true,
    token: "synthetic-stale-token",
    organizationId: "synthetic-org",
    userId: "synthetic-manager",
  };
  const reference = { path: "managerPushDevices/synthetic-registration" };
  let stored = missing ? undefined : { ...original, ...currentChanges };
  const update = vi.fn((_reference, patch) => { stored = { ...stored, ...patch }; });
  const database = {
    runTransaction: vi.fn(async (operation) => {
      if (transactionFailure) throw new Error("synthetic cleanup failure");
      return operation({
        get: vi.fn(async () => ({ exists: stored !== undefined, data: () => stored })),
        update,
      });
    }),
  };
  return {
    database,
    device: { ref: reference, data: () => original },
    update,
    stored: () => stored,
  };
}

describe("ordered manager FCM outcomes", () => {
  it("preserves accepted counts and does not claim physical-device delivery", () => {
    const outcome = normalizeManagerFcmResult(batch([accepted("one"), accepted("two")]), 2);
    expect(outcome).toEqual({
      deliveryStatus: "FCM_ACCEPTED", acceptedByFcmDevices: 2, failedDevices: 0, unknownDevices: 0,
    });
    expect(outcome).not.toHaveProperty("deliveredDevices");
  });

  it("records a healthy plus stale device as PARTIAL, retaining ordered results", () => {
    const response = batch([accepted(), rejected("messaging/registration-token-not-registered")]);
    expect(normalizeManagerFcmResult(response, 2)).toEqual({
      deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, failedDevices: 1, unknownDevices: 0,
    });
    expect(response.responses[1].error.code).toBe("messaging/registration-token-not-registered");
  });

  it.each([
    "messaging/registration-token-not-registered", "messaging/invalid-registration-token",
    "messaging/invalid-payload", "messaging/mismatched-credential",
  ])("classifies conclusive %s rejection as FAILED", (code) => {
    expect(normalizeManagerFcmResult(batch([rejected(code)]), 1)).toEqual({
      deliveryStatus: "FAILED", acceptedByFcmDevices: 0, failedDevices: 1, unknownDevices: 0,
    });
  });

  it.each(["messaging/network-error", "messaging/server-unavailable", "unrecognized-code"])(
    "keeps uncertain per-device %s outcome UNKNOWN", (code) => {
      expect(normalizeManagerFcmResult(batch([rejected(code)]), 1)).toMatchObject({
        deliveryStatus: "UNKNOWN", acceptedByFcmDevices: 0, failedDevices: 1, unknownDevices: 1,
      });
    },
  );

  it("retains the confirmed success count when another device has an unknown result", () => {
    expect(normalizeManagerFcmResult(batch([accepted(), rejected("messaging/network-error")]), 2))
      .toEqual({ deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, failedDevices: 1, unknownDevices: 1 });
  });

  it.each([
    undefined,
    { successCount: 1, failureCount: 0 },
    { responses: [accepted()], successCount: 0, failureCount: 1 },
    { responses: [accepted(), rejected("messaging/network-error")], successCount: 1, failureCount: 0 },
    { responses: [{ success: "true" }], successCount: 1, failureCount: 0 },
    { responses: [null], successCount: 0, failureCount: 1 },
    { responses: [accepted()], successCount: "1", failureCount: 0 },
    { responses: [{ success: true }], successCount: 1, failureCount: 0 },
    { responses: [{ success: true, messageId: "" }], successCount: 1, failureCount: 0 },
    { responses: [rejected(undefined)], successCount: 0, failureCount: 1 },
  ])("rejects malformed or inconsistent ordered SDK result %#", (response) => {
    expect(() => normalizeManagerFcmResult(response, 1)).toThrow();
    try {
      normalizeManagerFcmResult(response, 1);
    } catch (error) {
      expect(error.code).toBe("unreadable-provider-response");
    }
  });
});

describe("authoritative manager device selection", () => {
  function selectionFixture() {
    const organizationId = "synthetic-org";
    const device = (id, changes = {}) => ({
      id,
      data: () => ({ active: true, token: "synthetic-valid-token-".repeat(3),
        organizationId, userId: "active-manager", ...changes }),
    });
    const devices = [
      device("healthy-one"),
      device("healthy-two"),
      device("membership-removed", { userId: "removed-manager" }),
      device("membership-inactive", { userId: "inactive-manager" }),
      device("not-manager", { userId: "cleaner-user" }),
      device("foreign-device", { organizationId: "other-org" }),
      device("inactive-registration", { active: false }),
      device("missing-token", { token: null }),
      device("short-token", { token: "short" }),
      device("oversize-token", { token: "x".repeat(4097) }),
      device("whitespace-token", { token: "synthetic bad-token-".repeat(3) }),
      device("newline-token", { token: "synthetic\ninvalid-token-".repeat(3) }),
      device("control-character-token", { token: "synthetic\u0000invalid-token-".repeat(3) }),
      device("path-injection", { userId: "members/active-manager" }),
    ];
    const memberships = {
      "active-manager": { role: "MANAGER", active: true },
      "inactive-manager": { role: "MANAGER", active: false },
      "cleaner-user": { role: "CLEANER", active: true },
    };
    const get = vi.fn().mockResolvedValue({ docs: devices });
    const where = vi.fn().mockReturnValue({ get });
    const database = {
      collection: vi.fn().mockReturnValue({ where }),
      doc: vi.fn((path) => ({ path, id: path.split("/").at(-1) })),
      getAll: vi.fn(async (...references) => references.map((reference) => ({
        id: reference.id, data: () => memberships[reference.id],
      }))),
    };
    return { organizationId, database, where };
  }

  it("rechecks active membership and organization, omitting removed/inactive/non-manager/foreign devices", async () => {
    const fixture = selectionFixture();
    const devices = await loadEligibleManagerPushDevices(fixture.database, fixture.organizationId);
    expect(devices.map((device) => device.id)).toEqual(["healthy-one", "healthy-two"]);
    expect(fixture.database.collection).toHaveBeenCalledWith("managerPushDevices");
    expect(fixture.where).toHaveBeenCalledWith("organizationId", "==", fixture.organizationId);
    expect(fixture.database.getAll).toHaveBeenCalledTimes(1);
    const references = fixture.database.getAll.mock.calls[0];
    expect(references.map(({ path }) => path)).toEqual([
      "organizations/synthetic-org/members/active-manager",
      "organizations/synthetic-org/members/removed-manager",
      "organizations/synthetic-org/members/inactive-manager",
      "organizations/synthetic-org/members/cleaner-user",
    ]);
    expect(new Set(references.map(({ path }) => path)).size).toBe(references.length);
  });

  it("does not turn membership lookup failure into an allowed device list", async () => {
    const fixture = selectionFixture();
    fixture.database.getAll.mockRejectedValue(new Error("Synthetic membership read unavailable"));
    await expect(loadEligibleManagerPushDevices(fixture.database, fixture.organizationId)).rejects.toThrow();
  });
});

describe("bounded manager FCM request", () => {
  it("uses the fixed 15-second deadline and forwards the exact payload once", async () => {
    vi.useFakeTimers();
    expect(managerFcmTimeoutMs).toBe(15_000);
    const messages = [{ token: "synthetic-token", data: { eventType: "SYNTHETIC" } }];
    const sendFcm = vi.fn(() => new Promise(() => {}));
    const result = boundedManagerFcmSend(sendFcm, messages).catch((error) => error);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(sendFcm).toHaveBeenCalledWith(messages);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({ code: "deadline-exceeded" });
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline after success and after synchronous provider rejection", async () => {
    vi.useFakeTimers();
    const response = batch([accepted()]);
    await expect(boundedManagerFcmSend(vi.fn().mockResolvedValue(response), [])).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);
    await expect(boundedManagerFcmSend(() => { throw { code: "messaging/network-error" }; }, []))
      .rejects.toMatchObject({ code: "messaging/network-error" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("conclusive invalid manager-device cleanup", () => {
  it.each(["messaging/invalid-registration-token", "messaging/registration-token-not-registered"])(
    "deactivates the exact current registration for %s", async (code) => {
      const fixture = deviceFixture();
      await expect(deactivateInvalidManagerDevices(fixture.database, [fixture.device], batch([rejected(code)])))
        .resolves.toEqual({ invalidated: 1, invalidDeviceCleanupFailed: false });
      expect(fixture.stored()).toMatchObject({ active: false });
      expect(fixture.stored()).toHaveProperty("invalidatedAt");
      expect(fixture.stored()).toHaveProperty("updatedAt");
      expect(fixture.update).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["token refreshed during send", { token: "synthetic-new-healthy-token" }],
    ["registration reassigned to another user", { userId: "synthetic-other-manager" }],
    ["registration moved to another organization", { organizationId: "synthetic-other-org" }],
    ["registration already inactive", { active: false }],
  ])("does not invalidate when %s", async (_description, changes) => {
    const fixture = deviceFixture(changes);
    const before = { ...fixture.stored() };
    await expect(deactivateInvalidManagerDevices(fixture.database, [fixture.device],
      batch([rejected("messaging/registration-token-not-registered")]))).resolves.toEqual({
      invalidated: 0, invalidDeviceCleanupFailed: false,
    });
    expect(fixture.stored()).toEqual(before);
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("does not recreate a registration removed while sending", async () => {
    const fixture = deviceFixture({}, { missing: true });
    await expect(deactivateInvalidManagerDevices(fixture.database, [fixture.device],
      batch([rejected("messaging/invalid-registration-token")]))).resolves.toEqual({
      invalidated: 0, invalidDeviceCleanupFailed: false,
    });
    expect(fixture.stored()).toBeUndefined();
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it.each(["messaging/network-error", "messaging/server-unavailable", "messaging/invalid-argument", undefined])(
    "never invalidates for non-token result %s", async (code) => {
      const fixture = deviceFixture();
      expect(invalidManagerFcmToken({ code })).toBe(false);
      await expect(deactivateInvalidManagerDevices(fixture.database, [fixture.device], batch([rejected(code)])))
        .resolves.toEqual({ invalidated: 0, invalidDeviceCleanupFailed: false });
      expect(fixture.database.runTransaction).not.toHaveBeenCalled();
      expect(fixture.stored().active).toBe(true);
    },
  );

  it("reports cleanup failure without throwing or mutating a known provider result", async () => {
    const fixture = deviceFixture({}, { transactionFailure: true });
    const response = batch([rejected("messaging/invalid-registration-token")]);
    const before = structuredClone(response);
    await expect(deactivateInvalidManagerDevices(fixture.database, [fixture.device], response))
      .resolves.toEqual({ invalidated: 0, invalidDeviceCleanupFailed: true });
    expect(response).toEqual(before);
    expect(fixture.stored().active).toBe(true);
  });

  it("bounds a stalled cleanup to five seconds without changing the provider result or retrying", async () => {
    vi.useFakeTimers();
    expect(managerFcmCleanupTimeoutMs).toBe(5_000);
    const fixture = deviceFixture();
    fixture.database.runTransaction.mockImplementation(() => new Promise(() => {}));
    const response = batch([rejected("messaging/invalid-registration-token")]);
    const before = structuredClone(response);
    let settled = false;
    const pending = deactivateInvalidManagerDevices(fixture.database, [fixture.device], response)
      .then((result) => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ invalidated: 0, invalidDeviceCleanupFailed: true });
    expect(fixture.database.runTransaction).toHaveBeenCalledTimes(1);
    expect(response).toEqual(before);
    expect(fixture.stored().active).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("manager FCM audit-code privacy", () => {
  it.each(["messaging/network-error", "deadline-exceeded", "unreadable-provider-response"])(
    "retains allowlisted %s", (code) => {
      expect(managerFcmFailureCode({ code })).toBe(code);
    },
  );

  it.each([undefined, null, "synthetic-private-token", "messaging/unknown-with-private-suffix", 42])(
    "does not persist arbitrary provider code %#", (code) => {
      expect(managerFcmFailureCode({ code, message: "synthetic private error details" })).toBe("provider-error");
    },
  );
});
