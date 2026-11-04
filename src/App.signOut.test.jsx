import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "./i18n/translations.js";
const boundary = vi.hoisted(() => ({ cleanup: vi.fn(), abort: vi.fn(), signOut: vi.fn(), clearOneSignal: vi.fn() }));
vi.mock("./features/auth/authService.js", () => ({ signInWithEmail: vi.fn(), signOutManager: boundary.signOut, subscribeToAuthState: callback => { callback({ uid: "manager-a" }); return () => {}; } }));
vi.mock("./features/notifications/notificationService.js", () => ({ prepareManagerPushSignOut: boundary.cleanup, abortManagerPushSignOut: boundary.abort }));
vi.mock("./features/notifications/oneSignalService.js", () => ({ clearOneSignalUser: boundary.clearOneSignal }));
// Expose the real App handler via the existing authorization-boundary callback.
// No operational controller mounts and no provider/network operation runs here.
vi.mock("./features/auth/ManagerAccessBoundary.jsx", () => ({ ManagerAccessBoundary: ({ onSignOut, isSigningOut }) => <button disabled={isSigningOut} onClick={onSignOut}>Sign out</button> }));
import App from "./App.jsx";
beforeEach(() => { vi.clearAllMocks(); boundary.cleanup.mockResolvedValue({ deactivated: false }); boundary.signOut.mockResolvedValue(undefined); boundary.clearOneSignal.mockResolvedValue(undefined); });
describe("App explicit sign-out", () => {
  it("waits for bounded push cleanup before Firebase sign-out", async () => {
    let finish; boundary.cleanup.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    render(<TranslationProvider><App /></TranslationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(boundary.cleanup).toHaveBeenCalledOnce(); expect(boundary.signOut).not.toHaveBeenCalled();
    await act(async () => { finish({ deactivated: true }); });
    expect(boundary.signOut).toHaveBeenCalledOnce(); expect(boundary.clearOneSignal).toHaveBeenCalledOnce();
  });
  it("still signs out of Auth if best-effort cleanup fails", async () => {
    boundary.cleanup.mockRejectedValueOnce(new Error("synthetic cleanup failure"));
    render(<TranslationProvider><App /></TranslationProvider>); fireEvent.click(await screen.findByRole("button", { name: "Sign out" })); await act(async () => {});
    expect(boundary.cleanup).toHaveBeenCalledOnce(); expect(boundary.signOut).toHaveBeenCalledOnce();
  });
  it("releases its captured push guard for explicit retry when Firebase sign-out rejects", async () => {
    const preparation = { deactivated: true, signOutGeneration: 13 };
    boundary.cleanup.mockResolvedValueOnce(preparation); boundary.signOut.mockRejectedValueOnce(new Error("synthetic Auth failure"));
    render(<TranslationProvider><App /></TranslationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" })); await act(async () => {});
    expect(boundary.abort).toHaveBeenCalledExactlyOnceWith(preparation);
    expect(boundary.clearOneSignal).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

});
