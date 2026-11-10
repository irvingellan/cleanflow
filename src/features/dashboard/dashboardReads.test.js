import { beforeEach, expect, it, vi } from "vitest";
import { getDocs } from "firebase/firestore/lite";
import {
  createDashboardRead, getCleanerNamesById, getInterestedJobOffers, getOpenJobIssues, getPendingJobOffers,
} from "./dashboardReads.js";

vi.mock("../../services/firebase/client.js", () => ({
  firebaseApp: {}, emulatorPorts: {}, useFirebaseEmulators: false,
}));
vi.mock("firebase/firestore/lite", () => ({
  setLogLevel: vi.fn(),
  getFirestore: vi.fn(() => "test-db"),
  connectFirestoreEmulator: vi.fn(),
  collection: (_db, ...segments) => segments.join("/"),
  documentId: () => "__name__",
  where: (field, op, value) => ({ field, op, value }),
  limit: (count) => ({ count }),
  query: (path, ...conditions) => ({ path, conditions }),
  orderBy: vi.fn(),
  Timestamp: { fromDate: vi.fn() },
  getDocs: vi.fn(),
}));

const snapshot = (records) => ({ docs: records.map(([id, fields]) => ({ id, data: () => fields })) });

beforeEach(() => vi.resetAllMocks());

it("uses four shared slots and starts a waiting read when a slot opens", async () => {
  const completions = Array.from({ length: 6 }, () => Promise.withResolvers());
  getDocs.mockImplementation((index) => completions[index].promise);
  const read = createDashboardRead();
  const all = Promise.all(completions.map((_, index) => read(index)));
  await Promise.resolve();
  expect(getDocs.mock.calls.flat()).toEqual([0, 1, 2, 3]);

  completions[2].resolve("third");
  await vi.waitFor(() => expect(getDocs.mock.calls.flat()).toEqual([0, 1, 2, 3, 4]));
  completions.forEach(({ resolve }, index) => resolve(index));
  await expect(all).resolves.toEqual([0, 1, "third", 3, 4, 5]);
});

it("does not start a queued query after the Dashboard attempt expires", async () => {
  const held = Promise.withResolvers();
  let active = true;
  getDocs.mockReturnValue(held.promise);
  const read = createDashboardRead(() => active);
  const first = Promise.all([0, 1, 2, 3].map(read));
  const queued = expect(read(4)).rejects.toThrow("Dashboard load is no longer active");
  await Promise.resolve();
  active = false;
  held.resolve("completed");
  await Promise.all([first, queued]);
  expect(getDocs).toHaveBeenCalledTimes(4);
});

it("keeps independent per-job limits and ignores withdrawn pending offers", async () => {
  getDocs.mockResolvedValueOnce(snapshot([["interested", { status: "INTERESTED" }]]))
    .mockResolvedValueOnce(snapshot([
      ["withdrawn", { status: "PENDING", managerDecision: "WITHDRAWN" }],
      ["available", { status: "PENDING" }],
      ["second", { status: "PENDING" }],
    ]))
    .mockResolvedValueOnce(snapshot([["issue", { status: "OPEN" }]]));

  await expect(getInterestedJobOffers("synthetic")).resolves.toEqual([{ id: "interested", status: "INTERESTED" }]);
  await expect(getPendingJobOffers("synthetic")).resolves.toEqual([{ id: "available", status: "PENDING" }]);
  await expect(getOpenJobIssues("synthetic")).resolves.toEqual([{ id: "issue", status: "OPEN" }]);
  expect(getDocs.mock.calls.map(([read]) => read)).toEqual([
    { path: "organizations/cleanflow-demo/jobs/synthetic/offers", conditions: [{ field: "status", op: "==", value: "INTERESTED" }, { count: 5 }] },
    { path: "organizations/cleanflow-demo/jobs/synthetic/offers", conditions: [{ field: "status", op: "==", value: "PENDING" }, { count: 10 }] },
    { path: "organizations/cleanflow-demo/jobs/synthetic/issues", conditions: [{ field: "status", op: "==", value: "OPEN" }, { count: 3 }] },
  ]);
});

it("batches deduplicated cleaner IDs and returns only names", async () => {
  const ids = Array.from({ length: 31 }, (_, index) => `cleaner-${index}`);
  getDocs.mockResolvedValueOnce(snapshot([["cleaner-0", { name: "First", phone: "ignored" }]]))
    .mockResolvedValueOnce(snapshot([["cleaner-30", { name: "Last" }]]));
  await expect(getCleanerNamesById([...ids, ids[0], null])).resolves.toEqual({
    "cleaner-0": "First",
    "cleaner-30": "Last",
  });
  expect(getDocs.mock.calls.map(([{ conditions }]) => conditions[0].value)).toEqual([
    ids.slice(0, 30), ids.slice(30),
  ]);
});
