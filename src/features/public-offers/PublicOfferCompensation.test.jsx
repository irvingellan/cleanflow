import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranslationProvider, useTranslation } from "../../i18n/translations.js";
import { buildCleanerOfferMessage } from "../jobs/offerCompensation.js";
import { PublicOfferCompensation } from "./PublicOfferCompensation.jsx";

function OfferMessagePreview() {
  const { language, translate } = useTranslation();
  return (
    <p>{buildCleanerOfferMessage({
      cleanerName: "Ana",
      propertyName: "Demo Property",
      scheduledDate: "2026-09-25",
      offeredCompensation: null,
      publicUrl: "https://cleanflow.example/offer/synthetic",
      language,
      translate,
    })}</p>
  );
}

describe("PublicOfferCompensation", () => {
  it("shows the offered amount with a label that does not imply it was paid", () => {
    render(<TranslationProvider><dl><PublicOfferCompensation amount={125} /></dl></TranslationProvider>);

    expect(screen.getByText("Offered compensation")).toBeVisible();
    expect(screen.getByText("$125.00")).toBeVisible();
    expect(screen.queryByText("Your payment")).not.toBeInTheDocument();
  });

  it("explicitly shows an unset amount rather than zero", () => {
    render(<TranslationProvider><dl><PublicOfferCompensation amount={null} /></dl></TranslationProvider>);

    expect(screen.getByText("Amount not set / To be agreed")).toBeVisible();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it.each([
    ["pt", "Compensação oferecida", "Valor não definido / A combinar"],
    ["es", "Compensación ofrecida", "Importe no definido / A convenir"],
  ])("localizes the compensation label and unset state in %s", (language, label, missing) => {
    window.localStorage.setItem("cleanflow-language", language);
    const { unmount } = render(
      <TranslationProvider><dl><PublicOfferCompensation amount={null} /></dl></TranslationProvider>,
    );

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(missing)).toBeVisible();
    unmount();
  });

  it.each([
    ["pt", "Compensação oferecida: Valor não definido / A combinar"],
    ["es", "Compensación ofrecida: Importe no definido / A convenir"],
  ])("localizes the copied offer message in %s", (language, compensationLine) => {
    window.localStorage.setItem("cleanflow-language", language);
    const { unmount } = render(<TranslationProvider><OfferMessagePreview /></TranslationProvider>);

    expect(screen.getByText(new RegExp(compensationLine))).toBeVisible();
    unmount();
  });
});
