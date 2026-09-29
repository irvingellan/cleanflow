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
    expect(screen.getByDisplayValue("Unassigned")).toBeVisible();
    expect(screen.queryByLabelText("Cleaners needed")).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Guest name (optional)"), {
      target: { value: " Taylor Morgan " },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create cleaning" }).form);

    await waitFor(() => {
      expect(createJob).toHaveBeenCalledWith({
        propertyId: "property-1",
        propertyName: "Pacific Beach Condo",
        clientId: "client-carl",
        clientName: "Carl",
        scheduledDate: "2026-09-01",
        scheduledStart: "10:00",
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
