import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateInLanguage, TranslationProvider } from "../../i18n/translations.js";
import { NotificationControl } from "./NotificationControl.jsx";

const notificationService = vi.hoisted(() => ({
  enablePushNotifications: vi.fn(),
  getPushChannelDiagnostics: vi.fn(),
  testCurrentDeviceNotifications: vi.fn(),
}));

vi.mock("./notificationService.js", () => notificationService);
const healthReporter = vi.hoisted(() => ({ reportCurrentManagerNotificationHealth: vi.fn() }));
vi.mock("./notificationHealthReporter.js", () => healthReporter);

describe("NotificationControl", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem("cleanflow-language", "en");
    notificationService.getPushChannelDiagnostics.mockResolvedValue({ state: "ready" });
    notificationService.enablePushNotifications.mockResolvedValue({ state: "enabled" });
    notificationService.testCurrentDeviceNotifications.mockResolvedValue({ state: "fcm-accepted" });
  });

  it("does not prompt during initial render and keeps the explicit FCM/OneSignal enable action", async () => {
    const user = userEvent.setup();
    render(
      <TranslationProvider>
        <NotificationControl userId="firebase-user-uid" />
      </TranslationProvider>,
    );

    expect(notificationService.enablePushNotifications).not.toHaveBeenCalled();
    expect(notificationService.testCurrentDeviceNotifications).not.toHaveBeenCalled();
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

  it("tests the current device only from an explicit tap, including when FCM is already enabled", async () => {
    notificationService.getPushChannelDiagnostics.mockResolvedValue({ state: "enabled" });
    render(<TranslationProvider><NotificationControl userId="ordinary-manager-uid" /></TranslationProvider>);

    expect(await screen.findByRole("button", { name: "FCM registered for manager reminders" })).toBeDisabled();
    expect(notificationService.testCurrentDeviceNotifications).not.toHaveBeenCalled();
    const testButton = screen.getByRole("button", { name: "Enable & test notifications" });
    expect(testButton).toBeEnabled();
    fireEvent.click(testButton);
    // No awaited diagnostics or other UI work consumes the permission user gesture.
    expect(notificationService.testCurrentDeviceNotifications).toHaveBeenCalledExactlyOnceWith();

    expect(await screen.findByText("FCM accepted the test. Check whether the notification appeared on this device.")).toBeVisible();
    expect(notificationService.enablePushNotifications).not.toHaveBeenCalled();
    expect(screen.queryByText(/delivered to (the )?phone/i)).not.toBeInTheDocument();
  });

  it("prevents concurrent current-device tests and activation while pending", async () => {
    let resolveTest;
    notificationService.testCurrentDeviceNotifications.mockReturnValue(new Promise((resolve) => { resolveTest = resolve; }));
    const user = userEvent.setup();
    render(<TranslationProvider><NotificationControl userId="manager-uid" /></TranslationProvider>);
    const enableButton = await screen.findByRole("button", { name: "Enable notifications" });
    await user.dblClick(screen.getByRole("button", { name: "Enable & test notifications" }));

    expect(screen.getByRole("button", { name: "Testing this device…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Testing this device…" })).toHaveAttribute("aria-busy", "true");
    expect(enableButton).toBeDisabled();
    expect(notificationService.testCurrentDeviceNotifications).toHaveBeenCalledTimes(1);
    await act(async () => { resolveTest({ state: "fcm-accepted", recovered: true }); });
    expect(screen.getByRole("button", { name: "Enable & test notifications" })).toBeEnabled();
  });

  it("provides permission recovery without reprompting or testing from Check again", async () => {
    const user = userEvent.setup();
    notificationService.testCurrentDeviceNotifications.mockResolvedValue({ state: "permission-blocked" });
    render(<TranslationProvider><NotificationControl userId="manager-uid" /></TranslationProvider>);
    await user.click(screen.getByRole("button", { name: "Enable & test notifications" }));
    expect(await screen.findByText(/Notifications are blocked on this device/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Notifications blocked" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Check again" }));

    expect(notificationService.getPushChannelDiagnostics).toHaveBeenCalledTimes(2);
    expect(notificationService.testCurrentDeviceNotifications).toHaveBeenCalledTimes(1);
    expect(notificationService.enablePushNotifications).not.toHaveBeenCalled();
  });

  it.each([
    ["permission-default", "notifications.currentDevicePermissionDefault"],
    ["unsupported", "notifications.currentDeviceUnsupported"],
    ["registration-failed", "notifications.currentDeviceRegistrationFailed"],
    ["fcm-rejected", "notifications.currentDeviceRejected"],
    ["unknown", "notifications.currentDeviceUnknown"],
    ["cooldown", "notifications.currentDeviceCooldown"],
    ["unauthorized", "notifications.currentDeviceUnauthorized"],
  ])("shows the distinct %s result without silently retrying", async (state, key) => {
    const user = userEvent.setup();
    notificationService.testCurrentDeviceNotifications.mockResolvedValue({ state });
    render(<TranslationProvider><NotificationControl userId="manager-uid" /></TranslationProvider>);
    await user.click(screen.getByRole("button", { name: "Enable & test notifications" }));
    expect(await screen.findByText(translateInLanguage("en", key))).toBeVisible();
    expect(screen.getByRole("button", { name: "Enable & test notifications" })).toBeEnabled();
    expect(notificationService.testCurrentDeviceNotifications).toHaveBeenCalledTimes(1);
  });

  it("settles unexpected test failure as unknown rather than fabricating success", async () => {
    const user = userEvent.setup();
    notificationService.testCurrentDeviceNotifications.mockRejectedValue(new Error("network"));
    render(<TranslationProvider><NotificationControl userId="manager-uid" /></TranslationProvider>);
    await user.click(screen.getByRole("button", { name: "Enable & test notifications" }));
    expect(await screen.findByText(translateInLanguage("en", "notifications.currentDeviceUnknown"))).toBeVisible();
    expect(screen.getByRole("button", { name: "Enable & test notifications" })).toBeEnabled();
    expect(notificationService.testCurrentDeviceNotifications).toHaveBeenCalledTimes(1);
  });

  it("ignores delayed passive diagnostics after an explicit test confirmed acceptance", async () => {
    let resolveDiagnostics;
    notificationService.getPushChannelDiagnostics.mockReturnValue(new Promise((resolve) => { resolveDiagnostics = resolve; }));
    const user = userEvent.setup();
    render(<TranslationProvider><NotificationControl userId="manager-uid" /></TranslationProvider>);
    await user.click(screen.getByRole("button", { name: "Enable & test notifications" }));
    await screen.findByText(translateInLanguage("en", "notifications.currentDeviceAccepted"));
    await act(async () => { resolveDiagnostics({ state: "incomplete" }); });
    expect(screen.getByRole("button", { name: "FCM registered for manager reminders" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Complete FCM setup for manager reminders" })).not.toBeInTheDocument();
  });

  it("does not leave passive checking stuck after an early unknown test result", async () => {
    notificationService.getPushChannelDiagnostics.mockReturnValue(new Promise(() => {}));
    notificationService.testCurrentDeviceNotifications.mockResolvedValue({ state: "unknown" });
    const user = userEvent.setup();
    render(<TranslationProvider><NotificationControl userId="manager-uid" /></TranslationProvider>);
    await user.click(screen.getByRole("button", { name: "Enable & test notifications" }));
    expect(await screen.findByRole("button", { name: "Unable to enable notifications. Try again." })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Checking notifications…" })).not.toBeInTheDocument();
  });

  it("does not apply a previous manager's pending test result after an account switch", async () => {
    let resolveTest;
    notificationService.testCurrentDeviceNotifications.mockReturnValue(new Promise((resolve) => { resolveTest = resolve; }));
    const user = userEvent.setup();
    const { rerender } = render(<TranslationProvider><NotificationControl userId="manager-a" /></TranslationProvider>);
    await user.click(screen.getByRole("button", { name: "Enable & test notifications" }));
    rerender(<TranslationProvider><NotificationControl userId="manager-b" /></TranslationProvider>);
    await act(async () => { resolveTest({ state: "fcm-accepted" }); });

    expect(screen.queryByText(translateInLanguage("en", "notifications.currentDeviceAccepted"))).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Enable notifications" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enable & test notifications" })).toBeEnabled();
  });

  it.each([
    ["en", "Enable & test notifications"],
    ["pt", "Ativar e testar notificações"],
    ["es", "Activar y probar notificaciones"],
  ])("keeps the %s test action visibly labeled and localized", async (language, label) => {
    window.localStorage.setItem("cleanflow-language", language);
    render(<TranslationProvider><NotificationControl userId="manager-uid" /></TranslationProvider>);
    const button = screen.getByRole("button", { name: label });
    expect(button).toHaveClass("notification-control__test");
    expect(button).toHaveTextContent(label);
    expect(button.querySelector(".notification-control__label")).toBeNull();
    expect(translateInLanguage(language, "notifications.currentDeviceAccepted")).not.toMatch(/^notifications\./);
  });
});
