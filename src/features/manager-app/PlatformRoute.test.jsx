import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ManagerRoot } from "./ManagerRoot.jsx";

const session = vi.hoisted(() => ({ authUser: null }));
vi.mock("../auth/authService.js", () => ({ signInWithEmail: vi.fn(), signOutManager: vi.fn() }));
vi.mock("../notifications/notificationService.js", () => ({ prepareManagerPushSignOut: vi.fn(), abortManagerPushSignOut: vi.fn() }));
vi.mock("../notifications/oneSignalService.js", () => ({ clearOneSignalUser: vi.fn() }));
vi.mock("../auth/useInitialManagerSession.js", () => ({ useInitialManagerSession: () => session }));
vi.mock("../auth/ManagerAccessBoundary.jsx", () => ({
  ManagerAccessBoundary: () => <p>Company membership required</p>,
}));
vi.mock("./ManagerApplication.jsx", () => ({ ManagerApplication: () => null }));
vi.mock("../dev-center/PlatformPage.jsx", () => ({ PlatformPage: () => <h1>Owner console</h1> }));

afterEach(() => {
  cleanup();
  session.authUser = null;
  window.history.replaceState(null, "", "/");
});

function open(path) {
  window.history.replaceState(null, "", path);
  render(<TranslationProvider><ManagerRoot /></TranslationProvider>);
}

it("asks for sign-in before opening the platform route", () => {
  open("/platform");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.queryByText("Owner console")).not.toBeInTheDocument();
});

it("uses the developer console's server gate independently of company membership", () => {
  session.authUser = { uid: "fixture-session" };
  open("/platform/");
  expect(screen.getByRole("heading", { name: "Owner console" })).toBeInTheDocument();
  expect(screen.queryByText("Company membership required")).not.toBeInTheDocument();
});

it("keeps the default workspace behind its manager membership check", () => {
  session.authUser = { uid: "fixture-session" };
  open("/");
  expect(screen.getByText("Company membership required")).toBeInTheDocument();
  expect(screen.queryByText("Owner console")).not.toBeInTheDocument();
});
