import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ClientForm } from "./ClientForm.jsx";

describe("ClientForm edit mode", () => {
  it("edits Client contact fields and keeps blanks absent", async () => {
    const onSaved = vi.fn().mockResolvedValue({});
    render(
      <TranslationProvider>
        <ClientForm client={{ id: "client-1", name: "Original Client", phone: "555-0100", active: true }} onBack={vi.fn()} onSaved={onSaved} />
      </TranslationProvider>,
    );

    expect(screen.queryByLabelText("Active")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Client name"), { target: { value: "Updated Client" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "+15551234567" } });
    fireEvent.change(screen.getByLabelText("Preferred communication"), { target: { value: "WHATSAPP" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Send reports after cleaning." } });
    fireEvent.click(screen.getByRole("button", { name: "Save client" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      name: "Updated Client",
      email: "client@example.com",
      phone: "555-0100",
      whatsapp: "+15551234567",
      preferredCommunicationChannel: "WHATSAPP",
      notes: "Send reports after cleaning.",
    }));
    expect(screen.getByRole("status")).toHaveTextContent("Client updated.");
  });
});
