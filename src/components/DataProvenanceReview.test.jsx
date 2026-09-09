import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../i18n/translations.js";
import { DataProvenanceReview } from "./DataProvenanceReview.jsx";

function renderReview(record, onSave = vi.fn()) {
  return render(
    <TranslationProvider>
      <DataProvenanceReview record={record} onSave={onSave} />
    </TranslationProvider>,
  );
}

describe("DataProvenanceReview", () => {
  it("renders the localized manager-facing review control", () => {
    window.localStorage.setItem("cleanflow-language", "pt");
    renderReview({ id: "property-1" });

    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));

    expect(screen.getByText("Origem do registro")).toBeVisible();
    expect(screen.getByText("Este registro é real ou de teste?")).toBeVisible();
    expect(screen.getByRole("button", { name: /REAL.*Dado verdadeiro/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /TESTE.*Criado apenas/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /DESCONHECIDO.*Ainda não/i })).toBeVisible();
  });

  it("renders the same control in Spanish", () => {
    window.localStorage.setItem("cleanflow-language", "es");
    renderReview({ id: "client-1" });

    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));

    expect(screen.getByText("Origen del registro")).toBeVisible();
    expect(screen.getByText("¿Este registro es real o de prueba?")).toBeVisible();
    expect(screen.getByRole("button", { name: /PRUEBA.*Creado solo/i })).toBeVisible();
  });

  it("updates the visible badge only after a successful save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    window.localStorage.setItem("cleanflow-language", "en");
    const { container } = renderReview({ id: "job-1", demoSeed: true }, onSave);

    expect(screen.getByText("TEST")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: /REAL.*Real operational/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("REAL"));
    expect(screen.getByText("Record source updated.")).toBeVisible();
    expect(container.querySelector(".data-provenance-badge")).toHaveTextContent("REAL");
  });

  it("preserves the current displayed value and reports a save failure", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("permission denied"));
    window.localStorage.setItem("cleanflow-language", "en");
    const { container } = renderReview({ id: "cleaner-1", dataProvenance: "UNKNOWN" }, onSave);

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: /REAL.*Real operational/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unable to update the record source. Try again.",
      );
    });
    expect(container.querySelector(".data-provenance-badge")).toHaveTextContent("UNKNOWN");
    expect(screen.queryByText("Record source updated.")).not.toBeInTheDocument();
  });
});
