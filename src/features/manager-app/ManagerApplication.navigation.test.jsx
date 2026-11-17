import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";

// Characterization of the manager's view transitions: which screen each action
// opens, where "back" returns, which navigation item is active, and the URL of
// the two views that can be entered by address. Every screen is a stand-in that
// shows its name and one button per callback it receives.
const fixtures = vi.hoisted(() => ({
  devCenter: { authorized: false, isChecking: false },
  job: { id: "job-1", propertyName: "Job one", propertyId: "property-1" },
  property: { id: "property-1", name: "Property one" },
  cleaner: { id: "cleaner-1", name: "Cleaner one" },
  client: { id: "client-1", name: "Client one" },
  payoutGroup: { cleaner: { id: "cleaner-1" }, jobs: [] },
}));

/** A screen stand-in: its name as a heading, and a button for each `on…` callback. */
const stub = vi.hoisted(() => (name, payloads = {}) => function ScreenStub(props) {
  return (
    <section>
      <h2>{name}</h2>
      {Object.keys(props).filter((key) => /^on[A-Z]/.test(key) && typeof props[key] === "function").map((key) => (
        <button key={key} type="button" onClick={() => props[key](payloads[key])}>{`${name}: ${key}`}</button>
      ))}
    </section>
  );
});

vi.mock("../auth/authService.js", () => ({
  signInWithEmail: vi.fn(), signOutManager: vi.fn(), subscribeToAuthState: () => () => {},
}));
vi.mock("../notifications/useOneSignalIdentity.js", () => ({ useOneSignalIdentity: () => {} }));
vi.mock("../telemetry/useManagerPageLoadTelemetry.js", () => ({ useManagerPageLoadTelemetry: () => {} }));
vi.mock("../../components/shell/AppShell.jsx", () => ({
  AppShell: ({ items, primaryAction, inbox, children }) => <>
    {items.map((item) => (
      <button key={item.key} aria-current={item.active ? "page" : undefined} onClick={item.onSelect}>{item.key}</button>
    ))}
    <button onClick={primaryAction.onSelect}>new service</button>
    {inbox && <button aria-current={inbox.active ? "page" : undefined} onClick={inbox.onSelect}>inbox</button>}
    {children}
  </>,
}));
vi.mock("../notifications/NotificationInbox.jsx", () => ({
  useNotificationInbox: () => ({ state: "ready", items: [], open: vi.fn() }),
  NotificationInboxBadge: () => null,
  NotificationInbox: stub("Inbox"),
}));
vi.mock("../dashboard/Dashboard.jsx", () => ({ Dashboard: stub("Dashboard", { onOpenJob: fixtures.job }) }));
vi.mock("../dashboard/useDashboardController.js", () => ({ useDashboardController: () => ({}) }));
vi.mock("../jobs/JobsPage.jsx", () => ({ JobsPage: stub("Jobs list", { onSelect: fixtures.job }) }));
vi.mock("../jobs/JobForm.jsx", () => ({ CreateCleaningForm: stub("New service", { onCreated: fixtures.job }) }));
vi.mock("../jobs/JobDetail.jsx", () => ({ JobDetail: stub("Job detail") }));
vi.mock("../jobs/JobWorkflowViews.jsx", () => ({
  AssignedCleanerJob: stub("Cleaner job"),
  IssueForm: stub("Issue form"),
  IssueSuccess: stub("Issue sent"),
  OfferCleaners: stub("Offer cleaners"),
}));
vi.mock("../checklists/ChecklistRunDetail.jsx", () => ({ ChecklistRunDetail: stub("Checklist") }));
vi.mock("../jobs/SandboxLifecyclePreview.jsx", () => ({ SandboxLifecyclePreview: stub("Lifecycle preview") }));
vi.mock("../jobs/jobService.js", async (original) => ({ ...(await original()), getJobById: vi.fn() }));
vi.mock("../jobs/useJobsWorklist.js", () => ({
  useJobsWorklist: () => ({ jobs: [], cleaners: [], setFilters: () => {}, resetPagination: () => {} }),
}));
vi.mock("../jobs/useJobDetailController.js", async () => {
  const { useState } = await import("react");
  return { useJobDetailController: () => {
    const [job, setJob] = useState(null);
    return {
      job, detail: { checklistRun: { id: "run-1" }, offers: [], assignments: [] },
      offerFlow: { availableCleaners: [], clearOffersCreatedCount: () => {}, recordOffersCreated: () => {} },
      actions: { createChecklistRun: async () => ({ id: "run-1" }) },
      openJob: setJob, closeJob: () => setJob(null), prepareJobDetailRefresh: () => {},
    };
  } };
});
vi.mock("../properties/PropertyDirectory.jsx", () => ({ PropertyDirectory: stub("Properties list", { onSelect: fixtures.property }) }));
vi.mock("../properties/PropertyDetail.jsx", () => ({ PropertyDetail: stub("Property detail", { onOpenJob: fixtures.job }) }));
vi.mock("../properties/PropertyForm.jsx", () => ({
  PropertyForm: stub("New property"),
  PropertyEditForm: stub("Edit property"),
  PropertyClientLinkForm: stub("Link property to client"),
}));
vi.mock("../properties/usePropertiesController.js", async () => {
  const { useState } = await import("react");
  return { usePropertiesController: () => {
    const [selectedProperty, setSelectedProperty] = useState(null);
    return {
      directory: { properties: [] },
      selection: { selectedProperty, clearProperty: () => setSelectedProperty(null), openProperty: setSelectedProperty },
    };
  } };
});
vi.mock("../cleaners/CleanerDirectory.jsx", () => ({ CleanerDirectory: stub("Cleaners list", { onSelect: fixtures.cleaner }) }));
vi.mock("../cleaners/CleanerDetail.jsx", () => ({ CleanerDetail: stub("Cleaner detail", { onOpenJob: fixtures.job }) }));
vi.mock("../cleaners/CleanerProfileForm.jsx", () => ({
  CleanerProfileForm: stub("Cleaner form"),
  CleanerProfileSuccess: stub("Cleaner saved"),
}));
vi.mock("../cleaners/useCleanersController.js", async () => {
  const { useState } = await import("react");
  return { useCleanersController: () => {
    const [selectedCleaner, setSelectedCleaner] = useState(null);
    return {
      directory: { cleaners: [] },
      profile: {
        selectedCleaner, savedCleaner: null, clearCleaner: () => setSelectedCleaner(null),
        openCleaner: setSelectedCleaner, clearSavedCleaner: () => {},
      },
    };
  } };
});
vi.mock("../cleaner-agenda/CleanerAgendaView.jsx", () => ({ CleanerAgendaView: stub("Cleaner agenda", { onOpenJob: fixtures.job }) }));
vi.mock("../cleaner-alerts/CleanerAlertsView.jsx", () => ({ CleanerAlertsView: stub("Cleaner alerts", { onOpenCleaner: fixtures.cleaner }) }));
vi.mock("../clients/ClientDirectory.jsx", () => ({ ClientDirectory: stub("Clients list", { onSelect: fixtures.client }) }));
vi.mock("../clients/ClientDetail.jsx", () => ({
  ClientDetail: stub("Client detail", { onOpenProperty: fixtures.property, onOpenJob: fixtures.job }),
}));
vi.mock("../clients/ClientForm.jsx", () => ({ ClientForm: stub("Client form") }));
vi.mock("../clients/useClientsController.js", async () => {
  const { useState } = await import("react");
  return { useClientsController: () => {
    const [selectedClient, setSelectedClient] = useState(null);
    return {
      directory: { clients: [] },
      detail: { selectedClient, clearClient: () => setSelectedClient(null), openClient: setSelectedClient },
    };
  } };
});
vi.mock("../payouts/PayoutViews.jsx", () => ({
  PayoutDirectory: stub("Payouts list", { onReview: fixtures.payoutGroup }),
  PayoutReview: stub("Payout review"),
}));
vi.mock("../payouts/usePayoutsController.js", async () => {
  const { useState } = await import("react");
  return { usePayoutsController: () => {
    const [selectedGroup, setSelectedGroup] = useState(null);
    return {
      directory: {}, proof: {},
      review: {
        selectedGroup, resetPayoutView: () => setSelectedGroup(null), openReview: setSelectedGroup,
        recordPayoutComplete: () => setSelectedGroup(null),
      },
    };
  } };
});
vi.mock("../weekly-close/WeeklyClosePreview.jsx", () => ({ WeeklyClosePreview: stub("Weekly close") }));
vi.mock("../dev-center/DevCenter.jsx", () => ({ DevCenter: stub("Developer center") }));
vi.mock("../dev-center/useDevCenterController.js", () => ({
  useDevCenterController: () => ({ access: { ...fixtures.devCenter } }),
}));
vi.mock("../telemetry/ManagerPageLoadDiagnostics.jsx", () => ({ ManagerPageLoadDiagnostics: stub("Load time diagnostics") }));

