import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { CreateCleaningForm } from "./JobForm.jsx";

vi.mock("./jobService.js", () => ({
  createJob: vi.fn(),
}));

describe("CreateCleaningForm", () => {
  it("prefills property, client, and both property pricing defaults", () => {
    render(
      <TranslationProvider>
        <CreateCleaningForm
          property={{
            id: "property-1",
            name: "Pacific Beach Condo",
            clientName: "Carl",
            defaultClientPrice: 350,
            defaultCleanerPrice: 200,
          }}
          onBack={vi.fn()}
          onCreated={vi.fn()}
        />
      </TranslationProvider>,
    );

    expect(screen.getByLabelText("Property")).toHaveValue("Pacific Beach Condo");
    expect(screen.getByLabelText("Client")).toHaveValue("Carl");
    expect(screen.getByLabelText("Client price")).toHaveValue(350);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(200);
    expect(screen.getByDisplayValue("Unassigned")).toBeVisible();
  });
});
