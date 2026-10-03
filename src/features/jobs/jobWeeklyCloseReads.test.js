import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  addDoc: vi.fn(), collection: vi.fn(), deleteField: vi.fn(), doc: vi.fn(),
  getDoc: vi.fn(), getDocs: vi.fn(), getDocsFromServer: vi.fn(), limit: vi.fn(),
  orderBy: vi.fn(), query: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn(),
  startAfter: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({ ...firebase, Timestamp: { fromDate: vi.fn() } }));
vi.mock("../../services/firebase/client.js", () => ({ db: { test: true } }));

import { getServiceWeekJobs } from "./jobService.js";

describe("complete server-backed weekly Job read", () => {
  it.each([{ fromCache: true }, { hasPendingWrites: true }])("rejects unconfirmed snapshots: %j", async metadata => {
    firebase.getDocsFromServer.mockResolvedValue({ docs: [], metadata });
    await expect(getServiceWeekJobs({ start: "2026-09-21", end: "2026-09-27" })).rejects.toThrow("Unconfirmed");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.collection.mockImplementation((_db, ...path) => path.join("/"));
    firebase.where.mockImplementation((field, operation, value) => ({ type: "where", field, operation, value }));
    firebase.orderBy.mockImplementation((field, direction) => ({ type: "orderBy", field, direction }));
    firebase.query.mockImplementation((path, ...constraints) => ({ path, constraints }));
  });

  it("reads inclusive scheduled-date bounds in order without the worklist 100-Job cap", async () => {
    firebase.getDocsFromServer.mockResolvedValue({ docs: Array.from({ length: 125 }, (_, index) => ({
      id: `job-${index}`, data: () => ({ scheduledDate: "2026-09-23", dataProvenance: "REAL" }),
    })) });
    const jobs = await getServiceWeekJobs({ start: "2026-09-21", end: "2026-09-27" });
    expect(firebase.getDocsFromServer).toHaveBeenCalledExactlyOnceWith({
      path: "organizations/cleanflow-demo/jobs",
      constraints: [
        { type: "where", field: "scheduledDate", operation: ">=", value: "2026-09-21" },
        { type: "where", field: "scheduledDate", operation: "<=", value: "2026-09-27" },
        { type: "orderBy", field: "scheduledDate", direction: "asc" },
      ],
    });
    expect(jobs).toHaveLength(125);
    expect(jobs[124]).toMatchObject({ id: "job-124", dataProvenance: "REAL", schemaVersion: 0 });
    expect(firebase.limit).not.toHaveBeenCalled();
    expect(firebase.startAfter).not.toHaveBeenCalled();
    expect(firebase.getDocs).not.toHaveBeenCalled();
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
    const jobs = await getServiceWeekJobs({ start: "2026-09-21", end: "2026-09-27" });
    expect(jobs.map((job) => job.id)).toEqual(["archived", "demo", "active"]);
    expect(jobs[0].archivedAt).toEqual({ seconds: 1 });
    for (const operation of [firebase.addDoc, firebase.updateDoc, firebase.runTransaction, firebase.deleteField]) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it("returns an empty array for a genuinely empty server week", async () => {
    firebase.getDocsFromServer.mockResolvedValue({ docs: [] });
    await expect(getServiceWeekJobs({ start: "2026-09-21", end: "2026-09-27" })).resolves.toEqual([]);
  });

  it("rejects a failed server read instead of presenting cached data as financial proof", async () => {
    const failure = new Error("Server read unavailable");
    firebase.getDocsFromServer.mockRejectedValue(failure);
    firebase.getDocs.mockResolvedValue({ docs: [{ id: "cached", data: () => ({}) }] });
    await expect(getServiceWeekJobs({ start: "2026-09-21", end: "2026-09-27" })).rejects.toBe(failure);
    expect(firebase.getDocs).not.toHaveBeenCalled();
    expect(firebase.runTransaction).not.toHaveBeenCalled();
    expect(firebase.updateDoc).not.toHaveBeenCalled();
  });
});
