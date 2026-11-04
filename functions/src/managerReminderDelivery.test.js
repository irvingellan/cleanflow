import { afterEach, describe, it, expect, vi } from "vitest";
import { sendFcmManagerReminder, processClaimedManagerReminder } from "./managerReminderDelivery.js";
const reminder = { type: "TODAY_07", targetDate: "2026-11-03", jobCount: 1, attentionCount: 1 };
const token = "synthetic-registration-token-1234567890";
const device = { ref: { path: "managerPushDevices/synthetic" }, data: () => ({ token, active: true, organizationId: "org", userId: "manager", registrationRevision: 1 }) };
const batch = (responses) => ({ responses, successCount: responses.filter((r) => r.success).length, failureCount: responses.filter((r) => !r.success).length });
const accepted = { success: true, messageId: "synthetic-message" };
afterEach(() => vi.useRealTimers());
const send = (sendFcm, options = {}) => sendFcmManagerReminder({ reminder, loadManagerDevices: async () => [device], sendFcm, ...options });
describe("conservative reminder delivery", () => {
  it("bounds a hung send as UNKNOWN without another invocation", async () => {
    vi.useFakeTimers();
    const sendFcm = vi.fn(() => new Promise(() => {}));
    const pending = send(sendFcm);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toMatchObject({ deliveryStatus: "UNKNOWN", attempted: 1, delivered: null, failed: null, unknownDevices: 1, failureCode: "deadline-exceeded" });
    expect(sendFcm).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, { successCount: 1, failureCount: 0 }, batch([{ success: false, error: { code: "messaging/network-error" } }])])("keeps malformed or transient results UNKNOWN %#", async (response) => {
    const result = await send(async () => response);
    expect(result).toMatchObject({ deliveryStatus: "UNKNOWN", unknownDevices: 1 });
  });
  it("retains partial known counts and guards invalidation by the refreshed revision", async () => {
    let stored = { ...device.data(), registrationRevision: 2 };
    const database = { runTransaction: async (fn) => fn({ get: async () => ({ exists: true, data: () => stored }),
      update: (_ref, value) => { stored = { ...stored, ...value }; } }) };
    const result = await send(async () => batch([accepted, { success: false, error: { code: "messaging/registration-token-not-registered" } }]), {
      database, loadManagerDevices: async () => [device, device],
    });
    expect(result).toMatchObject({ deliveryStatus: "PARTIAL", delivered: 1, failed: 1, unknownDevices: 0, invalidated: 0 });
    expect(stored.active).toBe(true);
  });
  it("records current invalidation state for an exact stale registration", async () => {
    let stored = device.data();
    const database = { runTransaction: async (fn) => fn({ get: async () => ({ exists: true, data: () => stored }), update: (_ref, value) => { stored = { ...stored, ...value }; } }) };
    expect(await send(async () => batch([{ success: false, error: { code: "messaging/registration-token-not-registered" } }]), { database })).toMatchObject({ deliveryStatus: "FAILED", invalidated: 1 });
    expect(stored).toMatchObject({ active: false, tokenState: "invalidated", invalidationReason: "fcm-token-invalidated" });
  });
  it("retains confirmed acceptance beside a transient unknown subset", async () => {
    expect(await send(async () => batch([accepted, { success: false, error: { code: "messaging/internal-error" } }]), {
      loadManagerDevices: async () => [device, device],
    })).toMatchObject({ deliveryStatus: "PARTIAL", delivered: 1, failed: 1, unknownDevices: 1 });
  });
  it("preserves accepted outcome when audit persistence fails, and an existing claim never sends", async () => {
    const dispatch = vi.fn(async () => ({ provider: "fcm", attempted: 1, delivered: 1, failed: 0, invalidated: 0, unknownDevices: 0, deliveryStatus: "FCM_ACCEPTED" }));
    const update = vi.fn(async () => { throw new Error("synthetic audit failure"); });
    const result = await processClaimedManagerReminder({ claimed: true, reminder, dispatch, deliveryReference: { update } });
    expect(result).toMatchObject({ delivered: 1, deliveryStatus: "SENT", auditRecorded: false });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({ deliveredDevices: 1, deliveryStatus: "SENT" });
    expect(await processClaimedManagerReminder({ claimed: false, reminder, dispatch })).toMatchObject({ skipped: "already-claimed" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
