import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { TranslationProvider, usePublicTranslation } from "./translations.js";

function PublicLanguageProbe({ preferredLanguage }) {
  const { language, setLanguage, translate } = usePublicTranslation(preferredLanguage);
  return (
    <div>
      <span>{language}</span>
      <span>{translate("publicOffer.title")}</span>
      <button type="button" onClick={() => setLanguage("es")}>Choose Spanish</button>
    </div>
  );
}

describe("public cleaner language", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses the Cleaner preference locally and allows an override without changing manager UI preference", async () => {
    window.localStorage.setItem("cleanflow-language", "en");
    render(
      <TranslationProvider>
        <PublicLanguageProbe preferredLanguage="pt" />
      </TranslationProvider>,
    );

    await waitFor(() => expect(screen.getByText("pt")).toBeVisible());
    expect(screen.getByText("Oportunidade de limpeza")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Choose Spanish" }));
    expect(screen.getByText("es")).toBeVisible();
    expect(screen.getByText("Oportunidad de limpieza")).toBeVisible();
    expect(window.localStorage.getItem("cleanflow-language")).toBe("en");
  });

  it.each([[undefined], ["fr"], ["pt-BR"]])("uses English rather than a manager/browser locale for invalid preference %s", async (preferredLanguage) => {
    window.localStorage.setItem("cleanflow-language", "es");
    render(
      <TranslationProvider>
        <PublicLanguageProbe preferredLanguage={preferredLanguage} />
      </TranslationProvider>,
    );

    expect(await screen.findByText("en")).toBeVisible();
    expect(screen.getByText("Cleaning opportunity")).toBeVisible();
    expect(window.localStorage.getItem("cleanflow-language")).toBe("es");
  });
});
