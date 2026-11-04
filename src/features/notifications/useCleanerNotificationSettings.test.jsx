import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCleanerNotificationSettings } from "./useCleanerNotificationSettings.js";

const service = vi.hoisted(() => ({
  cleanerPushCanEnable: vi.fn(), cleanerPushPairingReference: vi.fn(), enableCleanerPush: vi.fn(),
  inspectCleanerPush: vi.fn(), refreshCleanerPush: vi.fn(),
}));
vi.mock("./cleanerPushService.js", () => service);

const session = { uid: "synthetic-cleaner-a", organizationId: "synthetic-org", sessionId: "synthetic-session-a" };
const props = { session, active: true, platform: "android", displayMode: "standalone", language: "pt" };

beforeEach(() => {
  vi.resetAllMocks();
  service.cleanerPushCanEnable.mockReturnValue(false);
  service.cleanerPushPairingReference.mockImplementation((current) => `${current.sessionId}.synthetic-device`);
  service.inspectCleanerPush.mockResolvedValue("pilot-ineligible");
  service.enableCleanerPush.mockResolvedValue("registered");
});

describe("Cleaner pilot notification settings lifecycle", () => {
  it("shows pairing only after the current session's authenticated precheck and never enrolls on mount", async () => {
    const { result, rerender } = renderHook((value) => useCleanerNotificationSettings(value), { initialProps: props });
    expect(result.current.pairingReference).toBeNull();
    await waitFor(() => expect(result.current.state).toBe("pilot-ineligible"));
    expect(result.current.pairingReference).toBe("synthetic-session-a.synthetic-device");
    expect(result.current.canEnable).toBe(false);
    expect(service.enableCleanerPush).not.toHaveBeenCalled();
    rerender({ ...props, active: false });
    expect(result.current.state).toBe("checking");
    expect(result.current.pairingReference).toBeNull();
    expect(result.current.canEnable).toBe(false);
  });

  it.each([true, false])("discards a previous session's pending check during account replacement (same UID: %s)", async (sameUid) => {
    let finish;
    service.inspectCleanerPush.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook((value) => useCleanerNotificationSettings(value), { initialProps: props });
    const replacement = { ...session, uid: sameUid ? session.uid : "synthetic-cleaner-b", sessionId: "synthetic-session-b" };
    service.inspectCleanerPush.mockResolvedValue("missing");
    service.cleanerPushCanEnable.mockReturnValue(true);
    rerender({ ...props, session: replacement });
    await waitFor(() => expect(result.current.state).toBe("missing"));
    await act(async () => finish("pilot-ineligible"));
    expect(result.current.state).toBe("missing");
    expect(result.current.pairingReference).toBeNull();
    expect(service.enableCleanerPush).not.toHaveBeenCalled();
    act(() => { void result.current.enable(); });
    // The explicit action reaches the service synchronously for browser gesture retention.
    expect(service.enableCleanerPush).toHaveBeenCalledExactlyOnceWith(replacement, {
      platform: "android", standalone: true, language: "pt",
    });
    await waitFor(() => expect(result.current.state).toBe("registered"));
  });
});
