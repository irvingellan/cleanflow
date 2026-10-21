import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.jsx";
import { initialState } from "./model/store.js";

const TODAY = "2026-10-20";

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});

function setup() {
  return render(<App initial={initialState(TODAY)} />);
}

describe("Manager Workspace V3 prototype", () => {
  it("opens on the hybrid Now screen with the most urgent item first", () => {
    setup();
    expect(screen.getByRole("button", { name: /Híbrido C\+A/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Comece por")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dune House" })).toBeInTheDocument();
  });

  it("keeps operational changes when switching between all four layouts", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: /Operação/ }));
    fireEvent.click(document.querySelector('[data-job-id="j14"]'));
    fireEvent.click(screen.getAllByRole("button", { name: "Atribuir cleaner" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Joana/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Atribuir Joana" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    for (const name of ["A · Calm Workspace", "B · Attention Cockpit"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getAllByText("Atribuída — cleaner ainda não avisada").length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole("button", { name: "C · Intent First" }));
    fireEvent.change(screen.getByRole("textbox", { name: /O que você precisa fazer/ }), { target: { value: "lembrar juniper" } });
    expect(screen.getAllByText("Juniper Loft").length).toBeGreaterThan(0);
  });

  it("changes the date range without losing the selected service", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: /Operação/ }));
    fireEvent.click(document.querySelector('[data-job-id="j14"]'));
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(screen.getByRole("heading", { name: "Juniper Loft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Amanhã" }));
    expect(screen.getByText("Este serviço está fora do período selecionado.")).toBeInTheDocument();
  });

  it("lets a cleaner confirm interest and shows it to the manager", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Visão da cleaner" }));
    fireEvent.click(screen.getByRole("button", { name: /Como Joana · Birch Cottage/ }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir o link" }));
    fireEvent.click(screen.getByRole("button", { name: "Tenho interesse" }));
    expect(screen.getByText("Interesse enviado")).toBeInTheDocument();
    expect(screen.getByText("A gerente já vê sua resposta. Ainda não é uma confirmação.")).toBeInTheDocument();
  });

  it("recovers a notification that was tapped before it was read", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    expect(screen.getByText(/Você tocou nesta notificação às 10:01/)).toBeInTheDocument();
    const item = screen.getByText("Renata enviou o checklist de Sunset Duplex").closest("li");
    act(() => { fireEvent.click(within(item).getByRole("button", { name: /Abrir serviço/ })); });
    expect(screen.getByRole("heading", { name: "Sunset Duplex" })).toBeInTheDocument();
  });

  it("switches language without changing data", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Mais"));
    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "en" } });
    expect(screen.getByText("Start with")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dune House" })).toBeInTheDocument();
  });
});
