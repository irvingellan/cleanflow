import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import * as registration from "./managerDeviceRegistration.js";
import { registrationDocumentId } from "./notificationLab.js";

const organizationId = "synthetic-org";
const deviceId = "e1e2e3e4-1234-4567-89ab-a1b2c3d4e5f6";
const token = "synthetic-valid-registration-token-123456789";
const path = `managerPushDevices/${registrationDocumentId("manager", deviceId)}`;
const memberPath = `organizations/${organizationId}/members/manager`;
const request = (data = {}, uid = "manager", provider = "password") => ({
  auth: uid ? { uid, token: { firebase: { sign_in_provider: provider } } } : null,
  data: { deviceId, token, ...data },
});
function fixture(seed = {}) {
  const records = new Map(Object.entries({ [memberPath]: { active: true, role: "MANAGER" }, ...seed }));
  let writes = 0;
  const snapshot = (ref) => ({ exists: records.has(ref.path), data: () => records.get(ref.path) });
  const database = { doc: (path) => ({ path, get: async () => snapshot({ path }) }),
    runTransaction: async (fn) => fn({ get: async (ref) => snapshot(ref),
      set: (ref, value, options) => { writes++; records.set(ref.path, options?.merge ? { ...records.get(ref.path), ...value } : value); },
      update: (ref, value) => { writes++; records.set(ref.path, { ...records.get(ref.path), ...value }); },
    }),
  };
  return { records, database, writes: () => writes };
}
const invoke = (fn, f, req) => fn({ database: f.database, organizationId, request: req });

