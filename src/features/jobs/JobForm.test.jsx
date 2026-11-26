import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { CreateCleaningForm } from "./JobForm.jsx";
import { createJob } from "./jobService.js";

vi.mock("./jobService.js", () => ({
  createJob: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

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

    expect(screen.getByLabelText("Property")).toHaveValue("property-1");
    expect(screen.getByRole("option", { name: "Pacific Beach Condo" })).toBeVisible();
    expect(screen.getByLabelText("Client")).toHaveValue("Carl");
    expect(screen.getByLabelText("Client price")).toHaveValue(350);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(200);
    expect(screen.getByLabelText("Scheduled time")).toHaveValue("11:00");
    expect(screen.getByLabelText("Service type")).toHaveValue("STANDARD");
    expect(screen.getByDisplayValue("Unassigned")).toBeVisible();
    expect(screen.getByLabelText("Cleaners needed")).toHaveValue("1");
  });

  it("copies only the Property's canonical client ID and passes the optional guest name", async () => {
    const onCreated = vi.fn();
    const savedJob = {
      id: "job-1",
      schemaVersion: 2,
      propertyId: "property-1",
      propertyName: "Pacific Beach Condo",
      clientId: "client-carl",
      clientName: "Carl",
      scheduledDate: "2026-09-01",
      clientPrice: 350,
      cleanerPayout: 200,
      guestName: "Taylor Morgan",
      notes: "",
      operationalStatus: "UNASSIGNED",
      assignedCleanerIds: [],
    };
    createJob.mockResolvedValue(savedJob);

    render(
      <TranslationProvider>
        <CreateCleaningForm
          property={{
            id: "property-1",
            name: "Pacific Beach Condo",
            clientId: "client-carl",
            clientName: "Carl",
            defaultClientPrice: 350,
            defaultCleanerPrice: 200,
          }}
          onBack={vi.fn()}
          onCreated={onCreated}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Scheduled time"), {
      target: { value: "10:00" },
    });
    const checkIn = screen.getByLabelText("Guest check-in");
    fireEvent.change(checkIn, { target: { value: "15:00:30" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);
    expect(screen.getByText("Enter a valid time or leave it blank.")).toBeVisible();
    expect(createJob).not.toHaveBeenCalled();
    fireEvent.change(checkIn, { target: { value: "15:00" } });
    fireEvent.change(screen.getByLabelText("Guest name (optional)"), {
      target: { value: " Taylor Morgan " },
    });
    fireEvent.change(screen.getByLabelText("Service type"), {
      target: { value: "DEEP_CLEANING" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);

    await waitFor(() => {
      expect(createJob).toHaveBeenCalledWith({
        propertyId: "property-1",
        propertyName: "Pacific Beach Condo",
        clientId: "client-carl",
        clientName: "Carl",
        serviceType: "DEEP_CLEANING",
        scheduledDate: "2026-09-01",
        scheduledStart: "10:00",
        guestCheckInTime: "15:00",
        clientPrice: 350,
        cleanerPayout: 200,
        guestName: " Taylor Morgan ",
        notes: "",
      });
    });
    expect(onCreated).toHaveBeenCalledWith(savedJob);
  });

  it("allows a manager to override Property price defaults for one new Job", async () => {
    createJob.mockResolvedValue({ id: "job-override", scheduledDate: "2026-09-01" });

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

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Client price"), { target: { value: "375" } });
    fireEvent.change(screen.getByLabelText("Cleaner payout"), { target: { value: "210" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);

    await waitFor(() => {
      expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
        clientPrice: 375,
        cleanerPayout: 210,
      }));
    });
  });

  it("searches loaded active Properties by name or address and derives the selected Client and prices", async () => {
    createJob.mockResolvedValue({ id: "job-direct" });
    const properties = [
      {
        id: "property-ocean",
        name: "Ocean House",
        address: "12 Harbor Lane",
        active: true,
        clientId: "client-ocean",
        clientName: "Ocean Client",
        defaultClientPrice: 325,
        defaultCleanerPrice: 175,
      },
      { id: "property-palm", name: "Palm Flat", active: true },
      { id: "property-inactive", name: "Closed House", active: false },
      { id: "property-archived", name: "Hidden House", active: true, archivedAt: true },
    ];

    render(
      <TranslationProvider>
        <CreateCleaningForm properties={properties} onBack={vi.fn()} onCreated={vi.fn()} />
      </TranslationProvider>,
    );

    const propertySelect = screen.getByLabelText("Property");
    expect(propertySelect).toHaveValue("");
    expect(screen.getByLabelText("Client")).toHaveValue("");
    expect(screen.getByLabelText("Client price")).toHaveValue(null);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(null);
    expect(Array.from(propertySelect.options).map((option) => option.value)).toEqual([
      "",
      "property-ocean",
      "property-palm",
    ]);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pAlM" } });
    expect(Array.from(propertySelect.options).map((option) => option.value)).toEqual([
      "",
      "property-palm",
    ]);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "HARBOR" } });
    expect(Array.from(propertySelect.options).map((option) => option.value)).toEqual([
      "",
      "property-ocean",
    ]);
    fireEvent.change(propertySelect, { target: { value: "property-ocean" } });
    expect(screen.getByLabelText("Client")).toHaveValue("Ocean Client");
    expect(screen.getByLabelText("Client price")).toHaveValue(325);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(175);

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-15" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);

    await waitFor(() => expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: "property-ocean",
      propertyName: "Ocean House",
      clientId: "client-ocean",
      clientName: "Ocean Client",
      clientPrice: 325,
      cleanerPayout: 175,
      scheduledStart: "11:00",
    })));
  });

  it("replaces per-Job prices only when the manager switches Property and keeps blanks blank", () => {
    const firstProperty = {
      id: "property-first",
      name: "First House",
      clientName: "First Client",
      defaultClientPrice: 300,
      defaultCleanerPrice: 150,
    };
    const secondProperty = {
      id: "property-second",
      name: "Second House",
      clientName: "Second Client",
      active: true,
    };

    render(
      <TranslationProvider>
        <CreateCleaningForm
          property={firstProperty}
          properties={[firstProperty, secondProperty]}
          onBack={vi.fn()}
          onCreated={vi.fn()}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Client price"), { target: { value: "375" } });
    fireEvent.change(screen.getByLabelText("Cleaner payout"), { target: { value: "210" } });
    fireEvent.change(screen.getByLabelText("Property"), {
      target: { value: "property-second" },
    });

    expect(screen.getByLabelText("Client")).toHaveValue("Second Client");
    expect(screen.getByLabelText("Client price")).toHaveValue(null);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(null);
    expect(screen.getByLabelText("Scheduled time")).toHaveValue("11:00");

    fireEvent.change(screen.getByLabelText("Client price"), { target: { value: "420" } });
    expect(screen.getByLabelText("Client price")).toHaveValue(420);
    expect(secondProperty).not.toHaveProperty("defaultClientPrice");
  });

  it("requires a Property and waits for a loaded Property list on direct entry", () => {
    const form = (props) => (
      <TranslationProvider>
        <CreateCleaningForm onBack={vi.fn()} onCreated={vi.fn()} {...props} />
      </TranslationProvider>
    );
    const { rerender } = render(form({ isLoadingProperties: true }));

    expect(screen.getByRole("status")).toHaveTextContent("Loading properties");
    expect(screen.getByRole("button", { name: "Create cleaning" })).toBeDisabled();

    rerender(form({ hasPropertyError: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load properties");
    expect(screen.getByRole("button", { name: "Create cleaning" })).toBeDisabled();

    rerender(form({ properties: [{ id: "property-inactive", name: "Closed House", active: false }] }));
    expect(screen.getByRole("status")).toBeVisible();
    expect(Array.from(screen.getByLabelText("Property").options).map((option) => option.value))
      .toEqual([""]);

    rerender(form({ properties: [{ id: "property-active", name: "Active House", active: true }] }));
    expect(screen.getByRole("button", { name: "Create cleaning" })).toBeEnabled();
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("allows the 11:00 time to be changed or cleared before saving", async () => {
    createJob.mockResolvedValue({ id: "job-no-time" });
    render(
      <TranslationProvider>
        <CreateCleaningForm
          property={{ id: "property-1", name: "Pacific Beach Condo" }}
          onBack={vi.fn()}
          onCreated={vi.fn()}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Scheduled time"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);

    await waitFor(() => expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      scheduledStart: "",
    })));
  });

  it("does not infer a client ID from a legacy Property client name", () => {
    render(
      <TranslationProvider>
        <CreateCleaningForm
          property={{
            id: "property-legacy",
            name: "Legacy Property",
            clientName: "Carl",
          }}
          onBack={vi.fn()}
          onCreated={vi.fn()}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);

    expect(createJob).toHaveBeenCalledWith(
      expect.not.objectContaining({ clientId: expect.anything() }),
    );
  });

  it("copies independent service rates, applies team pay, and saves the manager's override", async () => {
    createJob.mockResolvedValue({ id: "new-job" });
    const property = { id: "p", name: "Sample property", defaultClientPrice: 80, defaultCleanerPrice: 40,
      serviceRates: { DEEP_CLEANING: {
        client: { mode: "HOURLY", amountCents: 4500 },
        cleaner: { mode: "FIXED", amountCents: 3500, byCleanerCount: { "2": 2800 } },
      } } };
    render(<TranslationProvider><CreateCleaningForm property={property} onCreated={vi.fn()} /></TranslationProvider>);
    fireEvent.change(screen.getByLabelText("Service type"), { target: { value: "DEEP_CLEANING" } });
    expect(screen.getByLabelText("Client price per hour")).toHaveValue(45);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(35);
    fireEvent.change(screen.getByLabelText("Client price per hour"), { target: { value: "52.25" } });
    fireEvent.change(screen.getByLabelText("Cleaners needed"), { target: { value: "2" } });
    expect(screen.getByLabelText("Amount per cleaner (USD)")).toHaveValue(28);
    expect(screen.getByLabelText("Client price per hour")).toHaveValue(52.25);
    fireEvent.change(screen.getByLabelText("Cleaner pay method"), { target: { value: "HOURLY" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);
    await waitFor(() => expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      // Switching cleaner pay to hourly prefills the standard $25 rate (Gabi, 2026-11-21).
      billing: { mode: "HOURLY", hourlyRateCents: 5225 }, pay: { mode: "HOURLY", rateCents: 2500 },
      requiredCleanerCount: 2, clientPrice: undefined, cleanerPayout: undefined,
    })));
  });

  it("clears the previous type's rates and warns when a configured property has an empty row", () => {
    const property = { id: "p", name: "Sample property", serviceRates: { STANDARD: {
      cleaner: { mode: "HOURLY", amountCents: 2000 }, client: { mode: "FIXED", amountCents: 5000 },
    } } };
    render(<TranslationProvider><CreateCleaningForm property={property} /></TranslationProvider>);
    fireEvent.change(screen.getByLabelText("Service type"), { target: { value: "DEEP_CLEANING" } });
    expect(screen.getByText(/price is missing for this service type/i)).toBeVisible();
    expect(screen.getByLabelText("Client price")).toHaveValue(null);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Cleaner pay method"), { target: { value: "HOURLY" } });
    expect(screen.getByLabelText("Cleaner pay per hour")).toHaveValue(25);
    fireEvent.change(screen.getByLabelText("Cleaner pay per hour"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("asks for review of already entered amounts on a property with legacy defaults only", () => {
    const property = { id: "p", name: "Sample property", defaultClientPrice: 80, defaultCleanerPrice: 40 };
    render(<TranslationProvider><CreateCleaningForm property={property} /></TranslationProvider>);
    fireEvent.change(screen.getByLabelText("Client price"), { target: { value: "72" } });
    fireEvent.change(screen.getByLabelText("Client price"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Service type"), { target: { value: "DEEP_CLEANING" } });
    expect(screen.getByText(/review the amounts already entered/i)).toBeVisible();
    expect(screen.getByLabelText("Client price")).toHaveValue(null);
  });

  it("does not warn about a missing price once both amounts are entered (Gabi, 2026-11-25)", () => {
    const property = { id: "p", name: "Sample property" };
    render(<TranslationProvider><CreateCleaningForm property={property} /></TranslationProvider>);
    fireEvent.change(screen.getByLabelText("Client pricing method"), { target: { value: "HOURLY" } });
    fireEvent.change(screen.getByLabelText("Cleaner pay method"), { target: { value: "HOURLY" } });
    expect(screen.getByLabelText("Client price per hour")).toHaveValue(45);
    expect(screen.getByLabelText("Cleaner pay per hour")).toHaveValue(25);
    expect(screen.queryByText(/price is missing for this service type/i)).toBeNull();
  });

  it.each(["MOVE_IN_OUT", "POST_CONSTRUCTION", "AIRBNB_TOUCH_UP"])(
    "prefills editable hourly prices for %s when the property has no saved rate", async (serviceType) => {
      render(<TranslationProvider><CreateCleaningForm property={{ id: "p", name: "Sample property" }} onCreated={vi.fn()} /></TranslationProvider>);
      fireEvent.change(screen.getByLabelText("Service type"), { target: { value: serviceType } });
      expect(screen.getByLabelText("Client pricing method")).toHaveValue("HOURLY");
      expect(screen.getByLabelText("Cleaner pay method")).toHaveValue("HOURLY");
      expect(screen.getByLabelText("Client price per hour")).toHaveValue(45);
      fireEvent.change(screen.getByLabelText("Cleaner pay per hour"), { target: { value: "27" } });
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-08" } });
      fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);
      await waitFor(() => expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
        serviceType, billing: { mode: "HOURLY", hourlyRateCents: 4500 }, pay: { mode: "HOURLY", rateCents: 2700 },
      })));
    });

  it("keeps a saved property rate instead of the hourly default", () => {
    const property = { id: "p", name: "Sample property", serviceRates: { MOVE_IN_OUT: {
      client: { mode: "FIXED", amountCents: 30000 }, cleaner: { mode: "FIXED", amountCents: 15000 },
    } } };
    render(<TranslationProvider><CreateCleaningForm property={property} /></TranslationProvider>);
    fireEvent.change(screen.getByLabelText("Service type"), { target: { value: "MOVE_IN_OUT" } });
    expect(screen.getByLabelText("Client pricing method")).toHaveValue("FIXED");
    expect(screen.getByLabelText("Client price")).toHaveValue(300);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(150);
  });

  it("keeps blank price defaults absent instead of converting them to zero", async () => {
    createJob.mockResolvedValue({ id: "job-blank", scheduledDate: "2026-09-01" });

    render(
      <TranslationProvider>
        <CreateCleaningForm
          property={{ id: "property-blank", name: "No-price Property", clientName: "Carl" }}
          onBack={vi.fn()}
          onCreated={vi.fn()}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);

    await waitFor(() => {
      expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
        clientPrice: undefined,
        cleanerPayout: undefined,
      }));
    });
  });

  it("shows the feature-local success confirmation only after the write succeeds", async () => {
    let resolveCreate;
    const onCreated = vi.fn();
    createJob.mockImplementation(
      () => new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(
      <TranslationProvider>
        <CreateCleaningForm
          property={{ id: "property-1", name: "Pacific Beach Condo", clientName: "Carl" }}
          onBack={vi.fn()}
          onCreated={onCreated}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);
    expect(onCreated).not.toHaveBeenCalled();

    resolveCreate({ id: "job-1", scheduledDate: "2026-09-01" });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it("keeps the form usable and shows the existing error when creation fails", async () => {
    createJob.mockRejectedValueOnce(new Error("write failed"));

    render(
      <TranslationProvider>
        <CreateCleaningForm
          property={{ id: "property-1", name: "Pacific Beach Condo", clientName: "Carl" }}
          onBack={vi.fn()}
          onCreated={vi.fn()}
        />
      </TranslationProvider>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create cleaning.");
    expect(screen.getByRole("button", { name: "Create cleaning" })).toBeEnabled();
  });

});
