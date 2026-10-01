import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ManagerAccessBoundary } from "./ManagerAccessBoundary.jsx";
import { subscribeToManagerAccess, verifyManagerAccess } from "./managerAccessService.js";
import { recordManagerAccessDiagnostic } from "./managerAccessDiagnostics.js";
import { managerAccessDeadlineMs, managerAccessOuterDeadlineMs } from "./useManagerAccess.js";

vi.mock("./managerAccessService.js", () => ({
  subscribeToManagerAccess: vi.fn(), verifyManagerAccess: vi.fn(),
}));
vi.mock("./managerAccessDiagnostics.js", () => ({ recordManagerAccessDiagnostic: vi.fn() }));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() { await act(async () => {}); }
async function advance(ms) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
function gate(user = { uid: "fixture-manager" }, props = {}) {
  return <TranslationProvider>
    <ManagerAccessBoundary user={user} onSignOut={vi.fn()} {...props}>
      <div>Operational UI</div>
    </ManagerAccessBoundary>
  </TranslationProvider>;
}

describe("bounded manager application authorization gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    verifyManagerAccess.mockImplementation(() => new Promise(() => {}));
    subscribeToManagerAccess.mockReturnValue(vi.fn());
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("requires explicit server approval before attaching revocation listener or operational UI", async () => {
    const read = deferred();
    verifyManagerAccess.mockReturnValue(read.promise);
    let notify;
    const stop = vi.fn();
    subscribeToManagerAccess.mockImplementation((_user, onAccess) => { notify = onAccess; return stop; });
    const { unmount } = render(gate());
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("Checking manager access");
    expect(subscribeToManagerAccess).not.toHaveBeenCalled();
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    await act(async () => read.resolve(true));
    expect(screen.getByText("Operational UI")).toBeVisible();
    expect(subscribeToManagerAccess).toHaveBeenCalledOnce();
    act(() => notify(false));
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("does not have active manager access");
    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("denies only when the server confirms an inactive/non-manager membership", async () => {
    verifyManagerAccess.mockResolvedValue(false);
    render(gate());
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("does not have active manager access");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(subscribeToManagerAccess).not.toHaveBeenCalled();
  });

  it("does not start an obsolete read during StrictMode effect cleanup/restart", async () => {
    verifyManagerAccess.mockResolvedValue(true);
    render(<StrictMode>{gate()}</StrictMode>);
    await flush();
    expect(verifyManagerAccess).toHaveBeenCalledOnce();
    expect(subscribeToManagerAccess).toHaveBeenCalledOnce();
    expect(screen.getByText("Operational UI")).toBeVisible();
  });

  it("bounds a non-resolving check, automatically retries once, then stops with recovery controls", async () => {
    render(gate());
    await flush();
    await advance(managerAccessDeadlineMs);
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
    expect(verifyManagerAccess).toHaveBeenCalledTimes(2);
    await advance(managerAccessDeadlineMs);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to verify manager access");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    await advance(60_000);
    expect(verifyManagerAccess).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
  });

  it.each(["pageshow", "visibilitychange", "online", "mixed"])(
    "continuous %s lifecycle churn cannot postpone recovery controls indefinitely", async (kind) => {
      render(gate());
      await flush();
      for (let elapsed = 0; elapsed < managerAccessDeadlineMs * 4; elapsed += 1_500) {
        await advance(1_500);
        const events = kind === "mixed" ? ["pageshow", "visibilitychange", "online"] : [kind];
        for (const event of events) {
          fireEvent(event === "visibilitychange" ? document : window, new Event(event));
        }
      }
      await advance(250);
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
      expect(recordManagerAccessDiagnostic).toHaveBeenCalledWith("outer_deadline_expired", {
        attempt: expect.any(Number), durationMs: managerAccessOuterDeadlineMs, reason: "timeout",
      });
      const settledReads = verifyManagerAccess.mock.calls.length;
      for (let index = 0; index < 6; index++) {
        fireEvent(window, new Event("online"));
        await advance(1_500);
      }
      expect(verifyManagerAccess).toHaveBeenCalledTimes(settledReads);
    },
  );

  it("manual retry after outer expiry owns a fresh fixed window and ignores the previous read", async () => {
    const oldRead = deferred();
    verifyManagerAccess.mockReturnValueOnce(oldRead.promise).mockImplementation(() => new Promise(() => {}));
    render(gate());
    await advance(managerAccessOuterDeadlineMs);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
    await act(async () => oldRead.resolve(true));
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
    await advance(managerAccessOuterDeadlineMs - 1);
    expect(recordManagerAccessDiagnostic.mock.calls.filter(([stage]) => stage === "outer_deadline_expired")).toHaveLength(1);
    await advance(1);
    expect(recordManagerAccessDiagnostic.mock.calls.filter(([stage]) => stage === "outer_deadline_expired")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    verifyManagerAccess.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(screen.getByText("Operational UI")).toBeVisible();
  });

  it.each(["lifecycle", "promise"])("wall-clock expiry is enforced before overdue %s callbacks even when timers were suspended", async (callback) => {
    const read = deferred();
    verifyManagerAccess.mockReturnValue(read.promise);
    render(gate());
    await flush();
    vi.setSystemTime(Date.now() + managerAccessOuterDeadlineMs + 1);
    if (callback === "lifecycle") fireEvent(window, new Event("pageshow"));
    else await act(async () => read.resolve(true));
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    expect(subscribeToManagerAccess).not.toHaveBeenCalled();
  });

  it("continuous immediate read failures cannot renew the outer window", async () => {
    verifyManagerAccess.mockRejectedValue({ code: "unavailable" });
    render(gate());
    await flush();
    for (let index = 0; index < 20; index++) {
      fireEvent(window, new Event("pageshow"));
      await advance(1_500);
    }
    expect(recordManagerAccessDiagnostic).toHaveBeenCalledWith("outer_deadline_expired", {
      attempt: expect.any(Number), durationMs: managerAccessOuterDeadlineMs, reason: "timeout",
    });
    const settledReads = verifyManagerAccess.mock.calls.length;
    verifyManagerAccess.mockResolvedValue(true);
    fireEvent(window, new Event("online"));
    await advance(2_000);
    expect(verifyManagerAccess).toHaveBeenCalledTimes(settledReads);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
  });

  it("synchronous revocation-listener failures also share the unresolved outer budget", async () => {
    verifyManagerAccess.mockResolvedValue(true);
    subscribeToManagerAccess.mockImplementation((_subject, _onAccess, onError) => {
      onError({ code: "unavailable" });
      return vi.fn();
    });
    render(gate());
    await flush();
    for (let index = 0; index < 20; index++) {
      fireEvent(window, new Event("pageshow"));
      await advance(1_500);
    }
    expect(recordManagerAccessDiagnostic).toHaveBeenCalledWith("outer_deadline_expired", {
      attempt: expect.any(Number), durationMs: managerAccessOuterDeadlineMs, reason: "timeout",
    });
    const settledReads = verifyManagerAccess.mock.calls.length;
    fireEvent(window, new Event("online"));
    await advance(2_000);
    expect(verifyManagerAccess).toHaveBeenCalledTimes(settledReads);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
  });

  it("manual retry starts a fresh attempt and can recover without reloading", async () => {
    render(gate());
    await advance(managerAccessDeadlineMs * 2);
    verifyManagerAccess.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(verifyManagerAccess).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Operational UI")).toBeVisible();
  });

  it("recovers on the single automatic retry and rejects late approval after final timeout", async () => {
    const stalled = deferred();
    verifyManagerAccess.mockReturnValueOnce(stalled.promise).mockResolvedValueOnce(true);
    const { unmount } = render(gate());
    await advance(managerAccessDeadlineMs);
    expect(screen.getByText("Operational UI")).toBeVisible();
    unmount();

    const late = deferred();
    verifyManagerAccess.mockReturnValue(late.promise);
    render(gate());
    await advance(managerAccessDeadlineMs * 2);
    await act(async () => late.resolve(true));
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it.each([true, false])("ignores obsolete server result %s after a newer attempt", async (obsoleteValue) => {
    const oldRead = deferred();
    const nextRead = deferred();
    verifyManagerAccess.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(nextRead.promise);
    render(gate());
    await advance(managerAccessDeadlineMs);
    await act(async () => oldRead.resolve(obsoleteValue));
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
    expect(subscribeToManagerAccess).not.toHaveBeenCalled();
    await act(async () => nextRead.resolve(!obsoleteValue));
    expect(Boolean(screen.queryByText("Operational UI"))).toBe(!obsoleteValue);
  });

  it.each(["online", "pageshow", "visibilitychange"])("%s starts fresh verification of unresolved PWA state", async (event) => {
    verifyManagerAccess.mockRejectedValue({ code: "unavailable" });
    render(gate());
    await flush();
    verifyManagerAccess.mockResolvedValue(true);
    fireEvent(event === "visibilitychange" ? document : window, new Event(event));
    await advance(1_000);
    expect(verifyManagerAccess).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Operational UI")).toBeVisible();
  });

  it("dedupes resume event bursts and skips hidden lifecycle events", async () => {
    render(gate());
    await advance(1_001);
    for (let index = 0; index < 8; index++) {
      fireEvent(window, new Event("pageshow"));
      fireEvent(window, new Event("online"));
      fireEvent(document, new Event("visibilitychange"));
    }
    await advance(250);
    expect(verifyManagerAccess).toHaveBeenCalledOnce();
    fireEvent(window, new Event("pageshow"));
    await advance(250);
    expect(verifyManagerAccess).toHaveBeenCalledOnce();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await advance(1_001);
    expect(verifyManagerAccess).toHaveBeenCalledOnce();
  });

  it("does not lose an online recovery event arriving just after immediate failures", async () => {
    verifyManagerAccess.mockRejectedValue({ code: "unavailable" });
    render(gate());
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to verify manager access");
    verifyManagerAccess.mockResolvedValue(true);
    fireEvent(window, new Event("online"));
    await advance(1_000);
    expect(screen.getByText("Operational UI")).toBeVisible();
    expect(verifyManagerAccess).toHaveBeenCalledTimes(3);
  });

  it("does not restart successfully authorized access on lifecycle events or user-object rerenders", async () => {
    verifyManagerAccess.mockResolvedValue(true);
    const { rerender } = render(gate());
    await flush();
    rerender(gate({ uid: "fixture-manager" }));
    fireEvent(window, new Event("pageshow"));
    fireEvent(window, new Event("online"));
    fireEvent(document, new Event("visibilitychange"));
    await advance(managerAccessDeadlineMs * 2);
    expect(verifyManagerAccess).toHaveBeenCalledOnce();
    expect(subscribeToManagerAccess).toHaveBeenCalledOnce();
  });

  it("an obsolete revocation/error listener cannot change a newer authorized attempt", async () => {
    let oldAccess;
    let oldError;
    const oldStop = vi.fn();
    verifyManagerAccess.mockResolvedValue(true);
    subscribeToManagerAccess.mockImplementationOnce((_user, onAccess, onError) => {
      oldAccess = onAccess; oldError = onError; return oldStop;
    }).mockReturnValue(vi.fn());
    render(gate());
    await flush();
    act(() => oldError({ code: "unavailable" }));
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    await flush();
    expect(screen.getByText("Operational UI")).toBeVisible();
    act(() => { oldAccess(false); oldError({ code: "permission-denied" }); });
    expect(screen.getByText("Operational UI")).toBeVisible();
    expect(oldStop).toHaveBeenCalledOnce();
  });

  it("listener failures stay bounded and never become membership denial", async () => {
    verifyManagerAccess.mockResolvedValue(true);
    subscribeToManagerAccess.mockImplementation((_user, _onAccess, onError) => {
      onError({ code: "permission-denied" }); return vi.fn();
    });
    render(gate());
    await flush();
    expect(verifyManagerAccess).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to verify manager access");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("a post-authorization listener failure gets a bounded recovery and old callbacks cannot affect manual recovery", async () => {
    let oldAccess;
    let oldError;
    const oldStop = vi.fn();
    verifyManagerAccess.mockResolvedValueOnce(true).mockImplementation(() => new Promise(() => {}));
    subscribeToManagerAccess.mockImplementationOnce((_user, onAccess, onError) => {
      oldAccess = onAccess;
      oldError = onError;
      return oldStop;
    }).mockReturnValue(vi.fn());
    render(gate());
    await flush();
    await advance(managerAccessOuterDeadlineMs * 2);
    expect(screen.getByText("Operational UI")).toBeVisible();
    act(() => oldError({ code: "unavailable" }));
    await advance(managerAccessOuterDeadlineMs);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(oldStop).toHaveBeenCalledOnce();
    act(() => { oldAccess(true); oldError({ code: "unavailable" }); });
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    verifyManagerAccess.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    act(() => { oldAccess(false); oldError({ code: "permission-denied" }); });
    expect(screen.getByText("Operational UI")).toBeVisible();
  });

  it("keeps offline distinct from denial and reconnects when online", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const signOut = vi.fn();
    render(gate(undefined, { onSignOut: signOut }));
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("You appear to be offline");
    expect(verifyManagerAccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
    await advance(managerAccessOuterDeadlineMs * 2);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    verifyManagerAccess.mockResolvedValue(true);
    fireEvent(window, new Event("online"));
    await advance(1_250);
    expect(screen.getByText("Operational UI")).toBeVisible();
  });

  it("removes listeners/timers and ignores late approval on unmount/user switch", async () => {
    const oldRead = deferred();
    verifyManagerAccess.mockReturnValueOnce(oldRead.promise).mockReturnValue(new Promise(() => {}));
    const { rerender, unmount } = render(gate());
    await flush();
    rerender(gate({ uid: "different-fixture-manager" }));
    await act(async () => oldRead.resolve(true));
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    unmount();
    fireEvent(window, new Event("online"));
    await advance(20_000);
    expect(verifyManagerAccess).toHaveBeenCalledTimes(2);
    expect(subscribeToManagerAccess).not.toHaveBeenCalled();
  });
});
