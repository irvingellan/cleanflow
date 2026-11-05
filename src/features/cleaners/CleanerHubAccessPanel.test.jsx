import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { CleanerHubAccessPanel } from "./CleanerHubAccessPanel.jsx";

function service(access = { active: false, linkedAt: null, revokedAt: null, pendingCodeExpiresAt: null }) {
  return {
    cleanerHubUrl: () => "https://example.test/agenda",
    getCleanerHubAccess: vi.fn(async () => access),
    issueCleanerAccessCode: vi.fn(async () => ({ code: "ABCD-EFGH-JK23", expiresAt: "2026-11-06T12:00:00.000Z" })),
    revokeCleanerHubAccess: vi.fn(async () => ({ active: false })),
  };
}

function renderPanel(cleaner, fake) {
  window.localStorage.setItem("cleanflow-language", "en");
  return render(<TranslationProvider><CleanerHubAccessPanel cleaner={cleaner} service={fake} /></TranslationProvider>);
}

describe("CleanerHubAccessPanel", () => {
  it("issues a one-time code and prepares the message in the cleaner's language", async () => {
    const fake = service();
    renderPanel({ id: "ana", active: true, preferredLanguage: "pt" }, fake);
    expect(await screen.findByText("Not connected yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create access code" }));
    expect(fake.issueCleanerAccessCode).toHaveBeenCalledWith("ana");
    expect(await screen.findByText("ABCD-EFGH-JK23")).toBeInTheDocument();
    expect(screen.getByText(/Sua agenda CleanFlow: abra https:\/\/example.test\/agenda/)).toBeInTheDocument();
    expect(screen.getByText(/works once/)).toBeInTheDocument();
  });

  it("turns phone alerts on and off for one cleaner and reports a failed save", async () => {
    const fake = { ...service(), setCleanerPushAlerts: vi.fn(async () => {}) };
    renderPanel({ id: "ana", active: true }, fake);
    const toggle = await screen.findByRole("switch", { name: /Phone alerts/ });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Her notices stay in the Inbox/)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(fake.setCleanerPushAlerts).toHaveBeenCalledWith("ana", true);
    expect(await screen.findByRole("switch", { name: /Phone alerts/ })).toBeChecked();
    fake.setCleanerPushAlerts.mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(screen.getByRole("switch", { name: /Phone alerts/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not change phone alerts");
    expect(screen.getByRole("switch", { name: /Phone alerts/ })).toBeChecked();
  });

  it("shows the cleaner's active phones and sends a test notice only when alerts are on", async () => {
    const fake = {
      ...service(), setCleanerPushAlerts: vi.fn(async () => {}),
      getCleanerPushOverview: vi.fn(async () => ({ state: "ready", alertsEnabled: true, activeDevices: 2 })),
      sendCleanerPushTest: vi.fn(async () => ({ state: "sent", acceptedDevices: 2, targetDevices: 2 })),
    };
    const view = renderPanel({ id: "ana", active: true }, fake);
    await screen.findByRole("switch", { name: /Phone alerts/ });
    expect(screen.queryByRole("button", { name: "Send test alert" })).toBeNull();
    expect(fake.getCleanerPushOverview).not.toHaveBeenCalled();

    view.unmount();
    renderPanel({ id: "ana", active: true, pushAlertsEnabled: true }, fake);
    expect(await screen.findByText("Phones with alerts on: 2.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send test alert" }));
    expect(fake.sendCleanerPushTest).toHaveBeenCalledWith("ana");
    expect(await screen.findByText(/Accepted for 2 of 2 phones/)).toBeInTheDocument();

    fake.sendCleanerPushTest.mockResolvedValueOnce({ state: "rate-limited", retryAfterSeconds: 42 });
    await userEvent.click(screen.getByRole("button", { name: "Send test alert" }));
    expect(await screen.findByText("Wait 42 s before sending another test.")).toBeInTheDocument();
  });

  it("explains how to activate a phone and keeps the test disabled without one", async () => {
    const fake = {
      ...service(), setCleanerPushAlerts: vi.fn(async () => {}),
      getCleanerPushOverview: vi.fn(async () => ({ state: "ready", alertsEnabled: true, activeDevices: 0 })),
      sendCleanerPushTest: vi.fn(),
    };
    renderPanel({ id: "ana", active: true, pushAlertsEnabled: true }, fake);
    expect(await screen.findByText(/No phone has turned on alerts yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send test alert" })).toBeDisabled();
    fake.getCleanerPushOverview.mockResolvedValueOnce({ state: "ready", alertsEnabled: true, activeDevices: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Check phones again" }));
    expect(await screen.findByText("Phones with alerts on: 1.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send test alert" })).toBeEnabled();
  });

  it("hides phone alerts for an inactive cleaner", async () => {
    renderPanel({ id: "ana", active: false }, { ...service(), setCleanerPushAlerts: vi.fn() });
    expect(await screen.findByText(/Only an active cleaner/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("ends access only after confirmation", async () => {
    const fake = service({ active: true, linkedAt: "2026-11-01T12:00:00.000Z", revokedAt: null, pendingCodeExpiresAt: null });
    renderPanel({ id: "ana", active: true }, fake);
    expect(await screen.findByText(/Connected since/)).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "End access" }));
    expect(fake.revokeCleanerHubAccess).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "End access" }));
    expect(fake.revokeCleanerHubAccess).toHaveBeenCalledWith("ana");
    confirm.mockRestore();
  });

  it("does not offer access to an inactive cleaner", async () => {
    renderPanel({ id: "old", active: false }, service());
    expect(await screen.findByText("Only an active cleaner can receive schedule access.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create access code" })).toBeDisabled();
  });
});
