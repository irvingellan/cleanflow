import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doc, getDocFromServer } from "firebase/firestore";
import { TranslationProvider } from "../../i18n/translations.js";
import {
  currentOrganizationId,
  defaultOrganizationId,
  resetCurrentOrganizationId,
} from "../../services/organization/currentOrganization.js";

const session = vi.hoisted(() => ({ authUser: undefined, boundaryMounts: [] }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDocFromServer: vi.fn(), onSnapshot: vi.fn() }));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));
vi.mock("../jobs/jobPhotoCountService.js", () => ({ clearJobPhotoCountCache: vi.fn() }));
vi.mock("./managerAccessDiagnostics.js", () => ({ recordManagerAccessDiagnostic: vi.fn() }));
vi.mock("./useInitialManagerSession.js", () => ({
  useInitialManagerSession: () => ({ authUser: session.authUser, status: "resolved", retry: () => {} }),
}));
vi.mock("./authService.js", () => ({ signInWithEmail: vi.fn(), signOutManager: vi.fn(), subscribeToAuthState: vi.fn() }));
vi.mock("../notifications/notificationService.js", () => ({ prepareManagerPushSignOut: vi.fn(), abortManagerPushSignOut: vi.fn() }));
vi.mock("../notifications/oneSignalService.js", () => ({ clearOneSignalUser: vi.fn() }));
vi.mock("../dev-center/PlatformPage.jsx", () => ({ PlatformPage: () => <h1>Owner console</h1> }));
vi.mock("../manager-app/ManagerApplication.jsx", () => ({ ManagerApplication: () => null }));
vi.mock("./ManagerAccessBoundary.jsx", async () => {
  const { useState } = await import("react");
  const organization = await import("../../services/organization/currentOrganization.js");
  return {
    // Records the organization that was current at the moment the boundary mounted.
    ManagerAccessBoundary: ({ user }) => {
      const [mountedIn] = useState(() => {
        const value = organization.currentOrganizationId();
        session.boundaryMounts.push(`${user.uid}:${value}`);
        return value;
      });
      return <div data-testid="access-boundary">{mountedIn}</div>;
    },
  };
});

import { clearJobPhotoCountCache } from "../jobs/jobPhotoCountService.js";
import { ManagerRoot } from "../manager-app/ManagerRoot.jsx";
import { recordManagerAccessDiagnostic } from "./managerAccessDiagnostics.js";
import { verifyManagerAccess } from "./managerAccessService.js";
import { organizationScopeDeadlineMs, useOrganizationScope } from "./useOrganizationScope.js";

function account(uid, claims) {
  return { uid, getIdTokenResult: vi.fn(async () => ({ claims })) };
}

function deferredAccount(uid) {
  let resolve;
  let reject;
  const token = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { user: { uid, getIdTokenResult: vi.fn(() => token) }, resolve: (claims) => resolve({ claims }), reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.authUser = undefined;
  session.boundaryMounts.length = 0;
  resetCurrentOrganizationId();
});
afterEach(() => { vi.useRealTimers(); });

