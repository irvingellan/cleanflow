import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDashboardController } from "./useDashboardController.js";

const services = vi.hoisted(() => ({
  getDocs: vi.fn(), names: vi.fn(), issues: vi.fn(), interested: vi.fn(), pending: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  getDocs: services.getDocs, Timestamp: { fromDate: (date) => date },
}));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));
vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerNamesById: services.names }));
vi.mock("../issues/issueService.js", () => ({ getOpenJobIssues: services.issues }));
vi.mock("../jobs/jobOfferService.js", () => ({
  getInterestedJobOffers: services.interested, getPendingJobOffers: services.pending,
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 2, 12));
  const snapshot = (records) => ({ docs: records.map(({ id, ...data }) => ({ id, data: () => data })) });
  const job = (id, operationalStatus) => ({
    id, operationalStatus, propertyId: "synthetic-property", scheduledDate: "2026-10-02",
    scheduledStart: "13:00", assignedCleanerIds: ["synthetic-cleaner"], schemaVersion: 2,
  });
  for (const rows of [
    [{ id: "synthetic-property" }], [job("offered", "OFFERED")],
    [job("working", "IN_PROGRESS")], [job("next", "ASSIGNED")], [], [], [],
  ]) services.getDocs.mockResolvedValueOnce(snapshot(rows));
  services.interested.mockResolvedValue([]);
  services.pending.mockResolvedValue([]);
  services.issues.mockResolvedValue([]);
  services.names.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

it.each(["getDocs", "interested", "pending", "issues", "names"])(
  "bounds the actual Dashboard dependency chain when %s never settles", async (dependency) => {
    services[dependency].mockReset().mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
    await act(async () => {});
    expect(services[dependency]).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(true);
    expect(result.current.dashboardData).toBe(null);
  },
);
