import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadWeeklyClose } from "./weeklyCloseService.js";
import { getServiceWeekJobs } from "../jobs/jobService.js";
import { getClients } from "../clients/clientService.js";
import { getProperties } from "../properties/propertyService.js";
import { getCleanerNamesById } from "../cleaners/cleanerService.js";
import { getPayoutEvidenceForJobs } from "../payouts/payoutService.js";

vi.mock("../jobs/jobService.js", () => ({ getServiceWeekJobs: vi.fn() }));
vi.mock("../clients/clientService.js", () => ({ getClients: vi.fn() }));
vi.mock("../properties/propertyService.js", () => ({ getProperties: vi.fn() }));
vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerNamesById: vi.fn() }));
vi.mock("../payouts/payoutService.js", async (importOriginal) => ({
  ...await importOriginal(), getPayoutEvidenceForJobs: vi.fn(),
}));

const job = {
  id: "service", organizationId: "cleanflow-demo", dataProvenance: "REAL",
  operationalStatus: "COMPLETED", scheduledDate: "2026-09-22",
  clientId: "client", propertyId: "property", assignedCleanerId: "cleaner",
  clientPrice: 200, cleanerPayout: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  getServiceWeekJobs.mockResolvedValue([job]);
  getClients.mockResolvedValue([{ id: "client", name: "Example Client", notes: "PRIVATE_CLIENT_NOTE" }]);
  getProperties.mockResolvedValue([{ id: "property", name: "Example Property", keyCodeInfo: "PRIVATE_ACCESS", defaultClientPrice: 999 }]);
  getCleanerNamesById.mockResolvedValue({ cleaner: "Example Cleaner" });
  getPayoutEvidenceForJobs.mockResolvedValue([]);
});

describe("Weekly Close read-only service boundary", () => {
  it("uses the complete service week, existing legacy eligibility and allowlisted context", async () => {
    const result = await loadWeeklyClose("2026-09-24");
    expect(getServiceWeekJobs).toHaveBeenCalledExactlyOnceWith({ start: "2026-09-21", end: "2026-09-27" });
    expect(getClients).toHaveBeenCalledWith({ includeArchived: true });
    expect(getProperties).toHaveBeenCalledWith({ includeArchived: true });
    expect(result.jobs[0]).toMatchObject({ clientName: "Example Client", propertyName: "Example Property", cleanerNames: ["Example Cleaner"], clientCharge: 200, payoutStatus: "OUTSTANDING" });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|defaultClientPrice|keyCodeInfo/);
    expect(job).not.toHaveProperty("legacyPayoutEligible");
  });

  it("looks up payout evidence only for completed active REAL records and batches roster names", async () => {
    const team = { ...job, id: "team", schemaVersion: 2, assignedCleanerIds: ["a", "b"] };
    getServiceWeekJobs.mockResolvedValue([job, team, { ...job, id: "archived", archivedAt: {} }, { ...job, id: "demo", dataProvenance: "DEMO" }, { ...job, id: "assigned", operationalStatus: "ASSIGNED" }]);
    const result = await loadWeeklyClose("2026-09-21");
    expect(getPayoutEvidenceForJobs).toHaveBeenCalledExactlyOnceWith([job, team]);
    expect(getCleanerNamesById).toHaveBeenCalledTimes(1);
    expect(getCleanerNamesById.mock.calls[0][0]).toEqual(expect.arrayContaining(["cleaner", "a", "b"]));
    expect(result.jobs.find((row) => row.id === "team").payoutStatus).toBe("UNKNOWN");
    expect(result.overall.completedServiceCount).toBe(2);
  });

  it.each(["jobs", "payouts"])("rejects %s server-read failure rather than certify an offline/cached total", async (source) => {
    (source === "jobs" ? getServiceWeekJobs : getPayoutEvidenceForJobs).mockRejectedValue(new Error("unavailable"));
    await expect(loadWeeklyClose("2026-09-21")).rejects.toThrow("unavailable");
  });

  it("does not infer missing Job prices from Property defaults", async () => {
    getServiceWeekJobs.mockResolvedValue([{ ...job, clientPrice: undefined, cleanerPayout: undefined }]);
    const result = await loadWeeklyClose("2026-09-21");
    expect(result.overall.clientCharges).toBeNull();
    expect(result.overall.cleanerPayoutTotal).toBeNull();
    expect(result.jobs[0].clientCharge).toBeNull();
  });
});
