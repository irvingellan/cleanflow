import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { NotificationDiagnostics } from "./NotificationDiagnostics.jsx";

function renderDiagnostics({ diagnostics, isLoading = false, hasError = false } = {}) {
  return render(
    <TranslationProvider>
      <NotificationDiagnostics
        diagnostics={diagnostics}
        isLoading={isLoading}
        hasError={hasError}
        onRefresh={vi.fn()}
      />
    </TranslationProvider>,
  );
}

describe("NotificationDiagnostics", () => {
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
});
