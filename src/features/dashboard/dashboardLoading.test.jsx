import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDashboardController } from "./useDashboardController.js";
import { recordManagerAccessDiagnostic } from "../auth/managerAccessDiagnostics.js";

const services = vi.hoisted(() => ({
  getDocsFromServer: vi.fn(), names: vi.fn(), issues: vi.fn(), interested: vi.fn(), pending: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  getDocsFromServer: services.getDocsFromServer, Timestamp: { fromDate: (date) => date },
}));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));
vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerNamesById: services.names }));
vi.mock("../issues/issueService.js", () => ({ getOpenJobIssues: services.issues }));
vi.mock("../jobs/jobOfferService.js", () => ({
  getInterestedJobOffers: services.interested, getPendingJobOffers: services.pending,
}));
vi.mock("../auth/managerAccessDiagnostics.js", () => ({ recordManagerAccessDiagnostic: vi.fn() }));

const snapshot = (records) => ({ docs: records.map(({ id, ...data }) => ({ id, data: () => data })) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 2, 12));
  const job = (id, operationalStatus) => ({
    id, operationalStatus, propertyId: "synthetic-property", scheduledDate: "2026-10-02",
    scheduledStart: "13:00", assignedCleanerIds: ["synthetic-cleaner"], schemaVersion: 2,
  });
  for (const rows of [
    [{ id: "synthetic-property" }], [job("offered", "OFFERED")],
    [job("working", "IN_PROGRESS")], [job("next", "ASSIGNED")], [], [], [],
  ]) services.getDocsFromServer.mockResolvedValueOnce(snapshot(rows));
  services.interested.mockResolvedValue([]);
  services.pending.mockResolvedValue([]);
  services.issues.mockResolvedValue([]);
  services.names.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

it.each([
  ["getDocsFromServer", "core_reads"], ["interested", "offers"], ["pending", "offers"],
  ["issues", "issues"], ["names", "cleaner_names"],
])("records the exact Dashboard phase still pending when %s stalls", async (dependency, phase) => {
    services[dependency].mockReset().mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
    await act(async () => {});
    expect(services[dependency]).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(true);
    expect(result.current.dashboardData).toBe(null);
    expect(recordManagerAccessDiagnostic).toHaveBeenCalledWith("dashboard_load_timeout", {
      attempt: 1, durationMs: 20_000, phase, reason: "timeout",
    });
});

it("does not start new reads for a Dashboard that timed out before core queries resolved", async () => {
  let completeProperties;
  services.getDocsFromServer.mockReset()
    .mockReturnValueOnce(new Promise((resolve) => { completeProperties = resolve; }))
    .mockResolvedValue(snapshot([]));
  const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(result.current.hasError).toBe(true);
  await act(async () => { completeProperties(snapshot([{ id: "synthetic-property" }])); });
  expect(services.interested).not.toHaveBeenCalled();
  expect(services.issues).not.toHaveBeenCalled();
  expect(services.names).not.toHaveBeenCalled();
  expect(result.current.dashboardData).toBeNull();
});

it("reports a phase rejection with an allowlisted code only", async () => {
  services.issues.mockRejectedValue({ code: "permission-denied", message: "private synthetic string" });
  const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
  await act(async () => {});
  expect(result.current.hasError).toBe(true);
  expect(recordManagerAccessDiagnostic).toHaveBeenCalledWith("dashboard_phase_completed", {
    attempt: 1, phase: "issues", durationMs: 0, reason: "permission-denied",
  });
  expect(JSON.stringify(recordManagerAccessDiagnostic.mock.calls)).not.toContain("private synthetic string");
  expect(services.names).not.toHaveBeenCalled();
});
