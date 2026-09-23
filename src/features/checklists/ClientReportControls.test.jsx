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
      <ClientReportControls jobId="job-1" {...overrides} />
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
    await waitFor(() => expect(issueReport).toHaveBeenCalledWith("job-1", { replaceExisting: false }));
    expect(await screen.findByRole("link", { name: "Open report" })).toHaveAttribute(
      "href", "https://cleanflow.example/client-report?t=secret",
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy report link" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith("https://cleanflow.example/client-report?t=secret"));
    expect(screen.getByRole("button", { name: "Report link copied" })).toBeVisible();
  });

  it("rotates or revokes an existing report without retaining its prior URL", async () => {
    const getCapability = vi.fn().mockResolvedValue({ state: "ACTIVE" });
    const issueReport = vi.fn().mockResolvedValue({
      created: true,
      capability: { state: "ACTIVE" },
      url: "https://cleanflow.example/client-report?t=new-secret",
    });
    const revokeReport = vi.fn().mockResolvedValue({ state: "REVOKED" });
    renderControls({ getCapability, issueReport, revokeReport });

    expect(await screen.findByText("A client report link is active.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Replace report link" }));
    await waitFor(() => expect(issueReport).toHaveBeenCalledWith("job-1", { replaceExisting: true }));
    expect(await screen.findByRole("link", { name: "Open report" })).toHaveAttribute(
      "href", "https://cleanflow.example/client-report?t=new-secret",
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke report link" }));
    await waitFor(() => expect(revokeReport).toHaveBeenCalledWith("job-1"));
    expect(screen.queryByRole("link", { name: "Open report" })).not.toBeInTheDocument();
    expect(await screen.findByText("The client report link was revoked.")).toBeVisible();
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
