import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ClientPortalAccess } from "./ClientPortalAccess.jsx";

vi.mock("./clientPortalService.js", () => ({
  getClientPortalAccess: vi.fn(), issueClientPortalAccess: vi.fn(), revokeClientPortalAccess: vi.fn(),
}));

function renderAccess(overrides = {}) {
  const props = {
    clientId: "client-a",
    load: vi.fn().mockResolvedValue({ state: "NONE" }),
    issue: vi.fn().mockResolvedValue({ state: "ACTIVE", expiresAt: "2027-05-10T00:00:00.000Z", url: "https://example.test/portal?t=synthetic" }),
    revoke: vi.fn().mockResolvedValue({ state: "REVOKED" }),
    ...overrides,
  };
  render(<TranslationProvider><ClientPortalAccess {...props} /></TranslationProvider>);
  return props;
}

describe("client portal link controls", () => {
  it("creates the link, shows it once and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const props = renderAccess();
    expect(await screen.findByText("No link is on for this client.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Create portal link" }));
    const link = await screen.findByLabelText("Client portal link");
    expect(link).toHaveValue("https://example.test/portal?t=synthetic");
    expect(props.issue).toHaveBeenCalledWith("client-a");
    expect(screen.getByText(/shown only this once/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://example.test/portal?t=synthetic"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("never shows an existing link again and can turn it off", async () => {
    const props = renderAccess({ load: vi.fn().mockResolvedValue({ state: "ACTIVE", expiresAt: "2027-05-10T00:00:00.000Z" }) });
    expect(await screen.findByText(/The link is on until/)).toBeVisible();
    expect(screen.queryByLabelText("Client portal link")).not.toBeInTheDocument();
    expect(screen.getByText("Creating a new link turns the earlier one off.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Turn link off" }));
    expect(await screen.findByText("No link is on for this client.")).toBeVisible();
    expect(props.revoke).toHaveBeenCalledWith("client-a");
    expect(screen.queryByRole("button", { name: "Turn link off" })).not.toBeInTheDocument();
  });

  it("says so when the request fails", async () => {
    renderAccess({ issue: vi.fn().mockRejectedValue(new Error("offline")) });
    fireEvent.click(await screen.findByRole("button", { name: "Create portal link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That did not work. Try again.");
  });
});
