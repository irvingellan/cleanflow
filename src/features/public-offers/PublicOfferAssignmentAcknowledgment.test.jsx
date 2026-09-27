import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PublicOfferAssignmentAcknowledgment } from "./PublicOfferAssignmentAcknowledgment.jsx";

describe("PublicOfferAssignmentAcknowledgment", () => {
  it("lets an assigned cleaner explicitly acknowledge attendance", () => {
    const onConfirm = vi.fn();
    render(
      <TranslationProvider>
        <PublicOfferAssignmentAcknowledgment
          state="AWAITING_CONFIRMATION"
          isSaving={false}
          onConfirm={onConfirm}
        />
      </TranslationProvider>,
    );

    expect(screen.getByText("The manager assigned you to this service. Please confirm you'll be there.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm I'll be there" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("shows server-confirmed acknowledgment without another action", () => {
    render(
      <TranslationProvider>
        <PublicOfferAssignmentAcknowledgment state="CONFIRMED" isSaving={false} onConfirm={vi.fn()} />
      </TranslationProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Your confirmation was saved.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not show acknowledgment controls for an unassigned offer", () => {
    const { container } = render(
      <TranslationProvider>
        <PublicOfferAssignmentAcknowledgment state={null} isSaving={false} onConfirm={vi.fn()} />
      </TranslationProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
