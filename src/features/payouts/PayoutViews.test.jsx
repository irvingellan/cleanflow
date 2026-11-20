import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PayoutDirectory, PayoutReview } from "./PayoutViews.jsx";

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

it.each([["en", "Needs review: hours"], ["pt", "Precisa de revisão: horas"], ["es", "Requiere revisión: horas"]])(
  "shows pending hours outside the selectable payout groups in %s", (language, heading) => {
    localStorage.setItem("cleanflow-language", language);
    const formatPrice = vi.fn(String);
    const props = { payoutGroups: [], recentPayouts: [], pendingHoursJobs: [
      { id: "pending", propertyName: "Sample property", scheduledDate: "2026-09-21" },
    ], formatPrice, formatCreatedAt: String };
    const view = (state) => <TranslationProvider><PayoutDirectory {...props} {...state} /></TranslationProvider>;
    const { rerender } = render(view({ isLoading: true }));
    expect(screen.queryByText(heading)).toBeNull();
    rerender(view({ hasError: true }));
    expect(screen.queryByText(heading)).toBeNull();
    rerender(view({}));
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByText(/Sample property/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(formatPrice).not.toHaveBeenCalled();
  },
);

it("reviews one cleaner's exact share of the completed team Job", () => {
  render(<TranslationProvider><PayoutReview cleaner={{ id: "first", name: "Example First" }}
    jobs={[{ id: "team", propertyName: "Example Property", cleanerPayout: 100, payoutShareCents: 3334 }]}
    formatPrice={value => value.toFixed(2)} formatDate={String} formatCreatedAt={String} /></TranslationProvider>);
  fireEvent.click(screen.getByRole("checkbox", { name: /Example Property/ }));
  expect(screen.getAllByText("33.34")).toHaveLength(2);
  expect(screen.queryByText("100.00")).not.toBeInTheDocument();
});

it("shows missing agreement amounts for review without offering a payment action", () => {
  localStorage.setItem("cleanflow-language", "en");
  render(<TranslationProvider><PayoutDirectory payoutGroups={[]} recentPayouts={[]}
    missingAgreementJobs={[{ id: "missing", propertyName: "Example Missing Terms" }]}
    formatPrice={String} formatCreatedAt={String} /></TranslationProvider>);
  expect(screen.getByRole("heading", { name: "Cleaner payout is not set." })).toBeInTheDocument();
  expect(screen.getByText("Example Missing Terms")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).toBeNull();
});
