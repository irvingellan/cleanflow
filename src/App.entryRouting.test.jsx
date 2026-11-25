import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardEntryLoad } from "./app/entryLoadRecovery.js";
import { TranslationProvider } from "./i18n/translations.js";

// Characterization: which top-level screen each URL renders, and whether the
// manager session is read there. Synthetic tokens only; no provider call runs.
// Each entry is a lazy chunk, so every assertion waits for it to render.
vi.mock("./app/entryLoadRecovery.js", { spy: true });
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

import App, { preloadCurrentEntry } from "./App.jsx";
import { useInitialManagerSession } from "./features/auth/useInitialManagerSession.js";

// Entries are lazy chunks; under a loaded full-suite run the first import can exceed the 1 s default.
const lazyEntry = { timeout: 5000 };

const loadsDuringModuleImport = guardEntryLoad.mock.calls.length;
const checklistToken = "t".repeat(43);

function renderAt(url) {
  window.history.replaceState(null, "", url);
  return render(<TranslationProvider><App /></TranslationProvider>);
}

// The manager session hook lives in ManagerRoot: public URLs never call it.
function expectManagerSessionEnabled(expected) {
  if (!expected) {
    expect(useInitialManagerSession).not.toHaveBeenCalled();
    return;
  }
  expect(useInitialManagerSession).toHaveBeenCalled();
  for (const [enabled] of useInitialManagerSession.mock.calls) expect(enabled).toBe(true);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { window.history.replaceState(null, "", "/"); });

describe("App entry selection", () => {
  it("preloads the startup URL explicitly and reuses its download", async () => {
    expect(loadsDuringModuleImport).toBe(0);
    window.history.replaceState(null, "", "/offer/example");
    const download = preloadCurrentEntry();
    expect(preloadCurrentEntry()).toBe(download);
    expect((await download).default).toBe((await import("./features/public-offers/PublicOfferPage.jsx")).PublicOfferPage);
  });

  it.each(["/agenda", "/agenda.html"])("renders the Cleaner Hub at %s", async (url) => {
    renderAt(url);
    expect(await screen.findByTestId("entry-cleaner-hub", {}, lazyEntry)).toBeInTheDocument();
    expectManagerSessionEnabled(false);
  });

  it("renders the public checklist at /checklist with a token", async () => {
    renderAt(`/checklist?t=${checklistToken}`);
    expect(await screen.findByTestId("entry-public-checklist", {}, lazyEntry)).toHaveAttribute("data-token", checklistToken);
    expectManagerSessionEnabled(false);
  });

  it("renders the client report at /client-report", async () => {
    renderAt("/client-report?t=x");
    expect(await screen.findByTestId("entry-client-report", {}, lazyEntry)).toHaveAttribute("data-token", "x");
    expectManagerSessionEnabled(false);
  });

  it("renders the client portal at /portal", async () => {
    renderAt("/portal?t=x");
    expect(await screen.findByTestId("entry-client-portal", {}, lazyEntry)).toHaveAttribute("data-token", "x");
    expect(screen.queryByTestId("entry-client-report")).not.toBeInTheDocument();
    expectManagerSessionEnabled(false);
  });

  it("renders the checklist preview at /checklist-preview", async () => {
    renderAt("/checklist-preview");
    expect(await screen.findByTestId("entry-checklist-preview", {}, lazyEntry)).toBeInTheDocument();
    expectManagerSessionEnabled(false);
  });

  it("renders the public offer page at /offer/<token>", async () => {
    renderAt("/offer/abc");
    expect(await screen.findByText("Loading offer…", {}, lazyEntry)).toBeInTheDocument();
    expectManagerSessionEnabled(false);
  });

  it("renders the sign-in form at / when no manager is signed in", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Sign in" }, lazyEntry)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expectManagerSessionEnabled(true);
  });
});
