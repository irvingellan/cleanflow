import fs from "node:fs";
import { fireEvent, render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TranslationProvider, useTranslation } from "../../i18n/translations.js";
import DashboardV2Pilot from "./DashboardV2Pilot.jsx";
import { Dashboard } from "./Dashboard.jsx";
import { dashboardFixture } from "../../../e2e/dashboard-v2/fixtures.js";

let actions;
beforeEach(()=>{ window.history.replaceState(null,"","/?dashboard=v2"); localStorage.setItem("cleanflow-language","en"); actions={onOpenJob:vi.fn(),onShowJobs:vi.fn(),onShowJobsWithFilter:vi.fn(),onRefresh:vi.fn()}; });
afterEach(()=>cleanup());
function Harness({data=dashboardFixture(),loading=false,error=false,legacy=false}) {
  const {translate}=useTranslation(); const Component=legacy ? Dashboard : DashboardV2Pilot;
  return <Component dashboardData={data} isLoading={loading} hasError={error} translate={translate} {...actions} />;
}
const show=(props={})=>render(<TranslationProvider><Harness {...props} /></TranslationProvider>);

it("keeps named KPI labels with decorative semantic icons and attention accents matching existing labels",()=>{
  const {container}=show();
  const metrics=container.querySelectorAll(".dashboard-v2-metric");
  expect([...metrics].map(metric=>metric.querySelector(".dashboard-v2-metric-icon")?.getAttribute("data-tone"))).toEqual(["info","attention","brand","success","risk"]);
  for(const metric of metrics) expect(metric.querySelector(".dashboard-v2-metric-icon")).toHaveAttribute("aria-hidden","true");
  for(const row of container.querySelectorAll(".dashboard-v2-attention-row")) {
    const label=row.querySelector(".cfv2-state-label");
    const tone=[...label.classList].find(name=>name.startsWith("cfv2-tone-")).replace("cfv2-tone-","");
    expect(row).toHaveAttribute("data-tone",tone);
    expect(label.textContent.length).toBeGreaterThan(0);
  }
});

