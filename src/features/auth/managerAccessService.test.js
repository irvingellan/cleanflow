import { beforeEach, describe, expect, it, vi } from "vitest";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { subscribeToManagerAccess, verifyManagerAccess } from "./managerAccessService.js";

vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDocFromServer: vi.fn(), onSnapshot: vi.fn() }));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));
const snapshot = (data, fromCache = false) => ({ metadata: { fromCache }, data: () => data });
const user = { uid: "synthetic-manager" };

describe("server-only manager membership service", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("reads only the authenticated subject's membership directly from the server", async () => {
    doc.mockReturnValue("membership-reference");
    getDocFromServer.mockResolvedValue(snapshot({ role: "MANAGER", active: true }));
    await expect(verifyManagerAccess(user)).resolves.toBe(true);
    expect(doc).toHaveBeenCalledWith({}, "organizations", "cleanflow-demo", "members", user.uid);
    expect(getDocFromServer).toHaveBeenCalledWith("membership-reference");
  });

  it.each([undefined, { role: "MANAGER", active: false }, { role: "CLEANER", active: true }, { role: "MANAGER", active: "true" }])("denies server-confirmed missing/inactive/non-manager membership %j", async (membership) => {
    getDocFromServer.mockResolvedValue(snapshot(membership));
    await expect(verifyManagerAccess(user)).resolves.toBe(false);
  });

  it("never treats a cached MANAGER as initial verification", async () => {
    getDocFromServer.mockResolvedValue(snapshot({ role: "MANAGER", active: true }, true));
    await expect(verifyManagerAccess(user)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("cache-only listener snapshots cannot grant or deny; server changes grant/revoke", () => {
    let onChange;
    const stop = vi.fn();
    onSnapshot.mockImplementation((_ref, _options, callback) => { onChange = callback; return stop; });
    const access = vi.fn();
    const cache = vi.fn();
    expect(subscribeToManagerAccess(user, access, vi.fn(), cache)).toBe(stop);
    onChange(snapshot({ role: "MANAGER", active: true }, true));
    onChange(snapshot({ role: "MANAGER", active: false }, true));
    expect(access).not.toHaveBeenCalled();
    expect(cache).toHaveBeenCalledTimes(2);
    onChange(snapshot({ role: "MANAGER", active: true }));
    onChange(snapshot({ role: "MANAGER", active: false }));
    expect(access.mock.calls).toEqual([[true], [false]]);
  });

  it.each([null, { uid: "anonymous", isAnonymous: true }])("rejects unauthenticated/anonymous without any membership read", async (subject) => {
    await expect(verifyManagerAccess(subject)).resolves.toBe(false);
    const access = vi.fn();
    subscribeToManagerAccess(subject, access, vi.fn());
    expect(access).toHaveBeenCalledWith(false);
    expect(getDocFromServer).not.toHaveBeenCalled();
    expect(onSnapshot).not.toHaveBeenCalled();
  });
});
