import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../App.jsx";
import { initialState } from "../model/store.js";

beforeEach(() => { window.localStorage.clear(); Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 }); });
const open = () => { render(<App initial={initialState("2026-11-03")} />); fireEvent.click(screen.getByRole("button", { name: /Cleaner Hub/ })); };
const scenario = id => fireEvent.click(document.querySelector(`.hb-scenarios li:nth-child(${"ABCDEFGHIJKLMNO".indexOf(id) + 1}) button`));
const app = () => within(document.querySelector(".hb-app"));

describe("Cleaner Hub", () => {
  it("A: installed app shows her upcoming confirmed cleanings", () => {
    open(); scenario("A");
    expect(app().getByRole("heading", { name: "Olá, Renata" })).toBeInTheDocument();
    expect(document.querySelectorAll(".hb-app .hb-job").length).toBeGreaterThanOrEqual(3);
    expect(app().getByText("Avisos ok")).toBeInTheDocument();
  });

  it("D → allow: only a confirmed test makes the phone ready", async () => {
    open(); scenario("D");
    expect(app().getByRole("heading", { name: /ativar avisos/ })).toBeInTheDocument();
    fireEvent.click(app().getByRole("button", { name: "Permitir avisos" }));
    fireEvent.click(screen.getByRole("button", { name: "Permitir" }));
    await waitFor(() => expect(app().getByRole("heading", { name: /não conseguimos confirmar/ })).toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(app().getByRole("button", { name: "Enviar aviso de teste" }));
    fireEvent.click(app().getByRole("button", { name: "Sim, apareceu" }));
    expect(app().getByRole("heading", { name: "Pronto — este aparelho" })).toBeInTheDocument();
  });

  it("G: provider accepted but display unknown is never shown as ready", () => {
    open(); scenario("G");
    expect(app().getByRole("heading", { name: /Desconhecido/ })).toBeInTheDocument();
    expect(app().getByText(/aceitou o último envio, mas não sabemos/)).toBeInTheDocument();
  });

  it("H: a missed push is still in Avisos and opens the job", () => {
    open(); scenario("H");
    const row = app().getAllByRole("button", { name: /Lembrete:/ })[0];
    fireEvent.click(row);
    fireEvent.click(app().getByRole("button", { name: /Abrir serviço/ }));
    expect(app().getByText("Você recebe")).toBeInTheDocument();
  });

  it("N: incomplete Notion coverage is announced on the schedule", () => {
    open(); scenario("N");
    expect(app().getByText("Agenda pode estar incompleta")).toBeInTheDocument();
  });

  it("B: first-use onboarding walks through identity and install guidance", () => {
    open(); scenario("B");
    fireEvent.click(app().getByRole("button", { name: "Continuar" }));
    fireEvent.click(app().getByRole("button", { name: "Usar o código da demonstração" }));
    fireEvent.click(app().getByRole("button", { name: "Continuar" }));
    expect(app().getByRole("heading", { name: "Estas são as suas próximas limpezas" })).toBeInTheDocument();
    fireEvent.click(app().getByRole("button", { name: "Continuar" }));
    expect(app().getByText(/Daqui não dá para saber|Não dá para saber daqui/)).toBeInTheDocument();
    expect(app().getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
  });

  it("O: the manager away center lists decisions only", () => {
    open(); scenario("O");
    expect(screen.getByRole("heading", { name: "Enquanto você esteve fora" })).toBeInTheDocument();
    expect(screen.getByText(/pediu para trocar um serviço/)).toBeInTheDocument();
  });
});
