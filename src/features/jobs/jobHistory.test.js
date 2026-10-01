import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import firestoreIndexes from "../../../firestore.indexes.json";

const firestore = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("../../services/firebase/client.js", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  ...firestore,
  collection: (_db, ...path) => ({ path: path.join("/") }),
  doc: (_db, ...path) => ({ path: path.join("/") }),
  where: (field, operator, value) => ({ type: "where", field, operator, value }),
  orderBy: (field, direction) => ({ type: "orderBy", field, direction }),
  limit: (count) => ({ type: "limit", count }),
  query: (collection, ...constraints) => ({ collection, constraints }),
  startAfter: vi.fn(),
  serverTimestamp: vi.fn(),
  deleteField: vi.fn(),
  Timestamp: { fromDate: vi.fn() },
}));

import { getCleanerJobHistory } from "./jobService.js";

function timestamp(value) {
  return { toMillis: () => new Date(value).getTime() };
}

function fixture(id, data = {}) {
  return {
    id,
    schemaVersion: 2,
    dataProvenance: "REAL",
    assignedCleanerIds: ["cleaner-a"],
    scheduledDate: "2026-10-01",
    operationalStatus: "ASSIGNED",
    ...data,
  };
}

function mockJobs(records) {
  firestore.getDocs.mockImplementation(async ({ constraints }) => {
    let result = [...records];
    for (const constraint of constraints.filter((entry) => entry.type === "where")) {
      const { field, operator, value } = constraint;
      result = result.filter((record) => {
        if (operator === "==") return record[field] === value;
        if (operator === "array-contains") return record[field]?.includes(value) === true;
        if (operator === "in") return value.includes(record[field]);
        if (operator === "<") return record[field] < value;
        if (operator === ">=") return record[field] >= value;
        throw new Error(`Unexpected query operator: ${operator}`);
      });
    }
    const ordering = constraints.find((entry) => entry.type === "orderBy");
    const value = (record) => record[ordering.field]?.toMillis?.() ?? record[ordering.field];
    result = result.filter((record) => record[ordering.field] !== undefined).sort((a, b) => {
      const direction = ordering.direction === "desc" ? -1 : 1;
      return (value(a) < value(b) ? -direction : value(a) > value(b) ? direction : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    result = result.slice(0, constraints.find((entry) => entry.type === "limit").count);
    return { docs: result.map(({ id, ...data }) => ({ id, data: () => data })) };
  });
}

describe("additive Cleaner Job history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 12));
  });

  afterEach(() => vi.useRealTimers());

  it("includes singular legacy and roster-aware v2 Jobs, but not another Cleaner's Jobs", async () => {
    mockJobs([
      fixture("legacy", { schemaVersion: 1, assignedCleanerIds: undefined, assignedCleanerId: "cleaner-a" }),
      fixture("v2", { scheduledDate: "2026-09-30" }),
      fixture("team", { assignedCleanerIds: ["cleaner-b", "cleaner-a"], scheduledDate: "2026-10-02" }),
      fixture("unrelated", { assignedCleanerIds: ["cleaner-b"] }),
    ]);

    const history = await getCleanerJobHistory("cleaner-a");
    expect(history.upcomingJobs.map((job) => job.id)).toEqual(["v2", "legacy", "team"]);
    expect(history.recentJobs).toEqual([]);
    expect(firestore.getDocs).toHaveBeenCalledTimes(6);
    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(firestore.addDoc).not.toHaveBeenCalled();
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });

  it("deduplicates dual-field Jobs across membership and historical query paths", async () => {
    mockJobs([
      fixture("upcoming-dual", { assignedCleanerId: "cleaner-a" }),
      fixture("completed-dual", {
        assignedCleanerId: "cleaner-a",
        scheduledDate: "2026-09-25",
        operationalStatus: "COMPLETED",
        completedAt: timestamp("2026-09-25T18:00:00Z"),
      }),
    ]);

    const history = await getCleanerJobHistory("cleaner-a");
    expect(history.upcomingJobs.map((job) => job.id)).toEqual(["upcoming-dual"]);
    expect(history.recentJobs.map((job) => job.id)).toEqual(["completed-dual"]);
  });

  it("includes completed v2 history through completedAt even outside the past schedule window", async () => {
    mockJobs([fixture("completed-v2", {
      operationalStatus: "COMPLETED",
      completedAt: timestamp("2026-09-30T09:00:00Z"),
      scheduledDate: "2026-10-01",
    })]);
    const history = await getCleanerJobHistory("cleaner-a");
    expect(history.upcomingJobs).toEqual([]);
    expect(history.recentJobs.map((job) => job.id)).toEqual(["completed-v2"]);
  });

  it("preserves existing archive semantics rather than deleting or rewriting history", async () => {
    const archive = timestamp("2026-09-29T12:00:00Z");
    mockJobs([
      fixture("archived-history", { scheduledDate: "2026-09-25", archivedAt: archive }),
      fixture("visible-history", { scheduledDate: "2026-09-26" }),
      fixture("legacy-archived-upcoming", { schemaVersion: 1, assignedCleanerIds: undefined, assignedCleanerId: "cleaner-a", archivedAt: archive }),
    ]);

    const history = await getCleanerJobHistory("cleaner-a");
    // Recent summary already excludes archived Jobs. This slice does not change
    // the legacy upcoming query's existing archive behavior or mutate records.
    expect(history.recentJobs.map((job) => job.id)).toEqual(["visible-history"]);
    expect(history.upcomingJobs.map((job) => job.id)).toEqual(["legacy-archived-upcoming"]);
    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });

  it("keeps the five-upcoming/ten-recent bounds and ordering after merging and deduplication", async () => {
    const upcoming = Array.from({ length: 14 }, (_, index) => fixture(`next-${String(index).padStart(2, "0")}`, {
      assignedCleanerIds: index % 2 ? undefined : ["cleaner-a"],
      assignedCleanerId: index % 2 ? "cleaner-a" : undefined,
      scheduledDate: `2026-10-${String(index + 1).padStart(2, "0")}`,
    }));
    const recent = Array.from({ length: 26 }, (_, index) => fixture(`past-${String(index).padStart(2, "0")}`, {
      assignedCleanerIds: index % 2 ? undefined : ["cleaner-a"],
      assignedCleanerId: index % 2 ? "cleaner-a" : undefined,
      scheduledDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
    }));
    mockJobs([...upcoming, ...recent]);

    const history = await getCleanerJobHistory("cleaner-a");
    expect(history.upcomingJobs.map((job) => job.id)).toEqual(upcoming.slice(0, 5).map((job) => job.id));
    expect(history.recentJobs.map((job) => job.id)).toEqual(recent.slice(-10).reverse().map((job) => job.id));
  });

  it("merges equal-date upcoming Jobs deterministically using the existing document-ID tie break", async () => {
    mockJobs([
      fixture("z-legacy", { assignedCleanerIds: undefined, assignedCleanerId: "cleaner-a", scheduledStart: "08:00" }),
      fixture("Z-legacy", { assignedCleanerIds: undefined, assignedCleanerId: "cleaner-a", scheduledStart: "16:00" }),
      fixture("a-v2", { scheduledStart: "12:00" }),
    ]);
    expect((await getCleanerJobHistory("cleaner-a")).upcomingJobs.map((job) => job.id)).toEqual(["Z-legacy", "a-v2", "z-legacy"]);
  });

  it("defines collection-scoped composite indexes for all three roster-aware queries", () => {
    const indexes = firestoreIndexes.indexes.filter((index) => index.collectionGroup === "jobs"
      && index.queryScope === "COLLECTION"
      && index.fields[0]?.fieldPath === "assignedCleanerIds");
    expect(indexes.map((index) => index.fields)).toEqual([
      [
        { fieldPath: "assignedCleanerIds", arrayConfig: "CONTAINS" },
        { fieldPath: "operationalStatus", order: "ASCENDING" },
        { fieldPath: "scheduledDate", order: "ASCENDING" },
      ],
      [
        { fieldPath: "assignedCleanerIds", arrayConfig: "CONTAINS" },
        { fieldPath: "scheduledDate", order: "DESCENDING" },
      ],
      [
        { fieldPath: "assignedCleanerIds", arrayConfig: "CONTAINS" },
        { fieldPath: "operationalStatus", order: "ASCENDING" },
        { fieldPath: "completedAt", order: "DESCENDING" },
      ],
    ]);
  });
});
