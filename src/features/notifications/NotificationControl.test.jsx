import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { NotificationControl } from "./NotificationControl.jsx";

const notificationService = vi.hoisted(() => ({
  enablePushNotifications: vi.fn(),
  getPushChannelDiagnostics: vi.fn(),
}));

vi.mock("./notificationService.js", () => notificationService);

describe("NotificationControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationService.getPushChannelDiagnostics.mockResolvedValue({ state: "ready" });
    notificationService.enablePushNotifications.mockResolvedValue({ state: "enabled" });
  });

  it("does not prompt during initial render and keeps the explicit FCM/OneSignal enable action", async () => {
    const user = userEvent.setup();
    render(
      <TranslationProvider>
        <NotificationControl userId="firebase-user-uid" />
      </TranslationProvider>,
    );

    expect(notificationService.enablePushNotifications).not.toHaveBeenCalled();
    const button = await screen.findByRole("button", { name: "Enable notifications" });
    await user.click(button);

    expect(notificationService.enablePushNotifications).toHaveBeenCalledWith({ userId: "firebase-user-uid" });
    expect(await screen.findByRole("button", { name: "Notifications enabled" })).toBeDisabled();
  });

  it("shows a retryable error when the explicit provider activation fails", async () => {
    const user = userEvent.setup();
    notificationService.enablePushNotifications.mockResolvedValue({ state: "error" });
    render(
      <TranslationProvider>
        <NotificationControl userId="firebase-user-uid" />
      </TranslationProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Enable notifications" }));

    expect(await screen.findByRole("button", { name: "Unable to enable notifications. Try again." })).toBeEnabled();
  });
});
