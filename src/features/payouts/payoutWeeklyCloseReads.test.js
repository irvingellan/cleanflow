import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  collection: vi.fn(), doc: vi.fn(), documentId: vi.fn(), getDocs: vi.fn(),
  getServerDocs: vi.fn(), limit: vi.fn(), orderBy: vi.fn(), query: vi.fn(),
  runTransaction: vi.fn(), serverTimestamp: vi.fn(), where: vi.fn(),
}));

vi.mock("./payoutAgreements.js", () => ({
  enrichPayoutAgreements: vi.fn(async jobs => jobs),
  jobWithPayoutAgreementsInTransaction: vi.fn(async (_transaction, _ref, job) => job),
}));
vi.mock("firebase/firestore", () => firebase);
vi.mock("firebase/firestore/lite", () => ({ ...firebase, getDocs: firebase.getServerDocs }));
vi.mock("../../services/firebase/client.js", () => ({ db: { test: true } }));
vi.mock("../../services/firebase/serverReads.js", () => ({ serverFirestore: () => ({ test: true }), withReadDeadline: (read) => read }));

import { jobWithPayoutAgreementsInTransaction } from "./payoutAgreements.js";
import { getPayoutEvidenceForJobs, getUnpaidCompletedJobs, recordPayout } from "./payoutService.js";

const snapshot = (records) => ({ docs: records.map((record) => ({ id: record.id, data: () => record.data })) });

describe("complete server-backed weekly payout evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.collection.mockImplementation((_db, ...path) => path.join("/"));
    firebase.documentId.mockReturnValue("__name__");
    firebase.where.mockImplementation((field, operation, value) => ({ field, operation, value }));
    firebase.query.mockImplementation((path, ...constraints) => ({ path, constraints }));
    firebase.getServerDocs.mockResolvedValue(snapshot([]));
  });

  it("queries all Job IDs in 30-element chunks without the recent-payout 20-record cap", async () => {
    const jobs = Array.from({ length: 65 }, (_, index) => ({ id: `job-${index}` }));
    const records = Array.from({ length: 25 }, (_, index) => ({ id: `payout-${index}`, data: { amount: 100 } }));
    firebase.getServerDocs.mockResolvedValueOnce(snapshot(records));
    const result = await getPayoutEvidenceForJobs(jobs);
    const queries = firebase.getServerDocs.mock.calls.map(([query]) => query);
    expect(queries).toHaveLength(3);
    expect(queries.every((query) => query.path === "organizations/cleanflow-demo/payouts")).toBe(true);
    expect(queries.map((query) => query.constraints[0].value.length)).toEqual([30, 30, 5]);
    expect(queries.flatMap((query) => query.constraints[0].value)).toEqual(jobs.map((job) => job.id));
    expect(queries.every((query) => query.constraints[0].field === "jobIds"
      && query.constraints[0].operation === "array-contains-any")).toBe(true);
    expect(result).toHaveLength(25);
    expect(firebase.limit).not.toHaveBeenCalled();
    expect(firebase.orderBy).not.toHaveBeenCalled();
    expect(firebase.getDocs).not.toHaveBeenCalled();
  });

  it("also reads explicit payout references in bounded chunks, including broken reciprocal links", async () => {
    const jobs = Array.from({ length: 31 }, (_, index) => ({ id: `job-${index}`, payoutId: `payout-${index}` }));
    const explicitOnly = { id: "payout-0", data: { jobIds: ["different-job"], amount: 100 } };
    firebase.getServerDocs.mockImplementation((query) => Promise.resolve(snapshot(
      query.constraints[0].field === "__name__" ? [explicitOnly] : [],
    )));
    const result = await getPayoutEvidenceForJobs(jobs);
    const explicitQueries = firebase.getServerDocs.mock.calls.map(([query]) => query)
      .filter((query) => query.constraints[0].field === "__name__");
    expect(explicitQueries).toHaveLength(2);
    expect(explicitQueries.map((query) => query.constraints[0].value.length)).toEqual([30, 1]);
    expect(explicitQueries.every((query) => query.constraints[0].operation === "in")).toBe(true);
    expect(result).toEqual([
      { id: "payout-0", jobIds: ["different-job"], amount: 100 },
      { id: "payout-0", jobIds: ["different-job"], amount: 100 },
    ]);
  });

  it("deduplicates query IDs but retains payout snapshots for model-level conflict checking", async () => {
    const record = { id: "payout-1", data: { organizationId: "cleanflow-demo", jobIds: ["job-1"], amount: 100 } };
    firebase.getServerDocs.mockResolvedValue(snapshot([record]));
    const jobs = Object.freeze([
      Object.freeze({ id: "job-1", payoutId: "payout-1" }),
      Object.freeze({ id: "job-1", payoutId: "payout-1" }),
    ]);
    const result = await getPayoutEvidenceForJobs(jobs);
    expect(result).toHaveLength(2);
    expect(firebase.getServerDocs.mock.calls.map(([query]) => query.constraints[0].value))
      .toEqual([["job-1"], ["payout-1"]]);
    expect(firebase.runTransaction).not.toHaveBeenCalled();
    expect(firebase.serverTimestamp).not.toHaveBeenCalled();
    expect(firebase.doc).not.toHaveBeenCalled();
  });

  it("never hides contradictory payout versions with last-wins deduplication", async () => {
    firebase.getServerDocs.mockResolvedValueOnce(snapshot([
      { id: "payout-1", data: { amount: 100, jobIds: ["job-1"] } },
    ])).mockResolvedValueOnce(snapshot([
      { id: "payout-1", data: { amount: 999, jobIds: ["job-1"] } },
    ]));
    const result = await getPayoutEvidenceForJobs([{ id: "job-1", payoutId: "payout-1" }]);
    expect(result.map((payout) => payout.amount)).toEqual([100, 999]);
  });

  it("performs no read or write for empty input", async () => {
    await expect(getPayoutEvidenceForJobs([])).resolves.toEqual([]);
    expect(firebase.getServerDocs).not.toHaveBeenCalled();
    expect(firebase.runTransaction).not.toHaveBeenCalled();
  });

  it("rejects any incomplete server evidence read instead of falling back to cached/partial proof", async () => {
    const failure = new Error("Payout evidence unavailable");
    firebase.getServerDocs.mockResolvedValueOnce(snapshot([{ id: "payout-1", data: { amount: 100 } }]))
      .mockRejectedValueOnce(failure);
    firebase.getDocs.mockResolvedValue(snapshot([]));
    await expect(getPayoutEvidenceForJobs([{ id: "job-1", payoutId: "payout-1" }])).rejects.toBe(failure);
    expect(firebase.getDocs).not.toHaveBeenCalled();
    expect(firebase.runTransaction).not.toHaveBeenCalled();
  });
});

