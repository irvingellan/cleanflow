import { describe, expect, it, vi } from "vitest";
import { updateJobPricingForManager } from "./jobPricingUpdate.js";

const organizationId = "test-org";
const jobId = "test-job";
const root = `organizations/${organizationId}`;
const jobPath = `${root}/jobs/${jobId}`;
const jobBase = {
  organizationId, assignedCleanerIds: ["unpaid", "paid", "agreed"],
  approvedAssignments: { unpaid: "unpaid", paid: "paid", agreed: "agreed" },
  operationalStatus: "IN_PROGRESS", propertyId: "property", requiredCleanerCount: 3,
  clientPrice: 80, pay: { mode: "HOURLY", rateCents: 2400 },
};

function setup(jobFields = {}, { receipts = [], property = {} } = {}) {
  const writes = [];
  const job = { ...jobBase, ...jobFields };
  const collection = path => ({
    doc: (id = "history") => ({ path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }),
    where: () => ({ path, limit: () => ({ path }) }),
  });
  const data = value => ({ data: () => value });
  const assignment = (id, minutes, payoutCents, extra = {}) => ({
    ...data({ cleanerId: id, approvedWork: { minutes }, payoutCents, ...extra }), id,
    ref: { path: `${jobPath}/assignments/${id}` },
  });
  const docs = [
    assignment("unpaid", 65, 2600),
    assignment("paid", 60, 2400),
    assignment("agreed", 30, 1250, { paySnapshot: { offeredPay: { mode: "HOURLY", rateCents: 2500 } } }),
  ];
  const transaction = {
    get: vi.fn(async ref => {
      expect(writes).toHaveLength(0);
      switch (ref.path ?? ref) {
        case `${root}/members/manager`: return data({ role: "MANAGER", active: true });
        case jobPath: return data(job);
        case `${root}/properties/property`: return data(property);
        case `${root}/payouts`: return { docs: receipts.map(data), empty: receipts.length === 0 };
        case `${jobPath}/assignments`: return { docs, size: docs.length };
        default: throw new Error(`Unexpected read ${ref.path ?? ref}`);
      }
    }),
    update: (ref, changes) => writes.push({ path: ref.path, changes }),
    create: (ref, changes) => writes.push({ path: ref.path, changes }),
  };
  const db = {
    doc: path => ({ collection: name => collection(`${path}/${name}`), path }),
    runTransaction: callback => callback(transaction),
  };
  const call = data => updateJobPricingForManager(db, { auth: { uid: "manager" }, data: { jobId, ...data } }, organizationId);
  return { call, writes, transaction };
}

describe("Job pricing update", () => {
  const cleanerRate = { mode: "HOURLY", rateCents: 3000 };

  it("changes prices after approval and derives hourly client billing from every cleaner", async () => {
    const { call, writes } = setup();
    await call({ prices: { billing: { mode: "HOURLY", hourlyRateCents: 4500 }, pay: jobBase.pay } });
    expect(writes).toEqual([{ path: jobPath, changes: expect.objectContaining({
      "billing.hourlyRateCents": 4500,
      "billing.hours": { approved: true, approvedMinutes: 155, source: "APPROVED_ASSIGNMENTS",
        roster: ["unpaid", "paid", "agreed"], assignmentIds: ["agreed", "paid", "unpaid"] },
    }) }]);
  });

  it.each([
    [{ payoutIdsByCleaner: { paid: "recorded" } }, []],
    [{}, [{ cleanerId: "paid" }]],
  ])("recomputes only unpaid Job-rate pay and records it in the transaction", async (jobFields, receipts) => {
    const { call, writes } = setup(jobFields, { receipts });
    await expect(call({ prices: { clientPrice: 90, pay: cleanerRate } })).rejects.toMatchObject({ code: "failed-precondition" });
    expect(writes).toEqual([]);
    await call({ prices: { pay: cleanerRate }, cleanerOnly: true });
    expect(writes.map(write => write.path)).toEqual([jobPath, `${jobPath}/assignments/unpaid`, `${jobPath}/corrections/history`]);
    expect(writes[0].changes).not.toHaveProperty("clientPrice");
    expect(writes[1].changes).toEqual({ payoutCents: 3250 });
    expect(writes[2].changes).toMatchObject({
      kind: "CLEANER_PAY", before: { assignmentId: "unpaid", payoutCents: 2600 },
      after: { assignmentId: "unpaid", payoutCents: 3250 }, byUid: "manager", afterPayout: true,
      reason: expect.any(String), at: expect.anything(),
    });
  });

  it("defaults a legacy type to STANDARD and copies the selected Property rates when changed", async () => {
    const same = setup();
    await same.call({ details: { serviceType: "STANDARD", notes: "Synthetic note" } });
    expect(same.writes[0].changes).not.toHaveProperty("serviceType");
    expect(same.transaction.get.mock.calls).toHaveLength(3);

    const changed = setup({}, { property: { serviceRates: { MOVE_IN_OUT: {
      client: { mode: "FIXED", amountCents: 10500 },
      cleaner: { mode: "FIXED", amountCents: 6000, byCleanerCount: { 3: 1800 } },
    } } } });
    await changed.call({ details: { serviceType: "MOVE_IN_OUT" } });
    expect(changed.writes[0].changes).toMatchObject({
      serviceType: "MOVE_IN_OUT", clientPrice: 105, pay: { mode: "FIXED", perCleanerCents: 1800 },
    });
    expect(changed.writes[1].changes).toEqual({ payoutCents: 1800 });
  });

  it("preserves the current client rate when the selected type provides only cleaner pay", async () => {
    const { call, writes } = setup({}, { property: { serviceRates: {
      AIRBNB_TOUCH_UP: { cleaner: { mode: "HOURLY", amountCents: 2600 } },
    } } });
    await call({ details: { serviceType: "AIRBNB_TOUCH_UP" } });
    expect(writes[0].changes).not.toHaveProperty("clientPrice");
    expect(writes[0].changes).toMatchObject({ serviceType: "AIRBNB_TOUCH_UP", pay: { mode: "HOURLY", rateCents: 2600 } });
  });
});
