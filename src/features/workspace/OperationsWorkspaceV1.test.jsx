import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { jobScheduleAvailability } from "../jobs/jobScheduleAvailability.js";
import { OperationsWorkspaceV1, workspaceScenarios, workspaceSuggestion } from "./OperationsWorkspaceV1.jsx";
import { workspaceCopy } from "./workspaceCopy.js";

afterEach(() => { cleanup(); localStorage.clear(); });
function open(language = "pt") {
  localStorage.setItem("cleanflow-language", language);
  return render(<TranslationProvider><OperationsWorkspaceV1 /></TranslationProvider>);
}
describe("intent-first local Workspace", () => {
  it("suggests assignment without executing a mutation", () => {
    open();
    expect(screen.getAllByRole("button", { name: /Atribuir cleaner/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Atribuir \/ trocar/ }));
    expect(screen.getByText(/interesse nunca atribui automaticamente/)).toBeVisible();
  });
  it("assigned schedule intent reveals consequences only after selection", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Bay Apartment/ }));
    expect(screen.queryByText(/data anterior/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Alterar data/ }));
    expect(screen.getByText(/reenvie a mensagem atualizada/)).toBeVisible();
  });
  it("DRAFT schedule stays visible and points to review, not deletion", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Hill House/ }));
    const dateAction = screen.getByRole("button", { name: /Alterar data/ });
    expect(dateAction).toBeEnabled();
    fireEvent.click(dateAction);
    expect(screen.getByText(/Não apague o serviço/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Revisar o checklist existente/ }));
    expect(screen.getByText(/28 itens de checklist/)).toBeVisible();
    expect(screen.queryByText(/reenvie a mensagem atualizada/)).not.toBeInTheDocument();
  });
  it("READY prioritizes review and clears intent when changing jobs", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Palm Cottage/ }));
    expect(screen.getAllByRole("button", { name: /Revisar checklist/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Concluir serviço/ }));
    expect(screen.getByText(/O pagamento não é marcado como pago/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Garden Studio/ }));
    expect(screen.queryByText(/O pagamento não é marcado como pago/)).not.toBeInTheDocument();
  });
  it("keeps technical state collapsed and human identity visible", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Bay Apartment/ }));
    expect(screen.getByText("Alex Demo")).toBeVisible();
    expect(screen.getByText("Detalhes técnicos").parentElement).not.toHaveAttribute("open");
  });
  it("local copy has EN/PT/ES parity", () => {
    for (const language of ["pt", "es"]) expect(Object.keys(workspaceCopy[language]).sort()).toEqual(Object.keys(workspaceCopy.en).sort());
    open("es");
    expect(screen.getByRole("heading", { name: "¿Qué quieres hacer?" })).toBeVisible();
  });
  it("one UX suggestion per fixture without introducing lifecycle states", () => {
    expect(workspaceScenarios.map(workspaceSuggestion).map((item) => item.intent)).toEqual(["assign", "reminder", "checklist", "checklist", "history"]);
  });
});
describe("shared current Job Detail schedule guard", () => {
  const job = { operationalStatus: "ASSIGNED" };
  it("permits only pre-start non-archived states", () => {
    for (const operationalStatus of ["UNASSIGNED", "OFFERED", "ASSIGNED"]) expect(jobScheduleAvailability({ operationalStatus })).toBeNull();
    for (const operationalStatus of ["IN_PROGRESS", "COMPLETED"]) expect(jobScheduleAvailability({ operationalStatus })).toBe("jobs.scheduleReadOnlyState");
    expect(jobScheduleAvailability({ ...job, archivedAt: 1 })).toBe("jobs.scheduleReadOnlyState");
  });
  it("any existing Run blocks, including abandoned; read errors never unlock", () => {
    for (const status of ["DRAFT", "READY_FOR_REVIEW", "ABANDONED"]) expect(jobScheduleAvailability(job, { run: { status } })).toBe("jobs.scheduleLockedByChecklist");
    expect(jobScheduleAvailability(job, { loading: true })).toBe("jobs.scheduleCheckingChecklist");
    expect(jobScheduleAvailability(job, { error: true })).toBe("jobs.scheduleChecklistUnavailable");
  });
});
