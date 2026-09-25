import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { CleanerDirectory } from "./CleanerDirectory.jsx";

function renderDirectory(cleaners = [{ id: "ana", name: "Ana" }, { id: "beatriz", name: "Beatríz Silva" }, { id: "joao", name: "João Costa" }], language = "en") {
  window.localStorage.setItem("cleanflow-language", language);
  return render(
    <TranslationProvider>
      <CleanerDirectory
        cleaners={cleaners}
        isLoading={false}
        hasError={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />
    </TranslationProvider>,
  );
}

describe("CleanerDirectory name search", () => {
  it("matches cleaner names without case or diacritic sensitivity", async () => {
    const user = userEvent.setup();
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: "Search cleaners by name" }), "BEATRIZ");

    expect(screen.getByRole("button", { name: "View Beatríz Silva" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "View Ana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View João Costa" })).not.toBeInTheDocument();
  });

  it("shows a localized empty-search state without replacing the directory empty state", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: "Search cleaners by name" }), "nobody");
    expect(screen.getByText("No cleaners match this search.")).toBeVisible();

    rerender(
      <TranslationProvider>
        <CleanerDirectory cleaners={[]} isLoading={false} hasError={false} onSelect={vi.fn()} onCreate={vi.fn()} />
      </TranslationProvider>,
    );
    expect(screen.getByText("No cleaners found.")).toBeVisible();
  });

  it.each([
    ["pt", "Buscar cleaners por nome", "Nenhuma cleaner corresponde a esta busca."],
    ["es", "Buscar cleaners por nombre", "Ninguna cleaner coincide con esta búsqueda."],
  ])("localizes search and no-match copy in %s", async (language, searchLabel, noMatch) => {
    const user = userEvent.setup();
    renderDirectory(undefined, language);

    const search = screen.getByRole("searchbox", { name: searchLabel });
    await user.type(search, "missing");
    expect(screen.getByText(noMatch)).toBeVisible();
  });
});
