import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../App.jsx";
import { buildDemoState } from "../model/demoData.js";
import { initialState } from "../model/store.js";
import { TASKS, countNavigation } from "./TaskTrial.jsx";

beforeEach(() => { window.localStorage.clear(); Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 }); });

describe("task trial and compact strategy", () => {
  it("counts each changed navigation dimension once", () => {
    const a = { mode: "a", hybridScreen: "now", selectedJobId: null, filter: "needsYou", range: { kind: "today", start: "x" } };
    expect(countNavigation(a, { ...a })).toBe(0);
    expect(countNavigation(a, { ...a, selectedJobId: "j1", filter: "all" })).toBe(2);
    expect(countNavigation(a, { ...a, overlay: { type: "detail", jobId: "j1" } })).toBe(2);
  });

  it("task checks recognise the right kind of service", () => {
    const data = buildDemoState("2026-10-20");
    const job = id => data.jobs.find(j => j.id === id);
    const task = id => TASKS.find(t => t.id === id).test;
    expect(task("noCleaner")(data, job("j14"))).toBe(true);
    expect(task("checklist")(data, job("j05"))).toBe(true);
    expect(task("issue")(data, job("j08"))).toBe(true);
    expect(task("completed")(data, job("j04"))).toBe(true);
    expect(task("completed")(data, job("j14"))).toBe(false);
  });

  it("compact list shows every fact of the selected service without disclosures", () => {
    const initial = initialState("2026-10-20");
    initial.ui.mode = "compact"; initial.ui.filter = "all"; initial.ui.selectedJobId = "j08";
    render(<App initial={initial} />);
    const sheet = screen.getByRole("article");
    expect(within(sheet).getByRole("heading", { name: "Alder Court 3" })).toBeInTheDocument();
    for (const label of ["Ofertas", "Checklist", "Acesso"]) expect(within(sheet).getByText(label)).toBeInTheDocument();
    expect(sheet.querySelector("details")).toBeNull();
  });

  it("runs a trial and records the result", () => {
    render(<App initial={initialState("2026-10-20")} />);
    fireEvent.click(screen.getByRole("button", { name: /Testar tarefas/ }));
    fireEvent.change(screen.getAllByRole("combobox").find(s => s.closest(".tt")), { target: { value: "s3" } });
    fireEvent.click(screen.getByRole("button", { name: "Começar" }));
    fireEvent.click(document.querySelector('[data-job-id="j14"]'));
    fireEvent.click(screen.getByRole("button", { name: "Encontrei" }));
    const table = document.querySelector(".tt-results table");
    expect(within(table).getByText("Próxima ação de hoje").closest("tr").textContent).toMatch(/1 · 0/);
  });
});
