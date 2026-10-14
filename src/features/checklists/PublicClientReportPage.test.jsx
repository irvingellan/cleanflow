import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";

const { getPublicClientReport, publicClientReportPhotoUrl } = vi.hoisted(() => ({
  getPublicClientReport: vi.fn(),
  publicClientReportPhotoUrl: vi.fn(() => "/api/client-report?token=opaque&photo=1"),
}));

vi.mock("./clientReportService.js", () => ({ getPublicClientReport, publicClientReportPhotoUrl }));
const { PublicClientReportPage } = await import("./PublicClientReportPage.jsx");

afterEach(() => vi.clearAllMocks());

function renderPage(token = "opaque") {
  return render(<TranslationProvider><PublicClientReportPage token={token} /></TranslationProvider>);
}

describe("PublicClientReportPage", () => {
  it("represents all ID-scoped saved photos lazily without private technical labels", async () => {
    publicClientReportPhotoUrl.mockImplementation((_token, id) => `/api/client-report?photo=1&evidenceId=${id}`);
    getPublicClientReport.mockResolvedValue({ sections: [], hasPhoto: true, evidence: [{ evidenceId: "first", requirementId: "living-belongings" }, { evidenceId: "second", requirementId: "additional" }] });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning report" });
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images.map((image) => image.getAttribute("src"))).toEqual(["/api/client-report?photo=1&evidenceId=first", "/api/client-report?photo=1&evidenceId=second"]);
    for (const image of images) { expect(image).toHaveAttribute("loading", "lazy"); expect(image).toHaveAttribute("referrerPolicy", "no-referrer"); }
    expect(screen.queryByText("second")).not.toBeInTheDocument();
    publicClientReportPhotoUrl.mockImplementation(() => "/api/client-report?token=opaque&photo=1");
  });
  it("renders the saved read-only checklist, inventory, notes and evidence", async () => {
    getPublicClientReport.mockResolvedValue({
      titleKey: "clientReport.title",
      propertyName: "Seaside House",
      serviceDate: "2026-09-23",
      sections: [{
        titleKey: "checklistPreview.bathrooms",
        items: [{ labelKey: "checklistPreview.bathroomSanitize", answer: "DONE" }],
      }],
      inventoryItems: [{ labelKey: "checklistPreview.handSoap", answer: "NEEDS_RESTOCK" }],
      issueNotes: "Replace a bulb.",
      generalNotes: "Ready for review.",
      hasPhoto: true,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Cleaning report" })).toBeVisible();
    expect(screen.getByText("Seaside House")).toBeVisible();
    expect(screen.getByText("Sanitize toilet, sink, and shower")).toBeVisible();
    expect(screen.getByText("Done")).toBeVisible();
    expect(screen.getByText("Hand soap")).toBeVisible();
    expect(screen.getByText("Needs restock")).toBeVisible();
    expect(screen.getByText("Replace a bulb.")).toBeVisible();
    expect(screen.getByText("Ready for review.")).toBeVisible();
    expect(screen.getByRole("img", { name: "Photo evidence from the cleaning" })).toHaveAttribute("src", "/api/client-report?token=opaque&photo=1");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a safe unavailable state for an invalid or revoked link", async () => {
    getPublicClientReport.mockRejectedValue({ retryable: false });
    renderPage("invalid");

    expect(await screen.findByText("This cleaning report is no longer available.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("offers a retry after a temporary load failure and then shows the report", async () => {
    getPublicClientReport.mockRejectedValueOnce({ retryable: true }).mockResolvedValueOnce({
      titleKey: "clientReport.title",
      propertyName: "Seaside House",
      sections: [],
    });
    renderPage();

    expect(await screen.findByText("The cleaning report could not load right now. Please try again.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Cleaning report" })).toBeVisible();
    await waitFor(() => expect(getPublicClientReport).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