describe("versioned manager registration", () => {
  it("increments enrollment and makes stale sign-out harmless", async () => {
    const f = fixture();
    expect(await invoke(registration.registerManagerDevice, f, request())).toEqual({ registered: true, registrationRevision: 1 });
    expect(await invoke(registration.registerManagerDevice, f, request())).toEqual({ registered: true, registrationRevision: 2 });
    expect(await invoke(registration.deactivateManagerDevice, f, request({ registrationRevision: 1 }))).toEqual({ deactivated: false });
    expect(f.records.get(path).active).toBe(true);
    expect(await invoke(registration.deactivateManagerDevice, f, request({ registrationRevision: 2 }))).toEqual({ deactivated: true });
    expect(f.records.get(path)).toMatchObject({ active: false, tokenState: "signed-out" });
    expect(await invoke(registration.registerManagerDevice, f, request())).toMatchObject({ registrationRevision: 3 });
  });
  it("rejects the currently invalid token while preserving historical invalidation on rotation", async () => {
    const f = fixture({ [path]: { organizationId, userId: "manager", token, active: false,
      tokenState: "invalidated", invalidationReason: "fcm-token-invalidated", invalidatedAt: "history", registrationRevision: 4 } });
    await expect(invoke(registration.registerManagerDevice, f, request())).rejects.toMatchObject({
      code: "failed-precondition", details: { reason: "fcm-token-invalidated" },
    });
    expect(f.writes()).toBe(0);
    await invoke(registration.registerManagerDevice, f, request({ token: `${token}-new` }));
    expect(f.records.get(path)).toMatchObject({ tokenState: "active", invalidationReason: null, invalidatedAt: "history", registrationRevision: 5 });
  });
  it("recognizes an older invalidator after new enrollment without mistaking sign-out history", async () => {
    const f = fixture();
    await invoke(registration.registerManagerDevice, f, request());
    f.records.set(path, { ...f.records.get(path), active: false, invalidatedAt: new Timestamp(100, 100) });
    await expect(invoke(registration.registerManagerDevice, f, request())).rejects.toMatchObject({ code: "failed-precondition", details: { reason: "fcm-token-invalidated" } });
    f.records.set(path, { ...f.records.get(path), active: true });
    await invoke(registration.deactivateManagerDevice, f, request({ registrationRevision: 1 }));
    // Firestore resolves the serverTimestamp transform at commit time.
    f.records.set(path, { ...f.records.get(path), deactivatedAt: new Timestamp(100, 101) });
    await expect(invoke(registration.registerManagerDevice, f, request())).resolves.toMatchObject({ registrationRevision: 2 });
  });
  it("rejects a legacy invalidator that completes after exact sign-out, even within the same millisecond", async () => {
    const f = fixture();
    await invoke(registration.registerManagerDevice, f, request());
    await invoke(registration.deactivateManagerDevice, f, request({ registrationRevision: 1 }));
    const signedOut = { ...f.records.get(path), deactivatedAt: new Timestamp(100, 100) };
    f.records.set(path, { ...signedOut, active: false, invalidatedAt: new Timestamp(100, 101), updatedAt: new Timestamp(100, 101) });
    const beforeWrites = f.writes();
    await expect(invoke(registration.registerManagerDevice, f, request())).rejects.toMatchObject({
      code: "failed-precondition", details: { reason: "fcm-token-invalidated" },
    });
    expect(f.writes()).toBe(beforeWrites);
    expect(f.records.get(path)).toMatchObject({ registrationRevision: 1, active: false, deactivationReason: "SIGNED_OUT" });
  });
  it.each([
    [new Timestamp(100, 101), new Timestamp(100, 100)],
    [new Timestamp(101, 0), new Timestamp(100, 999_999_999)],
  ])("allows preserved invalidation history only when sign-out is strictly newer %#", async (deactivatedAt, invalidatedAt) => {
    const f = fixture({ [path]: { organizationId, userId: "manager", token, active: false,
      registrationRevision: 1, tokenState: "signed-out", deactivationReason: "SIGNED_OUT", deactivatedAt, invalidatedAt } });
    expect(await invoke(registration.registerManagerDevice, f, request())).toMatchObject({ registrationRevision: 2 });
    expect(f.records.get(path).invalidatedAt).toEqual(invalidatedAt);
  });
  it.each([
    [undefined, new Timestamp(100, 100)],
    ["unsafe-signout-time", new Timestamp(100, 100)],
    [new Timestamp(100, 100), "unsafe-invalidation-time"],
    [new Timestamp(100, 100), new Timestamp(100, 100)],
    [new Timestamp(100, 100), 0],
  ])("fails closed when historical ordering is missing, unsafe or equal %#", async (deactivatedAt, invalidatedAt) => {
    const f = fixture({ [path]: { organizationId, userId: "manager", token, active: false,
      registrationRevision: 1, tokenState: "signed-out", deactivationReason: "SIGNED_OUT", deactivatedAt, invalidatedAt } });
    await expect(invoke(registration.registerManagerDevice, f, request())).rejects.toMatchObject({
      code: "failed-precondition", details: { reason: "fcm-token-invalidated" },
    });
    expect(f.writes()).toBe(0);
  });
  it.each([{ userId: "other" }, { organizationId: "other" }])("rejects mismatched owner context %j without writes", async (change) => {
    const f = fixture({ [path]: { organizationId, userId: "manager", token, registrationRevision: 1, ...change } });
    for (const fn of [registration.registerManagerDevice, registration.deactivateManagerDevice]) {
      await expect(invoke(fn, f, request(fn === registration.deactivateManagerDevice ? { registrationRevision: 1 } : {}))).rejects.toMatchObject({ code: "permission-denied" });
    }
    expect(f.writes()).toBe(0);
  });
  it.each([{ token: `${token}-old` }, { deviceId: "f1e2e3e4-1234-4567-89ab-a1b2c3d4e5f6" }, { registrationRevision: 2 }])("ignores nonmatching cleanup %j", async (change) => {
    const f = fixture({ [path]: { organizationId, userId: "manager", token, active: true, registrationRevision: 1 } });
    expect(await invoke(registration.deactivateManagerDevice, f, request({ registrationRevision: 1, ...change }))).toEqual({ deactivated: false });
    expect(f.writes()).toBe(0);
  });
  it.each([[null, "password", "unauthenticated"], ["manager", "anonymous", "unauthenticated"], ["other", "password", "permission-denied"]])("rejects unauthorized caller %s", async (uid, provider, code) => {
    const f = fixture();
    for (const fn of [registration.registerManagerDevice, registration.deactivateManagerDevice]) {
      await expect(invoke(fn, f, request({ registrationRevision: 1 }, uid, provider))).rejects.toMatchObject({ code });
    }
    expect(f.writes()).toBe(0);
  });
  it("rejects revoked membership and client identity fields", async () => {
    const f = fixture({ [memberPath]: { active: false, role: "MANAGER" } });
    await expect(invoke(registration.registerManagerDevice, f, request())).rejects.toMatchObject({ code: "permission-denied" });
    const allowed = fixture();
    await expect(invoke(registration.registerManagerDevice, allowed, request({ userId: "other" }))).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.writes() + allowed.writes()).toBe(0);
  });
});