import { ManagerApplication } from "./ManagerApplication.jsx";

const screens = [
  "Dashboard", "Jobs list", "New service", "Job detail", "Offer cleaners", "Cleaner job", "Issue form", "Issue sent",
  "Checklist", "Properties list", "Property detail", "New property", "Edit property", "Link property to client",
  "Cleaners list", "Cleaner detail", "Cleaner form", "Cleaner agenda", "Cleaner alerts", "Clients list", "Client detail",
  "Client form", "Payouts list", "Payout review", "Weekly close", "Developer center", "Load time diagnostics", "Inbox",
];

function open(path = "/") {
  window.history.replaceState(null, "", path);
  render(
    <TranslationProvider>
      <ManagerApplication authUser={{ uid: "synthetic-manager" }} hasSignOutError={false} isSigningOut={false} onSignOut={() => {}} />
    </TranslationProvider>,
  );
}
/** Presses a navigation item, or the `callback` button of the screen called `name`. */
function press(name, callback) {
  fireEvent.click(screen.getByRole("button", { name: callback ? `${name}: ${callback}` : name, exact: true }));
}
/** The single screen on show, and the navigation item marked as current. */
function expectScreen(name, section) {
  const shown = screens.filter((candidate) => screen.queryByRole("heading", { name: candidate, exact: true }));
  expect(shown).toEqual([name]);
  if (section) expect(screen.getByRole("button", { name: section, exact: true })).toHaveAttribute("aria-current", "page");
}

