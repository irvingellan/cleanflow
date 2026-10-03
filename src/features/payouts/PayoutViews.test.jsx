import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PayoutDirectory } from "./PayoutViews.jsx";

describe("Weekly Close entry in Payouts", () => {
  it.each([
    ["en", "Weekly close · Preview", "Read-only reconciliation."],
    ["pt", "Fechamento semanal · Prévia", "Reconciliação somente leitura."],
    ["es", "Cierre semanal · Vista previa", "Conciliación de solo lectura."],
  ])("provides one explicit read-only entry in %s without invoking payout actions", (language, label, description) => {
    localStorage.setItem("cleanflow-language", language);
    const onWeeklyClose = vi.fn();
    const onReview = vi.fn();
    const onUploadProof = vi.fn();
    render(<TranslationProvider><PayoutDirectory payoutGroups={[]} recentPayouts={[]}
      onWeeklyClose={onWeeklyClose} onReview={onReview} onUploadProof={onUploadProof}
      formatPrice={String} formatCreatedAt={String} /></TranslationProvider>);
    expect(screen.getAllByRole("button", { name: label })).toHaveLength(1);
    expect(screen.getByText((value) => value.startsWith(description))).toBeInTheDocument();
    expect(onWeeklyClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onWeeklyClose).toHaveBeenCalledOnce();
    expect(onReview).not.toHaveBeenCalled();
    expect(onUploadProof).not.toHaveBeenCalled();
  });
});