it.each(["en","pt","es"])("localizes every visible V2 label in %s",lang=>{
  localStorage.setItem("cleanflow-language",lang); const {container}=show();
  expect(container.textContent).not.toMatch(/dashboard\.|dashboardV2\.|common\.|lifecycle\./);
  expect(container.querySelectorAll(".dashboard-v2-metric")).toHaveLength(5);
});
it("preserves all four KPI filters; open issues remains informational",()=>{
  const {container}=show(); const metrics=container.querySelectorAll(".dashboard-v2-metric");
  for(const metric of [...metrics].slice(0,4)) fireEvent.click(metric);
  expect(actions.onShowJobsWithFilter.mock.calls.flat()).toEqual(["today","needs-assignment","in-progress","completed-today"]);
  expect(metrics[4].tagName).toBe("DIV");
});
it.each(["normal","heavy"])("preserves exact legacy priority order, limit and selected Job handlers in %s",scenario=>{
  const data=dashboardFixture(scenario); const current=show({data,legacy:true});
  const oldRows=[...current.container.querySelectorAll(".attention-item")];
  const names=oldRows.map(row=>row.querySelector("strong").textContent);
  oldRows.forEach(row=>fireEvent.click(row)); const expected=actions.onOpenJob.mock.calls.map(([job])=>job.id);
  current.unmount(); actions.onOpenJob.mockClear(); const v2=show({data});
  const rows=[...v2.container.querySelectorAll(".dashboard-v2-attention-row")];
  expect(rows.map(row=>row.querySelector("strong").textContent)).toEqual(names); expect(rows.length).toBeLessThanOrEqual(5);
  rows.forEach(row=>fireEvent.click(row)); expect(actions.onOpenJob.mock.calls.map(([job])=>job.id)).toEqual(expected);
  fireEvent.click(screen.getByRole("button",{name:/View all/}));expect(actions.onShowJobs).toHaveBeenCalledOnce();
});
it("passes no fabricated Offer absence or completion history",()=>{
  const {container}=show();
  const direct=[...container.querySelectorAll(".dashboard-v2-next-row")].find(row=>row.textContent.includes("Demo Property 03"));
  expect(direct.querySelector(".compact-lifecycle__stage--unknown-past")).not.toBeNull();
  const completed=dashboardFixture(); delete completed.recentlyCompletedJobs[0].completedAt;
  cleanup();show({data:completed});expect(screen.getByText("Completion time unavailable")).toBeVisible();
});
it("preserves Next48 groups, cleaner roster, order, and Job navigation",()=>{
  const data=dashboardFixture();const {container}=show({data});
  expect(container.querySelectorAll(".dashboard-v2-day")[0]).toHaveTextContent("Today");
  const rows=container.querySelectorAll(".dashboard-v2-next-row");
  rows.forEach(row=>fireEvent.click(row));
  expect(actions.onOpenJob.mock.calls.map(([job])=>job.id)).toEqual(data.next48HoursJobs.map(job=>job.id));
  expect(container.querySelector(".dashboard-v2-next")).toHaveTextContent("Demo Alpha");
});
it("preserves recent completion and weekly metrics/buckets exactly",()=>{
  const data=dashboardFixture();const {container}=show({data});
  const recent=container.querySelectorAll(".dashboard-v2-recent-row");recent.forEach(row=>fireEvent.click(row));
  expect(actions.onOpenJob.mock.calls.map(([job])=>job.id)).toEqual(data.recentlyCompletedJobs.map(job=>job.id));
  expect([...container.querySelectorAll(".dashboard-v2-week-metrics strong")].map(x=>Number(x.textContent))).toEqual([10,7,3,2]);
  expect([...container.querySelectorAll(".dashboard-v2-workload strong")].map(x=>Number(x.textContent))).toEqual([1,4,2,2,1,0,0]);
});
it("missing schedule time stays explicitly absent; never becomes midnight",()=>{
  const {container}=show({data:dashboardFixture("sparse")});expect(container.querySelector(".dashboard-v2-time")).toHaveTextContent("Not provided");
  expect(container.querySelector(".dashboard-v2-next")).not.toHaveTextContent("00:00");
});
it("initial loading preserves labeled shell and Skeleton without zero/success claims",()=>{
  const {container}=show({data:null,loading:true});
  expect(container.querySelectorAll(".cfv2-skeleton").length).toBeGreaterThan(5);
  expect(container.querySelectorAll(".dashboard-v2-metric > strong")).toHaveLength(0);
  expect(screen.queryByText("Dashboard loaded")).not.toBeInTheDocument();
  expect(container.querySelectorAll(".dashboard-v2-rows button")).toHaveLength(0);
});
it.each([{loading:true,error:false},{loading:false,error:true}])("retains data truthfully during refresh/error: %j",flags=>{
  const {container}=show(flags);expect(container.querySelector(".dashboard-v2-next-row")).toBeVisible();
  expect(screen.getAllByText("Previous data — not confirmed current").length).toBeGreaterThan(0);
  expect(screen.queryByText("Dashboard loaded")).not.toBeInTheDocument();
});
it("initial error exposes Retry with no invented successful sections",()=>{
  const {container}=show({data:null,error:true});expect(screen.getByRole("alert")).toHaveTextContent("Unable to load dashboard.");
  fireEvent.click(screen.getByRole("button",{name:"Try again"}));expect(actions.onRefresh).toHaveBeenCalledOnce();
  expect(container.querySelectorAll(".dashboard-v2-rows button")).toHaveLength(0);
});
it("all zero/empty is a quiet loaded state, not a fabricated error",()=>{
  const {container}=show({data:dashboardFixture("empty")});expect(container.querySelectorAll(".dashboard-v2-metric > strong")).toHaveLength(5);
  expect(screen.getByText("No items need attention right now.")).toBeVisible();
  expect(container.querySelectorAll(".dashboard-v2-metric--risk")).toHaveLength(0);
});
it("CURRENT/V2 switching reuses data, calls no service, preserves current markup and query context",()=>{
  const data=dashboardFixture();const {container}=show({data});
  fireEvent.click(screen.getByRole("button",{name:"Current",exact:true}));expect(container.querySelector(".dashboard")).toBeVisible();expect(container.querySelector(".dashboard-v2")).toBeNull();
  expect(location.search).not.toContain("dashboard=v2");
  fireEvent.click(screen.getByRole("button",{name:"V2",exact:true}));expect(container.querySelector(".dashboard-v2")).toBeVisible();expect(location.search).toContain("dashboard=v2");
  for(const handler of Object.values(actions)) expect(handler).not.toHaveBeenCalled();
});
it("V2 has no provider/controller imports; App uses Sandbox plus existing developer presentation gate",()=>{
  const source=fs.readFileSync("src/features/dashboard/DashboardV2Pilot.jsx","utf8");
  expect(source).not.toMatch(/from .*Service\.js|from .*Controller|firebase|fetch\(/);
  const app=fs.readFileSync("src/App.jsx","utf8");expect(app).toContain('const SandboxDashboard = import.meta.env.MODE === "sandbox"');
  expect(app).toContain('const DashboardPresentation = useIntegratedV2 ? SandboxDashboard : Dashboard');
  const preview=fs.readFileSync("e2e/integrated-v2/preview.jsx","utf8");
  expect(preview).toContain("import.meta.env.DEV");
  expect(preview).toContain('["127.0.0.1","localhost"].includes(location.hostname)');
});
it("all scoped CSS custom properties exist in Phase A",()=>{
  const css=fs.readFileSync("src/features/dashboard/dashboardV2.css","utf8"),tokens=fs.readFileSync("src/index.css","utf8");
  for(const [,token] of css.matchAll(/var\((--v2-[\w-]+)\)/g)) expect(tokens.includes(`${token}:`),token).toBe(true);
});
