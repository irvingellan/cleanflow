import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ClientReportControls } from "./ClientReportControls.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderControls(overrides = {}) {
  return render(
    <TranslationProvider>
      <ClientReportControls jobId="job-1" getContact={vi.fn().mockResolvedValue(null)} {...overrides} />
    </TranslationProvider>,
  );
}

describe("ClientReportControls", () => {
  it("creates one report link, then exposes copy and open actions", async () => {
    const getCapability = vi.fn().mockResolvedValue({ state: "NONE" });
    const issueReport = vi.fn().mockResolvedValue({
      created: true,
      capability: { state: "ACTIVE" },
      url: "https://cleanflow.example/client-report?t=secret",
    });
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: clipboardWrite } });
    renderControls({ getCapability, issueReport, revokeReport: vi.fn() });

    fireEvent.click(await screen.findByRole("button", { name: "Create client report" }));
    await waitFor(() => expect(issueReport).toHaveBeenCalledWith("job-1", {
      replaceExisting: false, presentation: { managerNote: "", includeCleanerNotes: true },
    }));
    expect(await screen.findByRole("link", { name: "Open report" })).toHaveAttribute(
      "href", "https://cleanflow.example/client-report?t=secret",
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy report link" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith("https://cleanflow.example/client-report?t=secret"));
    expect(screen.getByRole("button", { name: "Report link copied" })).toBeVisible();
  });

  it("warns and requires confirmation before replacing an already-shared link", async () => {
    const getCapability = vi.fn().mockResolvedValue({ state: "ACTIVE" });
    const issueReport = vi.fn().mockResolvedValue({
      created: true,
      capability: { state: "ACTIVE" },
      url: "https://cleanflow.example/client-report?t=new-secret",
    });
    const revokeReport = vi.fn().mockResolvedValue({ state: "REVOKED" });
    renderControls({ getCapability, issueReport, revokeReport });

    expect(await screen.findByText(/A client report link is active\./)).toBeVisible();
    expect(screen.getByText(/The active link cannot be shown again here/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copy report link" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open report" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace report link" }));
    expect(screen.getByText(/already shared with the client will stop working immediately/)).toBeVisible();
    expect(issueReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep current link" }));
    expect(issueReport).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Replace and disable old link" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace report link" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace and disable old link" }));
    await waitFor(() => expect(issueReport).toHaveBeenCalledWith("job-1", expect.objectContaining({ replaceExisting: true })));
    expect(await screen.findByRole("link", { name: "Open report" })).toHaveAttribute(
      "href", "https://cleanflow.example/client-report?t=new-secret",
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke report link" }));
    await waitFor(() => expect(revokeReport).toHaveBeenCalledWith("job-1"));
    expect(screen.queryByRole("link", { name: "Open report" })).not.toBeInTheDocument();
    expect(await screen.findByText("The client report link was revoked.")).toBeVisible();
  });

  it("prepares the note, opens WhatsApp addressed to the client and records the send only when confirmed", async () => {
    const getCapability = vi.fn().mockResolvedValue({ state: "NONE" });
    const issueReport = vi.fn().mockResolvedValue({
      created: true,
      capability: { state: "ACTIVE", presentation: { managerNote: "Towels in the closet.", includeCleanerNotes: false } },
      url: "https://cleanflow.example/client-report?t=secret",
    });
    const updateReport = vi.fn().mockResolvedValue({
      state: "ACTIVE", presentation: { managerNote: "Towels in the closet.", includeCleanerNotes: false },
      lastSent: { channel: "WHATSAPP", at: "2026-11-06T18:00:00.000Z" },
    });
    const getContact = vi.fn().mockResolvedValue({ name: "Dana Example", phone: "(555) 010-2030", email: "dana@example.com" });
    renderControls({
      getCapability, issueReport, updateReport, getContact,
      job: { clientId: "client-1", propertyName: "Seaside House", scheduledDate: "2026-09-23" },
    });

    fireEvent.change(await screen.findByLabelText("Message to the client (optional)"), { target: { value: "  Towels in the closet.  " } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Include the cleaner's notes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create client report" }));
    await waitFor(() => expect(issueReport).toHaveBeenCalledWith("job-1", {
      replaceExisting: false, presentation: { managerNote: "Towels in the closet.", includeCleanerNotes: false },
    }));
    expect(await screen.findByText("Send to Dana Example")).toBeVisible();
    const whatsapp = screen.getByRole("link", { name: "Send by WhatsApp" });
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/15550102030\?text=/);
    expect(decodeURIComponent(whatsapp.getAttribute("href"))).toContain("Hi Dana! The cleaning at Seaside House");
    expect(screen.getByRole("link", { name: "Send by email" }).getAttribute("href")).toMatch(/^mailto:dana@example\.com\?subject=/);
    expect(updateReport).not.toHaveBeenCalled();

    whatsapp.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(whatsapp);
    expect(updateReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, mark as sent" }));
    await waitFor(() => expect(updateReport).toHaveBeenCalledWith("job-1", { markSent: { channel: "WHATSAPP" } }));
    expect(await screen.findByText(/sent by WhatsApp on/)).toBeVisible();
  });

  it("edits the message of an active link without changing the link", async () => {
    const getCapability = vi.fn().mockResolvedValue({ state: "ACTIVE", presentation: { managerNote: "Old note", includeCleanerNotes: true } });
    const updateReport = vi.fn().mockResolvedValue({ state: "ACTIVE", presentation: { managerNote: "New note", includeCleanerNotes: true } });
    const issueReport = vi.fn();
    renderControls({ getCapability, updateReport, issueReport });

    expect(await screen.findByText("“Old note”")).toBeVisible();
    expect(screen.getByText(/not sent yet/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    fireEvent.change(screen.getByLabelText("Message to the client (optional)"), { target: { value: "New note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateReport).toHaveBeenCalledWith("job-1", { presentation: { managerNote: "New note", includeCleanerNotes: true } }));
    expect(await screen.findByText(/The client sees the change in the same link/)).toBeVisible();
    expect(issueReport).not.toHaveBeenCalled();
  });

  it("surfaces loading and action failure states", async () => {
    let resolveCapability;
    const getCapability = vi.fn(() => new Promise((resolve) => { resolveCapability = resolve; }));
    const issueReport = vi.fn().mockRejectedValue(new Error("denied"));
    renderControls({ getCapability, issueReport });

    expect(screen.getByText("Loading report…")).toBeVisible();
    resolveCapability({ state: "NONE" });
    fireEvent.click(await screen.findByRole("button", { name: "Create client report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to complete this report action. Try again.");
  });
});