beforeEach(() => {
  localStorage.setItem("cleanflow-language", "en");
  Object.assign(fixtures.devCenter, { authorized: false, isChecking: false });
});

describe("manager navigation", () => {
  it("starts on the Dashboard", () => {
    open();
    expectScreen("Dashboard", "dashboard");
  });

  it.each([
    ["dashboard", "Dashboard"],
    ["jobs", "Jobs list"],
    ["properties", "Properties list"],
    ["cleaners", "Cleaners list"],
    ["clients", "Clients list"],
    ["payouts", "Payouts list"],
  ])("the %s navigation item opens its list", (section, list) => {
    open();
    press("payouts");
    press(section);
    expectScreen(list, section);
  });

  it("shows the developer item only to an authorized developer, and it opens the Developer center", () => {
    open();
    expect(screen.queryByRole("button", { name: "dev-center" })).toBeNull();
    fixtures.devCenter.authorized = true;
    press("jobs");
    press("dev-center");
    expectScreen("Developer center", "dev-center");
  });

  it("the primary action opens the new service form, which returns to the Jobs list", () => {
    open();
    press("new service");
    expectScreen("New service", "jobs");
    press("New service", "onBack");
    expectScreen("Jobs list", "jobs");
  });
});

describe("list, detail and back", () => {
  it("properties: list, detail, edit and back to each", () => {
    open();
    press("properties");
    press("Properties list", "onSelect");
    expectScreen("Property detail", "properties");
    press("Property detail", "onEdit");
    expectScreen("Edit property", "properties");
    press("Edit property", "onBack");
    expectScreen("Property detail", "properties");
    press("Property detail", "onLinkClient");
    expectScreen("Link property to client", "properties");
    press("Link property to client", "onBack");
    press("Property detail", "onBack");
    expectScreen("Properties list", "properties");
  });

  it("properties: the new property form returns to the list", () => {
    open();
    press("properties");
    press("Properties list", "onCreate");
    expectScreen("New property", "properties");
    press("New property", "onBack");
    expectScreen("Properties list", "properties");
  });

  it("properties: a new service started from a property returns to that property", () => {
    open();
    press("properties");
    press("Properties list", "onSelect");
    press("Property detail", "onCreateCleaning");
    expectScreen("New service", "properties");
    press("New service", "onBack");
    expectScreen("Property detail", "properties");
  });

  it("cleaners: list, detail, edit and back to each", () => {
    open();
    press("cleaners");
    press("Cleaners list", "onSelect");
    expectScreen("Cleaner detail", "cleaners");
    press("Cleaner detail", "onEdit");
    expectScreen("Cleaner form", "cleaners");
    press("Cleaner form", "onBack");
    expectScreen("Cleaner detail", "cleaners");
    press("Cleaner detail", "onBack");
    expectScreen("Cleaners list", "cleaners");
  });

  it("cleaners: the new cleaner form, the agenda and the alerts return to the list", () => {
    open();
    press("cleaners");
    press("Cleaners list", "onCreate");
    expectScreen("Cleaner form", "cleaners");
    press("Cleaner form", "onBack");
    press("Cleaners list", "onAgenda");
    expectScreen("Cleaner agenda", "cleaners");
    press("Cleaner agenda", "onBack");
    press("Cleaners list", "onAlerts");
    expectScreen("Cleaner alerts", "cleaners");
    press("Cleaner alerts", "onOpenCleaner");
    expectScreen("Cleaner detail", "cleaners");
    press("Cleaner detail", "onBack");
    expectScreen("Cleaners list", "cleaners");
  });

  it("clients: list, detail, edit and back to each", () => {
    open();
    press("clients");
    press("Clients list", "onSelect");
    expectScreen("Client detail", "clients");
    press("Client detail", "onEdit");
    expectScreen("Client form", "clients");
    press("Client form", "onBack");
    expectScreen("Client detail", "clients");
    press("Client detail", "onBack");
    expectScreen("Clients list", "clients");
  });

  it("clients: a property opened from a client returns to that client", () => {
    open();
    press("clients");
    press("Clients list", "onSelect");
    press("Client detail", "onOpenProperty");
    expectScreen("Property detail", "clients");
    press("Property detail", "onBack");
    expectScreen("Client detail", "clients");
    press("Client detail", "onCreateProperty");
    expectScreen("New property", "clients");
    press("New property", "onBack");
    expectScreen("Client detail", "clients");
  });

  it("jobs: list, detail and back to the list", () => {
    open();
    press("jobs");
    press("Jobs list", "onSelect");
    expectScreen("Job detail", "jobs");
    press("Job detail", "onBack");
    expectScreen("Jobs list", "jobs");
  });

  it("payouts: list, review and back to the list", () => {
    open();
    press("payouts");
    press("Payouts list", "onReview");
    expectScreen("Payout review", "payouts");
    press("Payout review", "onBack");
    expectScreen("Payouts list", "payouts");
  });
});

