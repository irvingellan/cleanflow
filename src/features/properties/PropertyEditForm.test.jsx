import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PropertyEditForm, PropertyForm } from "./PropertyForm.jsx";

vi.mock("../clients/clientService.js", () => ({
  getActiveClients: vi.fn().mockResolvedValue([
    { id: "client-1", name: "Carl" },
    { id: "client-2", name: "Sara" },
  ]),
}));

describe("PropertyEditForm", () => {
  it("keeps blank optional prices blank instead of converting them to zero", async () => {
    const onSaved = vi.fn().mockResolvedValue({});
    render(
      <TranslationProvider>
        <PropertyEditForm
          property={{ id: "property-1", name: "Original Property", clientId: "client-1", clientName: "Carl", defaultClientPrice: 250, keyCodeInfo: "Lockbox at entry", accessInstructions: "Use the side door" }}
          onBack={vi.fn()}
          onSaved={onSaved}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Property or address name"), { target: { value: "Updated Property" } });
    fireEvent.change(screen.getByLabelText("Default client price"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Default cleaner payout"), { target: { value: "125" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByLabelText("Garage / parking"), { target: { value: "Garage 4" } });
    fireEvent.change(screen.getByLabelText("Cleaner instructions"), { target: { value: "Use side entrance" } });
    expect(screen.getByLabelText("Key / Code Info")).toHaveValue("Lockbox at entry");
    expect(screen.getByLabelText("Access instructions")).toHaveValue("Use the side door");
    fireEvent.change(screen.getByLabelText("Key / Code Info"), { target: { value: "Updated lockbox details" } });
    fireEvent.change(screen.getByLabelText("Access instructions"), { target: { value: "Enter via the side gate" } });
    fireEvent.click(screen.getByRole("button", { name: "Save property" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      name: "Updated Property",
      client: undefined,
      address: "123 Main St",
      defaultClientPrice: undefined,
      defaultCleanerPrice: 125,
      garageParking: "Garage 4",
      cleanerInstructions: "Use side entrance",
      additionalNotes: undefined,
      keyCodeInfo: "Updated lockbox details",
      accessInstructions: "Enter via the side gate",
    }));
    expect(screen.getByRole("status")).toHaveTextContent("Property updated.");
  });

  it("uses the same optional operational fields when creating a Property", async () => {
    const onSaved = vi.fn().mockResolvedValue({});
    render(
      <TranslationProvider>
        <PropertyForm
          preselectedClient={{ id: "client-1", name: "Carl" }}
          onBack={vi.fn()}
          onSaved={onSaved}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Property or address name"), { target: { value: "New Property" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "456 Palm Ave" } });
    fireEvent.change(screen.getByLabelText("Default client price"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Default cleaner payout"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Garage / parking"), { target: { value: "Street parking" } });
    fireEvent.change(screen.getByLabelText("Cleaner instructions"), { target: { value: "Call before arrival" } });
    fireEvent.change(screen.getByLabelText("Additional notes"), { target: { value: "Gate is blue" } });
    fireEvent.change(screen.getByLabelText("Key / Code Info"), { target: { value: "Key with host" } });
    fireEvent.change(screen.getByLabelText("Access instructions"), { target: { value: "Enter at front" } });
    fireEvent.click(screen.getByRole("button", { name: "Save property" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      name: "New Property",
      clientId: "client-1",
      clientName: "Carl",
      address: "456 Palm Ave",
      defaultClientPrice: 300,
      defaultCleanerPrice: 150,
      garageParking: "Street parking",
      cleanerInstructions: "Call before arrival",
      additionalNotes: "Gate is blue",
      keyCodeInfo: "Key with host",
      accessInstructions: "Enter at front",
      active: true,
    }));
  });

  it("updates the canonical Client relationship only when the manager selects another Client", async () => {
    const onSaved = vi.fn().mockResolvedValue({});
    render(
      <TranslationProvider>
        <PropertyEditForm
          property={{ id: "property-1", name: "Original Property", clientId: "client-1", clientName: "Carl" }}
          onBack={vi.fn()}
          onSaved={onSaved}
        />
      </TranslationProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("Client")).toBeVisible());
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "client-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save property" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      client: { id: "client-2", name: "Sara" },
    })));
  });

  it("omits blank access fields so optional values stay blank", async () => {
    const onSaved = vi.fn().mockResolvedValue({});
    render(
      <TranslationProvider>
        <PropertyEditForm
          property={{ id: "property-1", name: "Original Property", clientId: "client-1", keyCodeInfo: "Old key details", accessInstructions: "Old instructions" }}
          onBack={vi.fn()}
          onSaved={onSaved}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Key / Code Info"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Access instructions"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save property" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      keyCodeInfo: undefined,
      accessInstructions: undefined,
    })));
  });
});
