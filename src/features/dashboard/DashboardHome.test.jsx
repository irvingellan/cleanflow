import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider, useTranslation } from "../../i18n/translations.js";
import { Dashboard } from "./Dashboard.jsx";

function today() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function Harness(props) {
  const { translate } = useTranslation();
  return <Dashboard isLoading={false} hasError={false} translate={translate} onRefresh={() => {}}
    onShowJobs={() => {}} onShowJobsWithFilter={() => {}} {...props} />;
}

function renderHome(props) {
  window.localStorage.setItem("cleanflow-language", "pt");
  return render(<TranslationProvider><Harness {...props} /></TranslationProvider>);
}

const interestedJob = { id: "j1", propertyName: "Juniper Loft", scheduledDate: today(), scheduledStart: "13:00", operationalStatus: "OFFERED" };

describe("Operations home", () => {
  it("opens an interested-cleaner decision focused on the interest panel", () => {
    const onOpenJob = vi.fn();
    renderHome({
      onOpenJob,
      dashboardData: { counts: {}, attentionJobs: [interestedJob], offersByJob: { j1: [{ cleanerId: "c1", cleanerName: "Bia", status: "INTERESTED" }] } },
    });
    fireEvent.click(screen.getByRole("button", { name: /Juniper Loft.*Revisar interessadas/ }));
    expect(onOpenJob).toHaveBeenCalledWith(interestedJob, "interest");
  });

  it("lists only unread, openable checklist notices and opens them through the Inbox action", () => {
    const onOpenNotice = vi.fn();
    const notices = [
      { id: "n1", type: "CHECKLIST_READY_FOR_REVIEW", read: false, openable: true, serviceLabel: "Cedar Cottage", createdAtMs: Date.now() },
      { id: "n2", type: "CHECKLIST_READY_FOR_REVIEW", read: true, openable: true, serviceLabel: "Read Flat", createdAtMs: Date.now() },
      { id: "n3", type: "CHECKLIST_READY_FOR_REVIEW", read: false, openable: false, serviceLabel: "Gone Flat", createdAtMs: Date.now() },
      { id: "n4", type: "TODAY_07", read: false, openable: true, serviceLabel: null, createdAtMs: Date.now() },
    ];
    renderHome({ onOpenJob: vi.fn(), onOpenNotice, notices, dashboardData: { counts: {}, attentionJobs: [] } });
    expect(screen.getByRole("heading", { name: "Prontos para você revisar" })).toBeInTheDocument();
    expect(screen.queryByText("Read Flat")).toBeNull();
    expect(screen.queryByText("Gone Flat")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Cedar Cottage/ }));
    expect(onOpenNotice).toHaveBeenCalledWith(notices[0]);
  });

  it("does not invent a review section when no notice is loaded", () => {
    renderHome({ onOpenJob: vi.fn(), notices: [], dashboardData: { counts: {}, attentionJobs: [] } });
    expect(screen.queryByRole("heading", { name: "Prontos para você revisar" })).toBeNull();
    expect(screen.getByText("Nenhum item precisa de atenção agora.")).toBeInTheDocument();
  });
});