describe("Job detail returns to where it was opened", () => {
  it.each([
    ["the Dashboard", [], ["Dashboard", "onOpenJob"], "Dashboard", "dashboard"],
    ["a property", [["properties"], ["Properties list", "onSelect"]], ["Property detail", "onOpenJob"], "Property detail", "properties"],
    ["a client", [["clients"], ["Clients list", "onSelect"]], ["Client detail", "onOpenJob"], "Client detail", "clients"],
    ["a cleaner", [["cleaners"], ["Cleaners list", "onSelect"]], ["Cleaner detail", "onOpenJob"], "Cleaner detail", "cleaners"],
    ["the cleaner agenda", [["cleaners"], ["Cleaners list", "onAgenda"]], ["Cleaner agenda", "onOpenJob"], "Cleaner agenda", "cleaners"],
    ["the new service form", [["new service"]], ["New service", "onCreated"], "Jobs list", "jobs"],
  ])("from %s", (_origin, steps, opener, origin, section) => {
    open();
    for (const step of steps) press(...step);
    press(...opener);
    expectScreen("Job detail", section);
    press("Job detail", "onBack");
    expectScreen(origin, section);
  });

  it("the workflow screens opened from a Job return to it", () => {
    open();
    press("Dashboard", "onOpenJob");
    press("Job detail", "onOfferToCleaners");
    expectScreen("Offer cleaners", "dashboard");
    press("Offer cleaners", "onBack");
    expectScreen("Job detail", "dashboard");
    press("Job detail", "onOpenChecklistRun");
    expectScreen("Checklist", "dashboard");
    press("Checklist", "onBack");
    expectScreen("Job detail", "dashboard");
    press("Job detail", "onSimulateAssignedCleaner");
    expectScreen("Cleaner job", "dashboard");
    press("Cleaner job", "onReportIssue");
    expectScreen("Issue form", "dashboard");
    press("Issue form", "onSubmitted");
    expectScreen("Issue sent", "dashboard");
    press("Issue sent", "onBackToCleaning");
    press("Cleaner job", "onBackToJob");
    expectScreen("Job detail", "dashboard");
  });
});

