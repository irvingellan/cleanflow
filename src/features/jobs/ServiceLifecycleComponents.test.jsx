import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TranslationProvider, translateInLanguage } from "../../i18n/translations.js";
import { ChecklistProgressSummary } from "./ChecklistProgressSummary.jsx";
import { ServiceLifecycleRail } from "./ServiceLifecycleRail.jsx";
import { serviceLifecyclePresentation } from "./serviceLifecyclePresentation.js";

function renderPresentation(input, language = "en") {
  localStorage.setItem("cleanflow-language", language);
  const model = serviceLifecyclePresentation(input);
  return render(<TranslationProvider>
    <ServiceLifecycleRail lifecycle={model.lifecycle} />
    <ChecklistProgressSummary checklist={model.checklist} />
  </TranslationProvider>);
}

beforeEach(() => localStorage.removeItem("cleanflow-language"));

describe("service lifecycle presentation components", () => {
  it("renders exactly five labelled stages, only one current step, and no interactive domain controls", () => {
    renderPresentation({ job: { operationalStatus: "IN_PROGRESS" }, checklistRun: null, capability: { state: "NONE" } });
    const rail = screen.getByRole("region", { name: "Service progress" });
    expect(within(rail).getAllByRole("listitem")).toHaveLength(5);
    const current = rail.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("In progress");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("No checklist created")).toBeVisible();
    expect(screen.getByText("No link issued")).toBeVisible();
    expect(rail.querySelector(".service-lifecycle__marker")).toBeNull();
    expect(rail.querySelector(".service-lifecycle__stage-state")).toBeNull();
    expect(within(rail).queryByText("Current")).not.toBeInTheDocument();
    expect(within(rail).queryByText("Upcoming")).not.toBeInTheDocument();
  });

  it("describes skipped, unknown past, completed, current and future states accessibly without fake checks", () => {
    const { rerender } = renderPresentation({ job: { operationalStatus: "ASSIGNED" }, offers: [], checklistRun: null });
    const rail = screen.getByRole("region", { name: "Service progress" });
    expect(within(rail).getByRole("listitem", { name: "Unassigned: Completed stage" })).toHaveClass("service-lifecycle__stage--completed");
    expect(within(rail).getByRole("listitem", { name: "Offered: Not used" })).toHaveClass("service-lifecycle__stage--skipped");
    expect(within(rail).getByRole("listitem", { name: "Assigned: Current" })).toHaveAttribute("aria-current", "step");
    expect(within(rail).getByRole("listitem", { name: "In progress: Upcoming" })).toHaveClass("service-lifecycle__stage--future");
    const model = serviceLifecyclePresentation({ job: { operationalStatus: "ASSIGNED" }, offers: [], offersError: true });
    rerender(<TranslationProvider><ServiceLifecycleRail lifecycle={model.lifecycle} /></TranslationProvider>);
    const unknown = screen.getByRole("listitem", { name: "Offered: History not verified" });
    expect(unknown).toHaveClass("service-lifecycle__stage--unknown-past");
    expect(unknown).not.toHaveTextContent("✓");
    expect(unknown).toHaveTextContent("?");
  });

  it.each([
    ["en", "Saved checklist", "Ready for manager review"],
    ["pt", "Checklist salvo", "Pronto para revisão do manager"],
    ["es", "Checklist guardado", "Listo para revisión del manager"],
  ])("COMPLETED + READY uses neutral %s saved copy instead of claiming a pending review", (language, saved, ready) => {
    const run = { status: "READY_FOR_REVIEW" };
    renderPresentation({ job: { operationalStatus: "COMPLETED" }, checklistRun: run }, language);
    expect(screen.getByText(saved)).toBeVisible();
    expect(screen.queryByText(ready)).not.toBeInTheDocument();
    expect(run.status).toBe("READY_FOR_REVIEW");
  });

  it("shows archived and unknown status text without fabricating a stage or progress", () => {
    renderPresentation({ job: { operationalStatus: "EXTRA", archivedAt: "server-time" } });
    expect(screen.getByText("Unknown status")).toBeVisible();
    expect(screen.getByText("Archived · historical record")).toBeVisible();
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Saved progress unavailable")).toBeVisible();
    expect(screen.getByText("Link status unavailable")).toBeVisible();
  });

  it("keeps IN_PROGRESS separate from DRAFT and labels only acknowledged saved answers", () => {
    renderPresentation({ job: { operationalStatus: "IN_PROGRESS" }, capability: { state: "ACTIVE" }, checklistRun: {
      status: "DRAFT", checklistItemCount: 18,
      draft: { progress: { checklist: { total: 18, done: 5, notApplicable: 2, unanswered: 11 } }, lastSavedAt: "2026-10-03T14:36:00.000Z" },
    } });
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.getByText("7 of 18 items saved")).toBeVisible();
    const bar = screen.getByRole("progressbar", { name: "Saved checklist answers" });
    expect(bar).toHaveAttribute("aria-valuenow", "39");
    expect(bar).toHaveAttribute("aria-valuetext", "7 of 18 items saved");
    expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-10-03T14:36:00.000Z");
  });

  it("never forces a READY Run to 100% or describes missing photos as confirmed evidence", () => {
    renderPresentation({ job: { operationalStatus: "ASSIGNED" }, capability: { state: "STALE" }, checklistRun: {
      status: "READY_FOR_REVIEW", checklistItemCount: 18, requiredPhotoCount: 1, evidence: null,
      draft: { progress: { checklist: { total: 18, done: 5, notApplicable: 2, unanswered: 11 } } },
    } });
    expect(screen.getByText("Ready for manager review")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "39");
    expect(screen.getByText("Stale · needs attention")).toBeVisible();
    expect(screen.queryByText(/requirements complete|evidence confirmed/i)).not.toBeInTheDocument();
    expect(screen.getByText("No saved update recorded yet")).toBeVisible();
  });

  it("does not render cached progress when the latest Run load fails", () => {
    renderPresentation({ runError: true, capabilityError: true, capability: { state: "ACTIVE" }, checklistRun: {
      status: "DRAFT", draft: { progress: { checklist: { total: 18, done: 18, notApplicable: 0, unanswered: 0 } } },
    } });
    expect(screen.getByText("Checklist status unavailable")).toBeVisible();
    expect(screen.getByText("Link status unavailable")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it.each([
    ["en", "Service progress", "Draft", "0 of 18 items saved", "No link issued"],
    ["pt", "Progresso do serviço", "Rascunho", "0 de 18 itens salvos", "Nenhum link emitido"],
    ["es", "Progreso del servicio", "Borrador", "0 de 18 elementos guardados", "No se ha emitido un enlace"],
  ])("renders saved zero with complete %s labels", (language, region, state, saved, link) => {
    renderPresentation({ job: { operationalStatus: "UNASSIGNED" }, capability: { state: "NONE" }, checklistRun: {
      status: "DRAFT", draft: { progress: { checklist: { total: 18, done: 0, notApplicable: 0, unanswered: 18 } } },
    } }, language);
    expect(screen.getByRole("region", { name: region })).toBeVisible();
    expect(screen.getByText(state)).toBeVisible();
    expect(screen.getByText(saved)).toBeVisible();
    expect(screen.getByText(link)).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("has EN/PT/ES copy for every emitted state and preview key, without untranslated keys", () => {
    const keys = ["execution", "unknown", "archived", "accessibleStage", "checklistTitle", "savedItems", "savedProgress", "progressUnknown", "lastSaved", "noSavedTime", "cleanerLink",
      "attention.staleLink", "attention.review", "attention.openIssues", "review", "openChecklist", "openIssues", "financialSnapshot", "cleanerSummary", "previewTitle", "previewDescription", "scenario", "previewAction", "previewEntry",
      ...["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"].map((state) => `stage.${state}`),
      ...["completed", "current", "future", "skipped", "unknown-past"].map((state) => `position.${state}`),
      ...["NONE", "LOADING", "UNKNOWN", "DRAFT", "READY_FOR_REVIEW", "ABANDONED", "SAVED"].map((state) => `checklist.${state}`),
      ...["NONE", "LOADING", "UNKNOWN", "ACTIVE", "STALE", "REVOKED", "EXPIRED", "UNAVAILABLE"].map((state) => `link.${state}`)];
    for (const language of ["en", "pt", "es"]) for (const suffix of keys) {
      const key = `lifecycle.${suffix}`;
      expect(translateInLanguage(language, key, { count: 1, saved: 7, total: 18 })).not.toBe(key);
    }
  });

  it("uses the approved short PT stage labels without changing the five operational states", () => {
    renderPresentation({ job: { operationalStatus: "IN_PROGRESS" }, checklistRun: null, capability: { state: "NONE" } }, "pt");
    expect([...document.querySelectorAll(".service-lifecycle__label")].map((label) => label.textContent)).toEqual([
      "Sem cleaner", "Oferecido", "Atribuído", "Em andamento", "Concluído",
    ]);
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent("Em andamento");
  });
});
