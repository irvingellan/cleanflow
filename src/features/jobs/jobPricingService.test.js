import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCurrentJobCreateData, getJobGrossMargin } from "./jobCompatibility.js";
import { createJob, updateJobDetails, updateJobPrices } from "./jobService.js";

const db = vi.hoisted(() => ({
  transaction: { get: vi.fn(), update: vi.fn() },
  read: vi.fn(), add: vi.fn(), callable: vi.fn(), deleted: Symbol("deleted"),
}));
vi.mock("../../services/firebase/client.js", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal()),
  collection: (_db, ...path) => path.join("/"),
  doc: (_db, ...path) => path.join("/"),
  runTransaction: (_db, operation) => operation(db.transaction),
  getDoc: db.read, getDocFromServer: db.read, addDoc: db.add, deleteField: () => db.deleted,
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions, name) => (input) => db.callable(name, input),
}));

const hourly = { billing: { mode: "HOURLY", hourlyRateCents: 4600 }, pay: { mode: "HOURLY", rateCents: 2350 } };
const record = (data) => ({ id: "sample-job", exists: () => true, data: () => data });

beforeEach(() => {
  vi.resetAllMocks();
  db.read.mockResolvedValue(record({}));
});

describe("manager job pricing writes", () => {
  it("creates an hourly job with cents and preserves the legacy fixed representation", async () => {
    db.add.mockResolvedValue({ id: "new-job" });
    const job = await createJob({ ...hourly, propertyId: "p", scheduledDate: "2026-01-01" });
    expect(job).toMatchObject(hourly);
    expect(job).not.toHaveProperty("clientPrice");
    expect(job).not.toHaveProperty("cleanerPayout");
    const legacy = buildCurrentJobCreateData({ clientPrice: 350, cleanerPayout: 200 });
    expect(legacy).not.toHaveProperty("billing");
    expect(legacy).not.toHaveProperty("pay");
    expect(getJobGrossMargin(legacy)).toBe(150);
    expect(getJobGrossMargin({ ...hourly, clientPrice: 350, cleanerPayout: 200 })).toBeNull();
    expect(() => buildCurrentJobCreateData({ pay: { mode: "HOURLY", rateCents: -1 } })).toThrow();
  });

  it("sends validated pricing to the server even when hours are approved", async () => {
    await updateJobPrices("sample-job", hourly);
    expect(db.callable).toHaveBeenCalledWith("updateJobPricing", {
      jobId: "sample-job", prices: hourly, cleanerOnly: false,
    });
    expect(db.transaction.update).not.toHaveBeenCalled();
  });

  it("uses the same server operation for a service type change and its associated details", async () => {
    await updateJobDetails("sample-job", { serviceType: "MOVE_IN_OUT", notes: "Synthetic note" });
    expect(db.callable).toHaveBeenCalledWith("updateJobPricing", {
      jobId: "sample-job", details: { serviceType: "MOVE_IN_OUT", notes: "Synthetic note", guestName: null },
    });
    expect(db.transaction.update).not.toHaveBeenCalled();
  });

  it("retains the existing details-only save path", async () => {
    db.transaction.get.mockResolvedValue(record({ approvedAssignments: { assignment: "cleaner" } }));
    await updateJobDetails("sample-job", { notes: "Synthetic note" });
    expect(db.transaction.update).toHaveBeenCalledWith(expect.any(String), { notes: "Synthetic note", guestName: db.deleted });
    expect(db.callable).not.toHaveBeenCalled();
  });
});