describe("Inbox", () => {
  it("opens from the shell and from the Dashboard, marks no section as current, and returns to the Dashboard", () => {
    open();
    press("jobs");
    press("inbox");
    expectScreen("Inbox");
    expect(screen.getByRole("button", { name: "inbox" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "jobs" })).not.toHaveAttribute("aria-current");
    press("Inbox", "onBack");
    expectScreen("Dashboard", "dashboard");
    press("Dashboard", "onShowInbox");
    expectScreen("Inbox");
  });
});

describe("views with their own address", () => {
  it("payouts open the weekly close at its address, and back returns to payouts at the root address", () => {
    open();
    press("payouts");
    press("Payouts list", "onWeeklyClose");
    expectScreen("Weekly close", "payouts");
    expect(window.location.pathname).toBe("/weekly-close-preview");
    press("Weekly close", "onBack");
    expectScreen("Payouts list", "payouts");
    expect(window.location.pathname).toBe("/");
  });

  it("the weekly close address opens the weekly close, and leaving it resets the address", () => {
    open("/weekly-close-preview");
    expectScreen("Weekly close", "payouts");
    expect(window.location.pathname).toBe("/weekly-close-preview");
    press("jobs");
    expectScreen("Jobs list", "jobs");
    expect(window.location.pathname).toBe("/");
  });

  it("the load-times address opens the diagnostics for a developer, and back resets the address", () => {
    fixtures.devCenter.authorized = true;
    open("/diagnostics/load-times");
    expectScreen("Load time diagnostics", "dev-center");
    expect(window.location.pathname).toBe("/diagnostics/load-times");
    press("Load time diagnostics", "onBack");
    expectScreen("Developer center", "dev-center");
    expect(window.location.pathname).toBe("/");
  });

  it("the load-times address refuses a manager who is not a developer and offers the Dashboard", () => {
    open("/diagnostics/load-times");
    expect(screens.filter((name) => screen.queryByRole("heading", { name, exact: true }))).toEqual([]);
    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dashboard", exact: true }));
    expectScreen("Dashboard", "dashboard");
    expect(window.location.pathname).toBe("/");
  });
});
