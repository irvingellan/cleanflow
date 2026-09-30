import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { NotificationDiagnostics } from "./NotificationDiagnostics.jsx";

const lab = vi.hoisted(() => ({
  readLocalNotificationHealth: vi.fn(async () => ({
    deviceId: "device-12345678",
    notificationPermission: "denied",
    serviceWorker: "ready",
    fcmRegistration: "unknown",
    checkedAt: "2026-09-29T10:00:00.000Z",
  })),
  sendDeveloperTestNotification: vi.fn(),
}));

vi.mock("../notifications/notificationHealthService.js", () => ({ readLocalNotificationHealth: lab.readLocalNotificationHealth }));
vi.mock("./devCenterService.js", () => ({ sendDeveloperTestNotification: lab.sendDeveloperTestNotification }));

function renderDiagnostics({ diagnostics, isLoading = false, hasError = false, onRefresh = vi.fn() } = {}) {
  return render(
    <TranslationProvider>
      <NotificationDiagnostics
        diagnostics={diagnostics}
        isLoading={isLoading}
        hasError={hasError}
        onRefresh={onRefresh}
      />
    </TranslationProvider>,
  );
}

describe("NotificationDiagnostics", () => {
  beforeEach(() => {
    lab.readLocalNotificationHealth.mockClear();
    lab.sendDeveloperTestNotification.mockReset();
  });

  it("renders active and inactive device metadata and aggregate reminder outcomes", () => {
    renderDiagnostics({
      diagnostics: {
        devices: [
          { deviceId: "12345678", userEmail: "manager@example.test", platform: "web", language: "pt", active: true, lastSeenAt: "2026-09-10T14:00:00.000Z", updatedAt: null },
          { deviceId: "abcdefgh", userEmail: null, platform: "web", language: null, active: false, lastSeenAt: null, updatedAt: null },
        ],
        deliveries: [
          { reminderType: "TODAY_07", targetDate: "2026-09-10", timezone: "America/Los_Angeles", jobCount: 3, attentionCount: 1, deliveryStatus: "PARTIAL", attemptedDevices: 3, deliveredDevices: 1, failedDevices: 2, invalidatedDevices: 1, attemptedAt: "2026-09-10T14:00:00.000Z" },
          { reminderType: "TOMORROW_19", targetDate: "2026-09-11", deliveryStatus: "NO_ACTIVE_DEVICES", attemptedDevices: 0, deliveredDevices: 0, failedDevices: 0, invalidatedDevices: 0 },
        ],
      },
    });

    expect(screen.getByText("manager@example.test")).toBeVisible();
    expect(screen.getByText("Device ID: 12345678")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText("Inactive")).toBeVisible();
    expect(screen.getByText("Partially accepted")).toBeVisible();
    expect(screen.getByText("No active devices")).toBeVisible();
    expect(screen.getByText(/FCM accepted: 1/)).toBeVisible();
  });

  it("renders safe empty and error states", () => {
    renderDiagnostics({ diagnostics: { devices: [], deliveries: [] }, hasError: true });

    expect(screen.getByText("No registered manager push devices.")).toBeVisible();
    expect(screen.getByText("No manager reminder deliveries recorded.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load notification diagnostics.");
  });

  it.each([
    ["SENT", "Sent"],
    ["PARTIAL", "Partially accepted"],
    ["FAILED", "Not accepted"],
    ["NO_ACTIVE_DEVICES", "No active devices"],
    ["NO_ACTIVE_RECIPIENTS", "No active recipients"],
  ])("renders the %s delivery status safely", (deliveryStatus, label) => {
    renderDiagnostics({
      diagnostics: {
        devices: [],
        deliveries: [{ reminderType: "TODAY_07", deliveryStatus }],
      },
    });

    expect(screen.getByText(label)).toBeVisible();
  });

  it("renders OneSignal recipient outcomes without mislabeling them as FCM devices", () => {
    renderDiagnostics({
      diagnostics: {
        devices: [],
        deliveries: [{
          reminderType: "TODAY_07",
          deliveryProvider: "onesignal",
          deliveryStatus: "PARTIAL",
          attemptedRecipients: 2,
          acceptedRecipients: 1,
          failedRecipients: 0,
          noActiveRecipients: 1,
        }],
      },
    });

    expect(screen.getByText(/Provider: OneSignal/)).toBeVisible();
    expect(screen.getByText(/Attempted recipients: 2/)).toBeVisible();
    expect(screen.getByText(/In accepted OneSignal message batches: 1/)).toBeVisible();
    expect(screen.queryByText(/Targeted: 2/)).not.toBeInTheDocument();
  });

  it("shows a passive browser snapshot and health-only browsers without claiming an FCM registration", async () => {
    const { container } = renderDiagnostics({
      diagnostics: {
        devices: [],
        deliveries: [],
        healthReports: [{
          registrationId: "health-only-id", deviceId: "only-id", userEmail: "manager@example.test",
          notificationPermission: "denied", serviceWorker: "unavailable", fcmRegistration: "unknown",
          checkedAt: "2026-09-29T10:00:00.000Z",
        }],
      },
    });

    expect(await screen.findByText("FCM registration: Not verified in this session")).toBeVisible();
    expect(screen.getByText("Reported browsers without a registered FCM device")).toBeVisible();
    expect(screen.getByText("Device ID: only-id")).toBeVisible();
    expect(container).not.toHaveTextContent("Delivered to phone");
    expect(lab.sendDeveloperTestNotification).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Refresh notification status" }));
    await waitFor(() => expect(lab.readLocalNotificationHealth).toHaveBeenCalledTimes(2));
    expect(lab.sendDeveloperTestNotification).not.toHaveBeenCalled();
  });

  it("joins the latest channel report to its registered device without exposing a token", () => {
    renderDiagnostics({ diagnostics: {
      devices: [{ registrationId: "safe-registration-id", deviceId: "device12", active: true, userEmail: "manager@example.test", platform: "web" }],
      healthReports: [{ registrationId: "safe-registration-id", deviceId: "device12", notificationPermission: "granted", serviceWorker: "ready", fcmRegistration: "registered", checkedAt: "2026-09-29T10:00:00.000Z" }],
      deliveries: [],
    } });

    expect(screen.getByText("Browser permission: Allowed")).toBeVisible();
    expect(screen.getByText("FCM registration: Registered in this session")).toBeVisible();
    expect(screen.queryByText(/safe-registration-id/)).not.toBeInTheDocument();
  });

  it("sends one fixed developer test only after selecting an active device and confirming", async () => {
    lab.sendDeveloperTestNotification.mockResolvedValueOnce({ attempted: 1, provider: "fcm", providerAccepted: true, invalidated: false, status: "FCM_ACCEPTED" });
    renderDiagnostics({
      diagnostics: {
        devices: [
          { registrationId: "active-registration", deviceId: "active12", active: true, userEmail: "manager@example.test", platform: "web" },
          { registrationId: "inactive-registration", deviceId: "inactive", active: false, userEmail: "other@example.test", platform: "web" },
        ],
        deliveries: [],
      },
    });

    expect(screen.queryByRole("option", { name: /inactive/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare test" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Target device"), { target: { value: "active-registration" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare test" }));
    expect(lab.sendDeveloperTestNotification).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send test notification" }));

    await waitFor(() => expect(lab.sendDeveloperTestNotification).toHaveBeenCalledExactlyOnceWith("active-registration"));
    expect(await screen.findByText("FCM accepted the test request. Display on the phone is not verified.")).toBeVisible();
  });

  it("shows a safe cooldown error and never offers a test when all devices are inactive", async () => {
    renderDiagnostics({ diagnostics: { devices: [{ registrationId: "inactive", deviceId: "inactive", active: false }], deliveries: [] } });
    expect(screen.getByText("No active registered FCM device is available for a test.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Prepare test" })).toBeDisabled();
  });

  it("clears the pending state after a server-enforced test cooldown", async () => {
    lab.sendDeveloperTestNotification.mockRejectedValueOnce({ code: "functions/resource-exhausted" });
    renderDiagnostics({ diagnostics: {
      devices: [{ registrationId: "active-registration", deviceId: "active12", active: true, platform: "web" }],
      deliveries: [],
    } });
    fireEvent.change(screen.getByLabelText("Target device"), { target: { value: "active-registration" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare test" }));
    fireEvent.click(screen.getByRole("button", { name: "Send test notification" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Test cooldown is active");
    expect(screen.getByRole("button", { name: "Prepare test" })).toBeEnabled();
  });

  it("does not mislabel an ambiguous FCM outcome as confirmed failure", async () => {
    lab.sendDeveloperTestNotification.mockResolvedValueOnce({ attempted: 1, provider: "fcm", providerAccepted: null, invalidated: false, status: "UNKNOWN" });
    renderDiagnostics({ diagnostics: {
      devices: [{ registrationId: "active-registration", deviceId: "active12", active: true, platform: "web" }],
      deliveries: [],
    } });
    fireEvent.change(screen.getByLabelText("Target device"), { target: { value: "active-registration" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare test" }));
    fireEvent.click(screen.getByRole("button", { name: "Send test notification" }));

    expect(await screen.findByText("FCM outcome is unknown. Do not retry blindly; check the audit result.")).toBeVisible();
    expect(screen.queryByText(/FCM did not confirm acceptance/)).not.toBeInTheDocument();
  });

  it("treats a lost callable response as unknown and refreshes the server audit", async () => {
    const onRefresh = vi.fn();
    lab.sendDeveloperTestNotification.mockRejectedValueOnce(new Error("network response lost"));
    renderDiagnostics({
      diagnostics: {
        devices: [{ registrationId: "active-registration", deviceId: "active12", active: true, platform: "web" }],
        deliveries: [],
      },
      onRefresh,
    });
    fireEvent.change(screen.getByLabelText("Target device"), { target: { value: "active-registration" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare test" }));
    fireEvent.click(screen.getByRole("button", { name: "Send test notification" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to confirm whether FCM accepted the test");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(lab.sendDeveloperTestNotification).toHaveBeenCalledTimes(1);
  });
});
