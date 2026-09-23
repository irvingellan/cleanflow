import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PropertyEditForm } from "./PropertyForm.jsx";

describe("PropertyEditForm", () => {
  it("keeps blank optional prices blank instead of converting them to zero", async () => {
    const onSaved = vi.fn().mockResolvedValue({});
    render(
      <TranslationProvider>
        <PropertyEditForm
          property={{ id: "property-1", name: "Original Property", defaultClientPrice: 250 }}
          onBack={vi.fn()}
          onSaved={onSaved}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Property or address name"), { target: { value: "Updated Property" } });
    fireEvent.change(screen.getByLabelText("Default client price"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Default cleaner payout"), { target: { value: "125" } });
    fireEvent.click(screen.getByRole("button", { name: "Save property" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      name: "Updated Property",
      defaultClientPrice: undefined,
      defaultCleanerPrice: 125,
    }));
    expect(screen.getByRole("status")).toHaveTextContent("Property updated.");
  });
});
