import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { CleaningSuccess, CreateCleaningForm } from "./JobForm.jsx";
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

    expect(screen.getByLabelText("Property")).toHaveValue("Pacific Beach Condo");
    expect(screen.getByLabelText("Client")).toHaveValue("Carl");
    expect(screen.getByLabelText("Client price")).toHaveValue(350);
    expect(screen.getByLabelText("Cleaner payout")).toHaveValue(200);
    expect(screen.getByDisplayValue("Unassigned")).toBeVisible();
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

  it("shows the saved Job's date and time and opens that Job", () => {
    const onViewJob = vi.fn();
    render(
      <TranslationProvider>
        <CleaningSuccess
          job={{
            id: "job-1",
            propertyName: "Pacific Beach Condo",
            scheduledDate: "2026-09-01",
            scheduledStart: "10:00",
          }}
          onBack={vi.fn()}
          onViewJob={onViewJob}
        />
      </TranslationProvider>,
    );

    expect(screen.getByRole("heading", { name: "Service created" })).toBeVisible();
    expect(screen.getByText(/Sep 1, 2026.*10:00/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View service" }));
    expect(onViewJob).toHaveBeenCalledTimes(1);
  });
});