describe("useOrganizationScope", () => {
  it("is not ready, and stays on the default organization, while nobody is signed in", () => {
    const { result } = renderHook(() => useOrganizationScope(null));
    expect(result.current).toEqual({ ready: false });
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });

  it("uses the default organization for an account without the claim", async () => {
    const user = account("manager-a", {});
    const { result } = renderHook(() => useOrganizationScope(user));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(user.getIdTokenResult).toHaveBeenCalledOnce();
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
    expect(recordManagerAccessDiagnostic).not.toHaveBeenCalled();
  });

  it("selects the organization of a valid claim", async () => {
    const { result } = renderHook(() => useOrganizationScope(account("manager-b", { organizationId: "second-company" })));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(currentOrganizationId()).toBe("second-company");
  });

  it.each([42, "", "UPPER", "has/slash", null, { nested: true }])("uses the default organization for the invalid claim %j", async (value) => {
    const { result } = renderHook(() => useOrganizationScope(account("manager-b", { organizationId: value })));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });

  it("does not read the cleaner claim: a manager screen never selects from it", async () => {
    const claims = { cleanerHub: { organizationId: "second-company" } };
    const { result } = renderHook(() => useOrganizationScope(account("manager-a", claims)));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });

  it("falls back to the default and reports when the token cannot be read", async () => {
    const failing = { uid: "manager-a", getIdTokenResult: vi.fn(async () => { throw new Error("synthetic token failure"); }) };
    const { result } = renderHook(() => useOrganizationScope(failing));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
    expect(recordManagerAccessDiagnostic).toHaveBeenCalledExactlyOnceWith("auth_restore_error", expect.objectContaining({ reason: "unknown" }));
  });

  it("falls back to the default for an account object without a token reader", async () => {
    const { result } = renderHook(() => useOrganizationScope({ uid: "manager-a" }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });

  it("offers recovery at the deadline and uses the late token before mounting company data", async () => {
    vi.useFakeTimers();
    const stalled = deferredAccount("manager-b");
    const { result } = renderHook(() => useOrganizationScope(stalled.user));
    await act(async () => { await vi.advanceTimersByTimeAsync(organizationScopeDeadlineMs - 1); });
    expect(result.current.ready).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current).toMatchObject({ ready: false, status: "error" });
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
    expect(recordManagerAccessDiagnostic).toHaveBeenCalledExactlyOnceWith("auth_restore_error", expect.objectContaining({ reason: "timeout" }));

    await act(async () => { stalled.resolve({ organizationId: "second-company" }); });
    expect(result.current.ready).toBe(true);
    expect(currentOrganizationId()).toBe("second-company");
    expect(recordManagerAccessDiagnostic).toHaveBeenCalledOnce();
  });

  it("ignores a superseded token read after the user retries", async () => {
    vi.useFakeTimers();
    const initial = deferredAccount("manager-a");
    const retried = deferredAccount("manager-a");
    const getIdTokenResult = vi.fn().mockImplementationOnce(initial.user.getIdTokenResult)
      .mockImplementationOnce(retried.user.getIdTokenResult);
    const { result } = renderHook(() => useOrganizationScope({ uid: initial.user.uid, getIdTokenResult }));
    await act(async () => { await vi.advanceTimersByTimeAsync(organizationScopeDeadlineMs); });
    act(() => result.current.retry());
    await act(async () => { retried.resolve({ organizationId: "second-company" }); });
    await act(async () => { initial.resolve({ organizationId: "former-company" }); });
    expect(result.current.ready).toBe(true);
    expect(currentOrganizationId()).toBe("second-company");
  });

  it("resets to the default and clears session caches on sign-out", async () => {
    const { result, rerender } = renderHook(({ user }) => useOrganizationScope(user), {
      initialProps: { user: account("manager-b", { organizationId: "second-company" }) },
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(currentOrganizationId()).toBe("second-company");
    clearJobPhotoCountCache.mockClear();

    rerender({ user: null });
    expect(result.current.ready).toBe(false);
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
    expect(clearJobPhotoCountCache).toHaveBeenCalledOnce();
  });

  it("is not ready for a new account until that account's token is read, and ignores the previous one", async () => {
    const first = deferredAccount("manager-a");
    const second = deferredAccount("manager-b");
    const { result, rerender } = renderHook(({ user }) => useOrganizationScope(user), { initialProps: { user: first.user } });
    rerender({ user: second.user });
    await act(async () => { first.resolve({ organizationId: "first-company" }); });
    expect(result.current.ready).toBe(false);
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
    await act(async () => { second.resolve({ organizationId: "second-company" }); });
    expect(result.current.ready).toBe(true);
    expect(currentOrganizationId()).toBe("second-company");
  });

  it("reads the membership under the resolved organization path", async () => {
    doc.mockReturnValue("membership-reference");
    getDocFromServer.mockResolvedValue({ metadata: { fromCache: false }, data: () => ({ role: "MANAGER", active: true }) });
    const user = account("manager-b", { organizationId: "second-company" });
    const { result } = renderHook(() => useOrganizationScope(user));
    await waitFor(() => expect(result.current.ready).toBe(true));

    await expect(verifyManagerAccess(user)).resolves.toBe(true);
    expect(doc).toHaveBeenCalledExactlyOnceWith({}, "organizations", "second-company", "members", "manager-b");
  });

  it("keeps reading the membership under the default organization for an account without the claim", async () => {
    doc.mockReturnValue("membership-reference");
    getDocFromServer.mockResolvedValue({ metadata: { fromCache: false }, data: () => ({ role: "MANAGER", active: true }) });
    const user = account("manager-a", {});
    const { result } = renderHook(() => useOrganizationScope(user));
    await waitFor(() => expect(result.current.ready).toBe(true));

    await expect(verifyManagerAccess(user)).resolves.toBe(true);
    expect(doc).toHaveBeenCalledExactlyOnceWith({}, "organizations", "cleanflow-demo", "members", "manager-a");
  });
});

describe("ManagerRoot waits for the organization", () => {
  const renderRoot = () => render(<TranslationProvider><ManagerRoot /></TranslationProvider>);

  it("shows the loading screen, and mounts nothing below it, until the organization is selected", async () => {
    const pending = deferredAccount("manager-b");
    session.authUser = pending.user;
    renderRoot();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("access-boundary")).not.toBeInTheDocument();
    expect(session.boundaryMounts).toEqual([]);

    await act(async () => { pending.resolve({ organizationId: "second-company" }); });
    expect(screen.getByTestId("access-boundary")).toHaveTextContent("second-company");
    expect(session.boundaryMounts).toEqual(["manager-b:second-company"]);
  });

  it("mounts the boundary under the default organization for an account without the claim", async () => {
    session.authUser = account("manager-a", {});
    renderRoot();
    expect(await screen.findByTestId("access-boundary")).toHaveTextContent(defaultOrganizationId);
    expect(session.boundaryMounts).toEqual([`manager-a:${defaultOrganizationId}`]);
  });

  it("never mounts the default company while the token is still pending", async () => {
    vi.useFakeTimers();
    const stalled = deferredAccount("manager-b");
    session.authUser = stalled.user;
    renderRoot();
    await act(async () => { await vi.advanceTimersByTimeAsync(organizationScopeDeadlineMs); });
    expect(screen.queryByTestId("access-boundary")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await act(async () => { stalled.resolve({ organizationId: "second-company" }); });
    expect(screen.getByTestId("access-boundary")).toHaveTextContent("second-company");
    expect(session.boundaryMounts).toEqual(["manager-b:second-company"]);
  });

  it("opens the developer console without asking for tenant claims", () => {
    const pending = deferredAccount("platform-owner");
    session.authUser = pending.user;
    window.history.replaceState(null, "", "/platform");
    try {
      renderRoot();
      expect(screen.getByRole("heading", { name: "Owner console" })).toBeInTheDocument();
      expect(session.boundaryMounts).toEqual([]);
      expect(pending.user.getIdTokenResult).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("shows the sign-in form, on the default organization, when nobody is signed in", () => {
    session.authUser = null;
    renderRoot();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(session.boundaryMounts).toEqual([]);
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });
});