it("lists unpaid hourly services for review with the same read and keeps them out of the payable list", async () => {
  const fixed = { operationalStatus: "COMPLETED", assignedCleanerId: "one", cleanerPayout: 100 };
  const hourly = { ...fixed, schemaVersion: 2, pay: { mode: "HOURLY", rateCents: 2200 } };
  firebase.getServerDocs.mockResolvedValue(snapshot([
    { id: "fixed", data: fixed }, { id: "hourly", data: hourly },
    { id: "paid", data: { ...hourly, payoutId: "paid-record" } },
    { id: "archived", data: { ...hourly, archivedAt: new Date() } },
  ]));
  expect((await getUnpaidCompletedJobs()).map(job => job.id)).toEqual(["fixed"]);
  expect((await getUnpaidCompletedJobs({ includePendingHours: true })).map(job => job.id)).toEqual(["fixed", "hourly"]);
});

describe("individual payout transaction", () => {
  it("stores exact receipt lines, protects the legacy link and cannot pay a team member twice", async () => {
    const team = { schemaVersion: 2, operationalStatus: "COMPLETED", cleanerPayout: 100, assignedCleanerIds: ["z", "a", "b"] };
    const single = { operationalStatus: "COMPLETED", cleanerPayout: 12, assignedCleanerId: "a" };
    const jobs = { team, single };
    const receipts = [];
    firebase.collection.mockReturnValue("payouts");
    firebase.doc.mockImplementation((...args) => ({ id: args.length === 1 ? "receipt-" + (receipts.length + 1) : args.at(-1) }));
    firebase.serverTimestamp.mockReturnValue(new Date());
    const transaction = {
      get: vi.fn(async ref => ({ id: ref.id, data: () => jobs[ref.id] })),
      set: vi.fn((_ref, data) => receipts.push(data)),
      update: vi.fn((ref, patch) => Object.assign(jobs[ref.id], patch)),
    };
    firebase.runTransaction.mockImplementation((_db, callback) => callback(transaction));
    const pay = (id, jobIds) => recordPayout({ cleaner: { id }, jobIds, paymentMethod: "ZELLE" });
    await expect(pay("a", ["team", "single"])).resolves.toMatchObject({ amount: 45.33 });
    expect(receipts[0]).toMatchObject({ cleanerId: "a", jobIds: ["team", "single"],
      jobAmountsCents: { team: 3333, single: 1200 }, amount: 45.33 });
    expect(team.payoutId).toBeUndefined();
    expect(team.payoutIdsByCleaner).toEqual({ a: "receipt-1" });
    expect(single.payoutId).toBe("receipt-1");
    await expect(pay("a", ["team"])).rejects.toMatchObject({ code: "job-not-payable" });
    await expect(pay("unknown", ["team"])).rejects.toMatchObject({ code: "job-not-payable" });
    jobWithPayoutAgreementsInTransaction.mockImplementationOnce(async (_tx, _ref, source) => ({
      ...source, payoutAgreementsByCleaner: { z: { offeredCompensation: 47.79 } },
    }));
    await expect(pay("z", ["team"])).resolves.toMatchObject({ amount: 47.79 });
    expect(receipts[1].jobAmountsCents).toEqual({ team: 4779 });
    expect(team.payoutIdsByCleaner).toEqual({ a: "receipt-1", z: "receipt-2" });
    expect(receipts).toHaveLength(2);
  });
});
