import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../i18n/translations.js";
import { useDevCenterController } from "../features/dev-center/useDevCenterController.js";
import { DeveloperEnvironmentControls, EnvironmentBanner } from "./EnvironmentBanner.jsx";

const services = vi.hoisted(() => ({
  getDevCenterAccess: vi.fn(), clearDevCenterData: vi.fn(), generateDevCenterScenario: vi.fn(),
  getManagerNotificationDiagnostics: vi.fn(), previewManagerReminder: vi.fn(),
}));
vi.mock("../features/dev-center/devCenterService.js", () => services);
const developer = { uid: "synthetic-developer", email: "developer@example.test" };
beforeEach(() => {
  vi.stubEnv("VITE_CLEANFLOW_ENV_NAVIGATION_EMAILS", developer.email);
  vi.stubEnv("VITE_CLEANFLOW_SANDBOX_PROJECT_ID", "clean-flow-sandbox-irving");
  vi.stubEnv("VITE_CLEANFLOW_SANDBOX_ORIGIN", "https://clean-flow-sandbox-irving.web.app");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("environment UI", () => {
  it("permanently identifies Sandbox including public/unauthenticated routes", () => {
    const { rerender } = render(<EnvironmentBanner environment="sandbox" />);
    expect(screen.getByRole("status")).toHaveTextContent("SANDBOX · TEST DATA");
    rerender(<EnvironmentBanner environment="production" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("shows build and full-origin navigation only for an allowlisted signed-in developer", () => {
    const buildId = "synthetic-commit-for-test";
    const view = (user) => <TranslationProvider><DeveloperEnvironmentControls user={user} environment="sandbox" buildId={buildId} /></TranslationProvider>;
    const { rerender } = render(view({ uid: "synthetic-manager", email: "manager@example.test" }));
    expect(screen.queryByText(/Build/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(view(developer));
    expect(screen.getByTitle(buildId)).toHaveTextContent("SANDBOX · Build synthetic-co");
    expect(screen.getByRole("link", { name: "Back to Production" })).toHaveAttribute("href", "https://clean-flow-prototipo.web.app");
    rerender(view(null));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("offers only the bound Sandbox origin to a Production developer", () => {
    render(<TranslationProvider><DeveloperEnvironmentControls user={developer} environment="production" /></TranslationProvider>);
    expect(screen.getByRole("link", { name: "Open Sandbox" })).toHaveAttribute("href", "https://clean-flow-sandbox-irving.web.app");
    expect(services.getDevCenterAccess).not.toHaveBeenCalled();
  });
  it("keeps navigation independent of pending/404 Functions while privileged Dev Center stays denied", async () => {
    let rejectAccess;
    services.getDevCenterAccess.mockImplementation(() => new Promise((_, reject) => { rejectAccess = reject; }));
    function ManagerHeader() {
      const controller = useDevCenterController({ view: "jobs" });
      return <TranslationProvider>
        <DeveloperEnvironmentControls user={developer} environment="sandbox" />
        <output aria-label="Dev Center access">{controller.access.authorized ? "authorized" : "denied"}</output>
        {controller.access.authorized && <button>Privileged Dev Center</button>}
      </TranslationProvider>;
    }
    render(<ManagerHeader />);
    expect(screen.getByRole("link", { name: "Back to Production" })).toBeVisible();
    expect(screen.getByLabelText("Dev Center access")).toHaveTextContent("denied");
    await act(async () => rejectAccess(Object.assign(new Error("Function unavailable"), { code: "functions/not-found", status: 404 })));
    await waitFor(() => expect(screen.getByLabelText("Dev Center access")).toHaveTextContent("denied"));
    expect(screen.queryByRole("button", { name: "Privileged Dev Center" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Production" })).toBeVisible();
    expect(services.generateDevCenterScenario).not.toHaveBeenCalled();
    expect(services.clearDevCenterData).not.toHaveBeenCalled();
  });
});
