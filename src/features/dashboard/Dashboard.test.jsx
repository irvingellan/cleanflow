import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTranslation, TranslationProvider } from "../../i18n/translations.js";
import { Dashboard } from "./Dashboard.jsx";

function localDateKey(daysFromToday) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function DashboardHarness({ dashboardData }) {
  const { translate } = useTranslation();

  return (
    <Dashboard
      dashboardData={dashboardData}
      isLoading={false}
      hasError={false}
      translate={translate}
      onRefresh={() => {}}
      onOpenJob={() => {}}
      onShowJobs={() => {}}
      onShowJobsWithFilter={() => {}}
    />
  );
}

function renderDashboard(language = "en") {
  window.localStorage.setItem("cleanflow-language", language);

  const dashboardData = {
    counts: {},
    attentionJobs: [
      {
        id: "today-unassigned",
        propertyName: "Today Property",
        scheduledDate: localDateKey(0),
        operationalStatus: "UNASSIGNED",
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `old-unassigned-${index}`,
        propertyName: `Old August Property ${index + 1}`,
        scheduledDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
        operationalStatus: "UNASSIGNED",
      })),
      {
        id: "tomorrow-unassigned",
        propertyName: "Tomorrow Property",
        scheduledDate: localDateKey(1),
        operationalStatus: "UNASSIGNED",
      },
      {
        id: "today-assigned",
        propertyName: "Assigned Property",
        scheduledDate: localDateKey(0),
        assignedCleanerId: "cleaner-1",
        operationalStatus: "ASSIGNED",
      },
    ],
    offersByJob: {},
    pendingOffersByJob: {},
    cleanerNamesById: { "cleaner-1": "Ana" },
    openIssues: [],
    next48HoursJobs: [
      {
        id: "today-unassigned",
        propertyName: "Today Property",
        scheduledDate: localDateKey(0),
        operationalStatus: "UNASSIGNED",
      },
      {
        id: "tomorrow-unassigned",
        propertyName: "Tomorrow Property",
        scheduledDate: localDateKey(1),
        operationalStatus: "UNASSIGNED",
      },
      {
        id: "today-assigned",
        propertyName: "Assigned Property",
        scheduledDate: localDateKey(0),
        assignedCleanerId: "cleaner-1",
        operationalStatus: "ASSIGNED",
      },
    ],
    recentlyCompletedJobs: [],
  };

  return render(
    <TranslationProvider>
      <DashboardHarness dashboardData={dashboardData} />
    </TranslationProvider>,
  );
}

describe("Dashboard near-term cleaner attention", () => {
  it("makes today and tomorrow unassigned Jobs explicit without flagging assigned Jobs", () => {
    renderDashboard();

    const attentionList = document.querySelector(".attention-list");

    expect(attentionList).not.toBeNull();
    expect(within(attentionList).getByText("Today — no cleaner assigned")).toBeVisible();
    expect(within(attentionList).getByText("Tomorrow — no cleaner assigned")).toBeVisible();
    expect(within(attentionList).getByText("Today Property")).toBeVisible();
    expect(within(attentionList).getByText("Tomorrow Property")).toBeVisible();
    expect(within(attentionList).getByText("Old August Property 1")).toBeVisible();
    expect(within(attentionList).queryByText("Assigned Property")).not.toBeInTheDocument();

    const attentionLabels = Array.from(
      attentionList.querySelectorAll(".attention-item__label"),
      (label) => label.textContent,
    );
    expect(attentionLabels.slice(0, 2)).toEqual([
      "⏰Today — no cleaner assigned",
      "⏰Tomorrow — no cleaner assigned",
    ]);
  });

  it.each([
    ["pt", "Hoje — sem cleaner atribuída", "Amanhã — sem cleaner atribuída"],
    ["es", "Hoy — sin cleaner asignada", "Mañana — sin cleaner asignada"],
  ])("localizes the near-term attention labels in %s", (language, today, tomorrow) => {
    renderDashboard(language);

    expect(screen.getByText(today)).toBeVisible();
    expect(screen.getByText(tomorrow)).toBeVisible();
  });

  it("keeps Today and Tomorrow groups in the existing Next 48 Hours section", () => {
    renderDashboard();

    expect(screen.getByRole("heading", { name: "Next 48 hours" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Today" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Tomorrow" })).toBeVisible();
  });
});
