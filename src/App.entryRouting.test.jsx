import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "./i18n/translations.js";

// Characterization: which top-level screen each URL renders, and whether the
// manager session is read there. Synthetic tokens only; no provider call runs.
vi.mock("./features/auth/authService.js", () => ({
  signInWithEmail: vi.fn(),
  signOutManager: vi.fn(),
  subscribeToAuthState: (callback) => { callback(null); return () => {}; },
}));
vi.mock("./features/auth/useInitialManagerSession.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useInitialManagerSession: vi.fn(actual.useInitialManagerSession) };
});
vi.mock("./features/public-offers/publicOfferService.js", () => ({
  getPublicOffer: () => new Promise(() => {}),
  respondToPublicOffer: vi.fn(),
  acknowledgePublicOfferAssignment: vi.fn(),
}));
vi.mock("./features/cleaner-hub/CleanerHubApp.jsx", () => ({
  CleanerHubApp: () => <div data-testid="entry-cleaner-hub" />,
}));
vi.mock("./features/checklists/PublicChecklistPage.jsx", () => ({
  PublicChecklistPage: ({ token }) => <div data-testid="entry-public-checklist" data-token={token} />,
}));
vi.mock("./features/checklists/PublicClientReportPage.jsx", () => ({
  PublicClientReportPage: ({ token }) => <div data-testid="entry-client-report" data-token={token} />,
}));
vi.mock("./features/client-portal/PublicClientPortalPage.jsx", () => ({
  PublicClientPortalPage: ({ token }) => <div data-testid="entry-client-portal" data-token={token} />,
}));
vi.mock("./features/checklist-preview/CleaningChecklistPreview.jsx", () => ({
  CleaningChecklistPreview: () => <div data-testid="entry-checklist-preview" />,
}));

import App from "./App.jsx";
import { useInitialManagerSession } from "./features/auth/useInitialManagerSession.js";

const checklistToken = "t".repeat(43);

function renderAt(url) {
  window.history.replaceState(null, "", url);
  return render(<TranslationProvider><App /></TranslationProvider>);
}

function expectManagerSessionEnabled(expected) {
  expect(useInitialManagerSession).toHaveBeenCalled();
  for (const [enabled] of useInitialManagerSession.mock.calls) expect(enabled).toBe(expected);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { window.history.replaceState(null, "", "/"); });

describe("App entry selection", () => {
  it.each(["/agenda", "/agenda.html"])("renders the Cleaner Hub at %s", (url) => {
    renderAt(url);
    expect(screen.getByTestId("entry-cleaner-hub")).toBeInTheDocument();
    expectManagerSessionEnabled(false);
  });

  it("renders the public checklist at /checklist with a token", () => {
    renderAt(`/checklist?t=${checklistToken}`);
    expect(screen.getByTestId("entry-public-checklist")).toHaveAttribute("data-token", checklistToken);
    expectManagerSessionEnabled(false);
  });

  it("renders the client report at /client-report", () => {
    renderAt("/client-report?t=x");
    expect(screen.getByTestId("entry-client-report")).toHaveAttribute("data-token", "x");
    expectManagerSessionEnabled(false);
  });

  it("renders the client portal at /portal", () => {
    renderAt("/portal?t=x");
    expect(screen.getByTestId("entry-client-portal")).toHaveAttribute("data-token", "x");
    expect(screen.queryByTestId("entry-client-report")).not.toBeInTheDocument();
    expectManagerSessionEnabled(false);
  });

  it("renders the checklist preview at /checklist-preview", () => {
    renderAt("/checklist-preview");
    expect(screen.getByTestId("entry-checklist-preview")).toBeInTheDocument();
    expectManagerSessionEnabled(false);
  });

  it("renders the public offer page at /offer/<token>", () => {
    renderAt("/offer/abc");
    expect(screen.getByText("Loading offer…")).toBeInTheDocument();
    expectManagerSessionEnabled(false);
  });

  it("renders the sign-in form at / when no manager is signed in", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expectManagerSessionEnabled(true);
  });
});
