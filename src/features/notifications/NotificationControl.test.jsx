import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateInLanguage, TranslationProvider } from "../../i18n/translations.js";
import { NotificationControl } from "./NotificationControl.jsx";

const notificationService = vi.hoisted(() => ({
  enablePushNotifications: vi.fn(),
  getPushChannelDiagnostics: vi.fn(),
}));

vi.mock("./notificationService.js", () => notificationService);
const healthReporter = vi.hoisted(() => ({ reportCurrentManagerNotificationHealth: vi.fn() }));
vi.mock("./notificationHealthReporter.js", () => healthReporter);

describe("NotificationControl", () => {
  afterEach(() => vi.unstubAllGlobals());
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
    expect(await screen.findByRole("button", { name: "FCM registered for manager reminders" })).toBeDisabled();
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

  it("does not present a OneSignal-only subscription as registered for FCM reminders", async () => {
    notificationService.getPushChannelDiagnostics.mockResolvedValue({ state: "incomplete" });
    render(
      <TranslationProvider>
        <NotificationControl userId="firebase-user-uid" />
      </TranslationProvider>,
    );

    expect(await screen.findByRole("button", {
      name: "Complete FCM setup for manager reminders",
    })).toBeEnabled();
  });

  it("explains a denied permission and checks again without requesting it", async () => {
    const user = userEvent.setup();
    notificationService.getPushChannelDiagnostics
      .mockResolvedValueOnce({ state: "denied" })
      .mockResolvedValueOnce({ state: "enabled" });
    render(
      <TranslationProvider>
        <NotificationControl userId="firebase-user-uid" />
      </TranslationProvider>,
    );

    expect(await screen.findByRole("button", { name: "Notifications blocked" })).toBeDisabled();
    expect(screen.getByText(/browser or app settings and device settings/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Check again" }));

    expect(notificationService.getPushChannelDiagnostics).toHaveBeenCalledTimes(2);
    expect(notificationService.enablePushNotifications).not.toHaveBeenCalled();
    expect(healthReporter.reportCurrentManagerNotificationHealth).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: "FCM registered for manager reminders" })).toBeDisabled();
  });

  it("keeps a denied state recoverable when recheck fails", async () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    const user = userEvent.setup();
    notificationService.getPushChannelDiagnostics
      .mockResolvedValueOnce({ state: "denied" })
      .mockRejectedValueOnce(new Error("offline"));
    render(
      <TranslationProvider>
        <NotificationControl userId="firebase-user-uid" />
      </TranslationProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Check again" }));

    expect(await screen.findByRole("button", { name: "Notifications blocked" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
    expect(notificationService.enablePushNotifications).not.toHaveBeenCalled();
  });

  it("does not falsely keep a blocked label if permission was granted before a failed recheck", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("Notification", { permission: "denied" });
    notificationService.getPushChannelDiagnostics
      .mockResolvedValueOnce({ state: "denied" })
      .mockRejectedValueOnce(new Error("provider unavailable"));
    render(
      <TranslationProvider>
        <NotificationControl userId="firebase-user-uid" />
      </TranslationProvider>,
    );

    const checkAgain = await screen.findByRole("button", { name: "Check again" });
    vi.stubGlobal("Notification", { permission: "granted" });
    await user.click(checkAgain);

    expect(await screen.findByRole("button", { name: "Unable to enable notifications. Try again." })).toBeEnabled();
  });

  it("localizes blocked-permission recovery guidance", () => {
    expect(translateInLanguage("pt", "notifications.checkAgain")).toBe("Verificar novamente");
    expect(translateInLanguage("es", "notifications.checkAgain")).toBe("Comprobar de nuevo");
    expect(translateInLanguage("pt", "notifications.deniedGuidance")).toContain("configurações");
    expect(translateInLanguage("es", "notifications.deniedGuidance")).toContain("configuración");
  });
});
