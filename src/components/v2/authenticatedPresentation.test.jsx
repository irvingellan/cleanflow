import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetailV2Pilot } from "../../features/jobs/JobDetailV2Pilot.jsx";
import ServicesV2Pilot from "../../features/jobs/ServicesV2Pilot.jsx";
import DashboardV2Pilot from "../../features/dashboard/DashboardV2Pilot.jsx";
import { getServiceLifecycleFixture } from "../../../scripts/serviceLifecycleFixtures.mjs";
import { buildIntegratedContext } from "../../../e2e/integrated-v2/fixtures.js";
import { createJobListFilters } from "../../features/jobs/jobListFilters.js";
import { translateInLanguage as translate } from "../../i18n/translations.js";
vi.mock("../../features/cleaners/cleanerService.js", () => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));
beforeEach(() => {
  localStorage.clear(); window.history.replaceState(null, "", "/?experience=v2");
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});
const wrap = node => <TranslationProvider>{node}</TranslationProvider>;
it("Services preserves its error state without inventing a nonfunctional Retry", () => {
  const { container } = render(wrap(<ServicesV2Pilot presentation="v2" hideComparison
    hasError jobs={[]} properties={[]} cleaners={[]} filters={createJobListFilters()} />));
  expect(container).toHaveTextContent(translate("en", "jobs.error"));
  expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
});
it("shared presentation selects detail V2 without a duplicate per-screen comparison", () => {
  const input = getServiceLifecycleFixture("assigned-draft");
  const { container, rerender } = render(wrap(<JobDetailV2Pilot {...input} presentation="v2" hideComparison />));
  expect(container.querySelector(".job-detail-v2")).toBeInTheDocument();
  expect(container.querySelector(".job-v2-comparison")).toBeNull();
  rerender(wrap(<JobDetailV2Pilot {...input} presentation="current" hideComparison />));
  expect(container.querySelector(".job-detail-v2")).toBeNull();
  expect(container.querySelector(".panel.job-detail")).toBeInTheDocument();
});
it("shared presentation selects Services without mutating or adding a second comparison", () => {
  const select = vi.fn(), context = buildIntegratedContext();
  const input = { jobs: context.jobs.slice(0, 3), filters: createJobListFilters(), cleaners: context.cleaners,
    properties: context.properties, onFiltersChange: vi.fn(), onSelect: select };
  const { container, rerender } = render(wrap(<ServicesV2Pilot {...input} presentation="v2" hideComparison />));
  expect(container.querySelector(".services-v2")).toBeInTheDocument();
  expect(container.querySelector(".services-v2-comparison")).toBeNull();
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(container.querySelector("[data-job-id]"));
  expect(select).toHaveBeenCalledWith(input.jobs[0], expect.objectContaining({ anchorJobId: input.jobs[0].id }));
  rerender(wrap(<ServicesV2Pilot {...input} presentation="current" hideComparison />));
  expect(container.querySelector(".services-v2")).toBeNull();
});
it("Dashboard CURRENT and V2 reuse the identical loaded metrics and navigation", () => {
  const context = buildIntegratedContext(), open = vi.fn();
  const input = { dashboardData: context.dashboardData, translate: key => translate("en", key), onOpenJob: open };
  const { container, rerender } = render(wrap(<DashboardV2Pilot {...input} presentation="v2" hideComparison />));
  expect(container.querySelector(".dashboard-v2")).toBeInTheDocument();
  expect(container.querySelector(".dashboard-pilot-comparison")).toBeNull();
  const values = [...container.querySelectorAll(".dashboard-v2-metric strong")].map(node => node.textContent);
  expect(values[0]).toBe(String(context.dashboardData.counts.today));
  expect(open).not.toHaveBeenCalled();
  rerender(wrap(<DashboardV2Pilot {...input} presentation="current" hideComparison />));
  expect(container.querySelector(".dashboard-v2")).toBeNull();
  expect(container.querySelector(".summary-card strong")).toHaveTextContent(String(context.dashboardData.counts.today));
});
