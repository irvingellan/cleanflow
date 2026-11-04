import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell.jsx";

function renderShell({ compact = false, onSelect = vi.fn(), inbox = true } = {}) {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: compact && query.includes("max-width: 719px"),
    addEventListener: () => {}, removeEventListener: () => {},
  });
  const items = [
    { key: "dashboard", icon: "home", label: "Painel", active: true, onSelect: () => onSelect("dashboard") },
    { key: "jobs", icon: "calendar", label: "Serviços", active: false, onSelect: () => onSelect("jobs") },
    { key: "properties", icon: "building", label: "Propriedades", active: false, onSelect: () => onSelect("properties") },
    { key: "payouts", icon: "wallet", label: "Pagamentos", active: false, onSelect: () => onSelect("payouts") },
  ];
  const view = render(
    <AppShell
      brandName="CleanFlow"
      navigationLabel="Navegação principal"
      items={items}
      mobileTabKeys={["dashboard", "jobs"]}
      moreLabel="Mais"
      closeLabel="Fechar"
      primaryAction={{ label: "Novo serviço", onSelect: () => onSelect("new") }}
      inbox={inbox ? { label: "Caixa de entrada", shortLabel: "Avisos", active: false, onSelect: () => onSelect("inbox"), badge: <span>3</span> } : null}
      account={{ label: "Conta: Gerente", name: "Gerente", detail: "g@example.test", initials: "GE" }}
      accountPanel={<button type="button">Sair</button>}
    >
      <p>Conteúdo</p>
    </AppShell>,
  );
  return { ...view, restore: () => { window.matchMedia = original; } };
}

let restore = () => {};
afterEach(() => restore());

describe("AppShell", () => {
  it("renders one main navigation with every destination on wide screens", () => {
    const onSelect = vi.fn();
    ({ restore } = renderShell({ onSelect }));
    const navs = screen.getAllByRole("navigation", { name: "Navegação principal" });
    expect(navs).toHaveLength(1);
    expect(within(navs[0]).getByRole("button", { name: "Painel" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(navs[0]).getByRole("button", { name: "Pagamentos" }));
    expect(onSelect).toHaveBeenCalledWith("payouts");
    expect(screen.getByRole("heading", { name: "CleanFlow" })).toBeInTheDocument();
  });

  it("keeps the account panel mounted but hidden, so its controls keep running", () => {
    ({ restore } = renderShell());
    const signOut = screen.getByRole("button", { name: "Sair", hidden: true });
    expect(signOut.closest(".cf-account-panel")).toHaveAttribute("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Conta: Gerente" }));
    expect(screen.getByRole("button", { name: "Sair" })).toBeVisible();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(signOut.closest(".cf-account-panel")).toHaveAttribute("hidden");
  });

  it("on phones shows tabs plus a More sheet with the remaining destinations", () => {
    const onSelect = vi.fn();
    ({ restore } = renderShell({ compact: true, onSelect }));
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(nav).getByRole("button", { name: "Serviços" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Propriedades" })).toBeNull();
    expect(within(nav).getByRole("button", { name: /Avisos/ })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Mais" }));
    const sheet = screen.getByRole("dialog", { name: "Mais" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Propriedades" }));
    expect(onSelect).toHaveBeenCalledWith("properties");
    expect(screen.queryByRole("dialog", { name: "Mais" })).toBeNull();
  });

  it("offers the primary New service action in both layouts", () => {
    const onSelect = vi.fn();
    ({ restore } = renderShell({ compact: true, onSelect }));
    fireEvent.click(screen.getByRole("button", { name: "Novo serviço" }));
    expect(onSelect).toHaveBeenCalledWith("new");
  });
});
