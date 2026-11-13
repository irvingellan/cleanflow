import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadWeeklyClose } from "./weeklyCloseService.js";
import { getServicePeriodJobs } from "../jobs/jobService.js";
import { getClientSummariesById } from "../clients/clientService.js";
import { getPropertySummariesById } from "../properties/propertyService.js";
import { getCleanerNamesById } from "../cleaners/cleanerService.js";
import { getPayoutEvidenceForJobs } from "../payouts/payoutService.js";

vi.mock("../jobs/jobService.js", () => ({ getServicePeriodJobs: vi.fn() }));
vi.mock("../clients/clientService.js", () => ({ getClientSummariesById: vi.fn() }));
vi.mock("../properties/propertyService.js", () => ({ getPropertySummariesById: vi.fn() }));
vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerNamesById: vi.fn() }));
vi.mock("../payouts/payoutService.js", async (importOriginal) => ({
  ...await importOriginal(), getPayoutEvidenceForJobs: vi.fn(),
}));

const period = { start: "2026-09-21", end: "2026-09-27" };
const window = (jobs, truncated = false) => ({ jobs, coverage: { limit: 200, scanned: jobs.length, truncated } });

const job = {
  id: "service", organizationId: "cleanflow-demo", dataProvenance: "REAL",
  operationalStatus: "COMPLETED", scheduledDate: "2026-09-22",
  clientId: "client", propertyId: "property", assignedCleanerId: "cleaner",
  clientPrice: 200, cleanerPayout: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  getServicePeriodJobs.mockResolvedValue(window([job]));
  getClientSummariesById.mockResolvedValue([{ id: "client", name: "Example Client", notes: "PRIVATE_CLIENT_NOTE" }]);
  getPropertySummariesById.mockResolvedValue([{ id: "property", name: "Example Property", keyCodeInfo: "PRIVATE_ACCESS", defaultClientPrice: 999 }]);
  getCleanerNamesById.mockResolvedValue({ cleaner: "Example Cleaner" });
  getPayoutEvidenceForJobs.mockResolvedValue([]);
});

describe("Weekly Close read-only service boundary", () => {
  it("uses explicit dates, existing legacy eligibility and allowlisted lookup context", async () => {
    const result = await loadWeeklyClose(period);
    expect(getServicePeriodJobs).toHaveBeenCalledExactlyOnceWith(period, { signal: undefined });
    expect(getClientSummariesById).toHaveBeenCalledExactlyOnceWith(["client"]);
    expect(getPropertySummariesById).toHaveBeenCalledExactlyOnceWith(["property"]);
    expect(result.jobs[0]).toMatchObject({ clientName: "Example Client", propertyName: "Example Property", cleanerNames: ["Example Cleaner"], clientCharge: 200, payoutStatus: "OUTSTANDING" });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|defaultClientPrice|keyCodeInfo/);
    expect(job).not.toHaveProperty("legacyPayoutEligible");
  });

  it("looks up payout evidence only for completed active REAL records and batches roster names", async () => {
    const team = { ...job, id: "team", schemaVersion: 2, assignedCleanerIds: ["a", "b"] };
    getServicePeriodJobs.mockResolvedValue(window([job, team, { ...job, id: "archived", archivedAt: {} }, { ...job, id: "demo", dataProvenance: "DEMO" }, { ...job, id: "assigned", operationalStatus: "ASSIGNED" }]));
    const result = await loadWeeklyClose(period);
    expect(getPayoutEvidenceForJobs).toHaveBeenCalledExactlyOnceWith([job, team]);
    expect(getCleanerNamesById).toHaveBeenCalledTimes(1);
    expect(getCleanerNamesById.mock.calls[0][0]).toEqual(expect.arrayContaining(["cleaner", "a", "b"]));
    expect(result.jobs.find((row) => row.id === "team").payoutStatus).toBe("UNKNOWN");
    expect(result.overall.completedServiceCount).toBe(2);
  });

  it.each(["jobs", "payouts"])("rejects %s server-read failure rather than certify an offline/cached total", async (source) => {
    (source === "jobs" ? getServicePeriodJobs : getPayoutEvidenceForJobs).mockRejectedValue(new Error("unavailable"));
    await expect(loadWeeklyClose(period)).rejects.toThrow("unavailable");
  });

  it("loads context for eligible IDs in bounded batches and deduplicates IDs", async () => {
    const distinct = Array.from({ length: 32 }, (_, index) => ({ ...job, id: `job-${index}`, clientId: `client-${index}`, propertyId: `property-${index}` }));
    getServicePeriodJobs.mockResolvedValue(window([...distinct, distinct[0], { ...job, organizationId: "another", id: "foreign" }], true));
    const result = await loadWeeklyClose(period);
    expect(getClientSummariesById.mock.calls.map(([ids]) => ids.length)).toEqual([30, 2]);
    expect(getPropertySummariesById.mock.calls.map(([ids]) => ids.length)).toEqual([30, 2]);
    expect(getClientSummariesById.mock.calls[1][0]).toEqual(["client-30", "client-31"]);
    expect(getPayoutEvidenceForJobs.mock.calls[0][0].some((row) => row.id === "foreign")).toBe(false);
    expect(result.coverage.truncated).toBe(true);
    expect(result.overall.clientCharges).toBeNull();
    expect(result.overall.knownClientCharges).toBe(6400);
    expect(result.clients[0].clientCharges).toBeNull();
  });

  it("does not start follow-up reads once the date selection is cancelled", async () => {
    const controller = new AbortController();
    getServicePeriodJobs.mockImplementationOnce(async () => {
      controller.abort();
      return window([job]);
    });
    await expect(loadWeeklyClose(period, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(getClientSummariesById).not.toHaveBeenCalled();
    expect(getPayoutEvidenceForJobs).not.toHaveBeenCalled();
  });

  it("does not infer missing Job prices from Property defaults", async () => {
    getServicePeriodJobs.mockResolvedValue(window([{ ...job, clientPrice: undefined, cleanerPayout: undefined }]));
    const result = await loadWeeklyClose(period);
    expect(result.overall.clientCharges).toBeNull();
    expect(result.overall.cleanerPayoutTotal).toBeNull();
    expect(result.jobs[0].clientCharge).toBeNull();
  });
});
