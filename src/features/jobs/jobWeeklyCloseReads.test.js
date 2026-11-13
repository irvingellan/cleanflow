import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  addDoc: vi.fn(), collection: vi.fn(), deleteField: vi.fn(), doc: vi.fn(),
  getDoc: vi.fn(), getDocs: vi.fn(), getDocsFromServer: vi.fn(), limit: vi.fn(),
  orderBy: vi.fn(), query: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn(),
  startAfter: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({ ...firebase, Timestamp: { fromDate: vi.fn() } }));
vi.mock("../../services/firebase/client.js", () => ({ db: { test: true } }));

import { getServicePeriodJobs } from "./jobService.js";

describe("bounded server-backed service-period Job read", () => {
  it.each([{ fromCache: true }, { hasPendingWrites: true }])("rejects unconfirmed snapshots: %j", async metadata => {
    firebase.getDocsFromServer.mockResolvedValue({ docs: [], metadata });
    await expect(getServicePeriodJobs({ start: "2026-09-21", end: "2026-09-27" })).rejects.toThrow("Unconfirmed");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.collection.mockImplementation((_db, ...path) => path.join("/"));
    firebase.where.mockImplementation((field, operation, value) => ({ type: "where", field, operation, value }));
    firebase.orderBy.mockImplementation((field, direction) => ({ type: "orderBy", field, direction }));
    firebase.limit.mockImplementation((amount) => ({ type: "limit", amount }));
    firebase.startAfter.mockImplementation((cursor) => ({ type: "cursor", cursor }));
    firebase.query.mockImplementation((path, ...constraints) => ({ path, constraints }));
  });

  const range = { start: "2026-09-21", end: "2026-09-27" };
  const docs = (start, count) => Array.from({ length: count }, (_, offset) => ({
    id: `job-${start + offset}`, data: () => ({ scheduledDate: "2026-09-23", dataProvenance: "REAL" }),
  }));

  it("uses ordered inclusive bounds and snapshot cursors across jobs with the same date", async () => {
    const first = docs(0, 50);
    const second = docs(50, 50);
    firebase.getDocsFromServer.mockResolvedValueOnce({ docs: first })
      .mockResolvedValueOnce({ docs: second }).mockResolvedValueOnce({ docs: docs(100, 25) });
    const result = await getServicePeriodJobs(range);
    expect(firebase.getDocsFromServer).toHaveBeenNthCalledWith(1, {
      path: "organizations/cleanflow-demo/jobs",
      constraints: [
        { type: "where", field: "scheduledDate", operation: ">=", value: "2026-09-21" },
        { type: "where", field: "scheduledDate", operation: "<=", value: "2026-09-27" },
        { type: "orderBy", field: "scheduledDate", direction: "asc" },
        { type: "limit", amount: 50 },
      ],
    });
    expect(firebase.startAfter.mock.calls).toEqual([[first.at(-1)], [second.at(-1)]]);
    expect(result.jobs).toHaveLength(125);
    expect(result.jobs[124]).toMatchObject({ id: "job-124", dataProvenance: "REAL", schemaVersion: 0 });
    expect(result.coverage).toEqual({ limit: 200, scanned: 125, truncated: false });
    expect(firebase.getDocs).not.toHaveBeenCalled();
  });

  it.each([50, 51])("checks for more data while exposing at most 200 Jobs (last read: %i)", async (lastPage) => {
    firebase.getDocsFromServer.mockResolvedValueOnce({ docs: docs(0, 50) })
      .mockResolvedValueOnce({ docs: docs(50, 50) }).mockResolvedValueOnce({ docs: docs(100, 50) })
      .mockResolvedValueOnce({ docs: docs(150, lastPage) });
    const result = await getServicePeriodJobs(range);
    expect(firebase.getDocsFromServer).toHaveBeenCalledTimes(4);
    expect(firebase.limit.mock.calls).toEqual([[50], [50], [50], [51]]);
    expect(result.jobs).toHaveLength(200);
    expect(result.jobs.at(-1).id).toBe("job-199");
    expect(result.coverage).toEqual({ limit: 200, scanned: 200, truncated: lastPage === 51 });
  });

  it.each([[10, 1, 10], [100, 3, 100], [1000, 4, 201]])(
    "bounds the Job reads for %i matching documents to %i requests and %i returned documents",
    async (matching, requests, returned) => {
      let fetched = 0;
      firebase.getDocsFromServer.mockImplementation(async ({ constraints }) => {
        const { amount } = constraints.find(({ type }) => type === "limit");
        const page = docs(fetched, Math.min(matching - fetched, amount));
        fetched += page.length;
        return { docs: page };
      });
      const result = await getServicePeriodJobs(range);
      expect(firebase.getDocsFromServer).toHaveBeenCalledTimes(requests);
      expect(fetched).toBe(returned);
      expect(result.coverage.scanned).toBe(Math.min(matching, 200));
      expect(result.coverage.truncated).toBe(matching > 200);
    },
  );

  it("stops further pages when the active selection is cancelled", async () => {
    const controller = new AbortController();
    firebase.getDocsFromServer.mockImplementationOnce(async () => {
      controller.abort();
      return { docs: docs(0, 50) };
    });
    await expect(getServicePeriodJobs(range, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(firebase.getDocsFromServer).toHaveBeenCalledTimes(1);
  });

  it("leaves REAL/archive/lifecycle exclusions to the deterministic model, preserving the read", async () => {
    const records = [
      { id: "archived", data: { dataProvenance: "REAL", operationalStatus: "COMPLETED", archivedAt: { seconds: 1 } } },
      { id: "demo", data: { dataProvenance: "DEMO" } },
      { id: "active", data: { dataProvenance: "REAL", operationalStatus: "ASSIGNED" } },
    ];
    firebase.getDocsFromServer.mockResolvedValue({ docs: records.map((record) => ({
      id: record.id, data: () => record.data,
    })) });
    const { jobs } = await getServicePeriodJobs({ start: "2026-09-21", end: "2026-09-27" });
    expect(jobs.map((job) => job.id)).toEqual(["archived", "demo", "active"]);
    expect(jobs[0].archivedAt).toEqual({ seconds: 1 });
    for (const operation of [firebase.addDoc, firebase.updateDoc, firebase.runTransaction, firebase.deleteField]) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it("reports a complete empty period after an empty server read", async () => {
    firebase.getDocsFromServer.mockResolvedValue({ docs: [] });
    await expect(getServicePeriodJobs({ start: "2026-09-21", end: "2026-09-27" })).resolves.toEqual({ jobs: [], coverage: { limit: 200, scanned: 0, truncated: false } });
  });

  it("rejects a failed server read instead of presenting cached data as financial proof", async () => {
    const failure = new Error("Server read unavailable");
    firebase.getDocsFromServer.mockRejectedValue(failure);
    firebase.getDocs.mockResolvedValue({ docs: [{ id: "cached", data: () => ({}) }] });
    await expect(getServicePeriodJobs({ start: "2026-09-21", end: "2026-09-27" })).rejects.toBe(failure);
    expect(firebase.getDocs).not.toHaveBeenCalled();
    expect(firebase.runTransaction).not.toHaveBeenCalled();
    expect(firebase.updateDoc).not.toHaveBeenCalled();
  });
});
