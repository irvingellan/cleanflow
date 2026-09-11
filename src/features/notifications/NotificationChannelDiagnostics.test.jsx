import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { NotificationChannelDiagnostics } from "./NotificationChannelDiagnostics.jsx";

const notificationService = vi.hoisted(() => ({ getPushChannelDiagnostics: vi.fn() }));

vi.mock("./notificationService.js", () => notificationService);

describe("NotificationChannelDiagnostics", () => {
  it("shows a safe OneSignal initialization failure instead of an indefinite loading state", async () => {
    notificationService.getPushChannelDiagnostics.mockResolvedValue({
      browserPermission: "default",
      fcm: { state: "unavailable" },
      oneSignal: {
        initialized: false,
        subscriptionId: null,
        state: "error",
        errorStage: "initialization",
        errorCode: "timeout",
      },
    });

    render(
      <TranslationProvider>
        <NotificationChannelDiagnostics userId="firebase-user-uid" />
      </TranslationProvider>,
    );

    expect(await screen.findByText(/Initialization timed out/)).toBeVisible();
    expect(screen.getByText(/OneSignal subscription: Unable to check/)).toBeVisible();
  });
});
