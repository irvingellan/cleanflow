import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ManagerAccessBoundary } from "./ManagerAccessBoundary.jsx";
import { subscribeToManagerAccess } from "./managerAccessService.js";

vi.mock("./managerAccessService.js", () => ({ subscribeToManagerAccess: vi.fn() }));

describe("manager application authorization gate", () => {
  it("mounts operational UI only after approval and removes it when membership is revoked", () => {
    let notify;
    const stop = vi.fn();
    subscribeToManagerAccess.mockImplementation((_user, onAccess) => {
      notify = onAccess;
      return stop;
    });
    const { unmount } = render(<TranslationProvider>
      <ManagerAccessBoundary user={{ uid: "manager" }} onSignOut={vi.fn()}>
        <div>Operational UI</div>
      </ManagerAccessBoundary>
    </TranslationProvider>);
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    act(() => notify(true));
    expect(screen.getByText("Operational UI")).toBeVisible();
    act(() => notify(false));
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("does not have active manager access");
    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("fails closed on an access-check error and keeps sign-out available", () => {
    subscribeToManagerAccess.mockImplementation((_user, _onAccess, onError) => {
      onError(new Error("permission-denied"));
      return () => {};
    });
    render(<TranslationProvider>
      <ManagerAccessBoundary user={{ uid: "outsider" }} onSignOut={vi.fn()}>
        <div>Operational UI</div>
      </ManagerAccessBoundary>
    </TranslationProvider>);
    expect(screen.queryByText("Operational UI")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to verify manager access");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});
