import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCurrentJobCreateData, getJobGrossMargin } from "./jobCompatibility.js";
import { createJob, updateJobDetails, updateJobPrices } from "./jobService.js";

const db = vi.hoisted(() => ({
  transaction: { get: vi.fn(), update: vi.fn() },
  read: vi.fn(), add: vi.fn(), deleted: Symbol("deleted"),
}));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal()),
  collection: (_db, ...path) => path.join("/"),
  doc: (_db, ...path) => path.join("/"),
  runTransaction: (_db, operation) => operation(db.transaction),
  getDoc: db.read, addDoc: db.add, deleteField: () => db.deleted,
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

  it("preserves fees and draft hours on an hourly rate edit and removes stale fixed totals", async () => {
    db.transaction.get.mockResolvedValue(record({ ...hourly, billing: { ...hourly.billing,
      hours: { approved: false }, additionalFees: [{ amountCents: 1500 }] } }));
    await updateJobPrices("sample-job", hourly);
    expect(db.transaction.update).toHaveBeenCalledWith(expect.any(String), {
      clientPrice: db.deleted, cleanerPayout: db.deleted,
      "billing.mode": "HOURLY", "billing.hourlyRateCents": 4600, pay: hourly.pay,
    });
  });

  it("clears hourly fields on an explicit switch to fixed, preserving unrelated billing fields", async () => {
    db.transaction.get.mockResolvedValue(record({ ...hourly, billing: { ...hourly.billing, hours: { approved: false } } }));
    await updateJobPrices("sample-job", { clientPrice: 75, cleanerPayout: 55 });
    expect(db.transaction.update).toHaveBeenCalledWith(expect.any(String), {
      clientPrice: 75, cleanerPayout: 55, pay: db.deleted, "billing.mode": "FIXED",
      "billing.hourlyRateCents": db.deleted, "billing.hours": db.deleted,
    });
  });

  it("replaces an unknown mode only when explicitly correcting it to fixed", async () => {
    db.transaction.get.mockResolvedValue(record({ billing: { mode: "UNRECOGNIZED" } }));
    await updateJobPrices("sample-job", { clientPrice: 22 });
    expect(db.transaction.update.mock.calls[0][1]).toMatchObject({ clientPrice: 22, "billing.mode": "FIXED" });
  });

  it("takes rates and team size from transactional reads only when the service type changes", async () => {
    const job = record({ propertyId: "sample-property", requiredCleanerCount: 2, serviceType: "STANDARD" });
    const property = record({ serviceRates: { MOVE_IN_OUT: {
      cleaner: { mode: "HOURLY", amountCents: 2200, byCleanerCount: { 2: 1999 } },
      client: { mode: "FIXED", amountCents: 13000 },
    } } });
    db.transaction.get.mockResolvedValueOnce(job).mockResolvedValueOnce(property).mockResolvedValueOnce(job);
    await updateJobDetails("sample-job", { serviceType: "MOVE_IN_OUT" });
    expect(db.transaction.update.mock.calls[0][1]).toMatchObject({
      serviceType: "MOVE_IN_OUT", clientPrice: 130, cleanerPayout: db.deleted, pay: { mode: "HOURLY", rateCents: 1999 },
    });
    await updateJobDetails("sample-job", { notes: "Synthetic note" });
    expect(db.transaction.get).toHaveBeenCalledTimes(3);
    expect(db.transaction.update.mock.calls[1][1]).toEqual({ notes: "Synthetic note", guestName: db.deleted });
  });

  it.each([{ payoutId: "recorded" }, { payoutPaidAt: new Date(0) }, { billing: { hours: { approved: true } } }])(
    "rejects a price edit when a concurrent read finds recorded money or approved hours", async (fields) => {
      db.transaction.get.mockResolvedValue(record(fields));
      await expect(updateJobPrices("sample-job", hourly)).rejects.toThrow("read-only");
      expect(db.transaction.update).not.toHaveBeenCalled();
    },
  );
});
