import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ClientForm } from "./ClientForm.jsx";

describe("ClientForm edit mode", () => {
  it("edits only the Client name and confirms the saved state", async () => {
    const onSaved = vi.fn().mockResolvedValue({});
    render(
      <TranslationProvider>
        <ClientForm client={{ id: "client-1", name: "Original Client", active: true }} onBack={vi.fn()} onSaved={onSaved} />
      </TranslationProvider>,
    );

    expect(screen.queryByLabelText("Active")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Client name"), { target: { value: "Updated Client" } });
    fireEvent.click(screen.getByRole("button", { name: "Save client" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ name: "Updated Client" }));
    expect(screen.getByRole("status")).toHaveTextContent("Client updated.");
  });
});
