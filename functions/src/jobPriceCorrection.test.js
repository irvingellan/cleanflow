import { describe, expect, it, vi } from "vitest";
import { correctJobPricesForManager } from "./jobPriceCorrection.js";

const jobPath = "organizations/org/jobs/job";
const memberPath = "organizations/org/members/manager";
const payoutQuery = { where: vi.fn(() => ({ limit: () => "payout-query" })) };
const clientPricing = { mode: "HOURLY", hourlyRateCents: 5500 };
const paidJob = {
  organizationId: "org",
  billing: { mode: "HOURLY", hourlyRateCents: 4500, hours: { approved: true, amount: 4 }, additionalFees: [] },
  cleanerPayout: 120,
  pay: { mode: "FIXED", perCleanerCents: 6000 },
  payoutIdsByCleaner: { "cleaner-a": "payout" },
};

function setup({ job = paidJob, member = { role: "MANAGER", active: true }, payoutRecord = false } = {}) {
  const transaction = {
    get: vi.fn(async (path) => ({
      data: () => path === memberPath ? member : path === jobPath ? job : undefined,
      empty: !payoutRecord,
    })),
    update: vi.fn(),
    create: vi.fn(),
  };
  const jobRef = { path: jobPath, collection: (name) => ({ doc: () => `${jobPath}/${name}/auto-id` }) };
  const org = { collection: (name) => name === "jobs" ? { doc: () => jobRef } : payoutQuery };
  const database = {
    doc: (path) => path === "organizations/org" ? org : path,
    runTransaction: vi.fn((operation) => operation({
      ...transaction,
      get: (ref) => transaction.get(ref === jobRef ? ref.path : ref),
    })),
  };
  const call = (data = {}, auth = { uid: "manager" }) => correctJobPricesForManager(database, {
    data: { jobId: "job", clientPricing, reason: "  Rate entered incorrectly  ", ...data },
    auth,
  }, "org");
  return { call, transaction, database, jobRef };
}

describe("correctJobPricesForManager", () => {
  it("leaves an unchanged price and history alone", async () => {
    const { call, transaction } = setup();
    await expect(call({ clientPricing: { mode: "HOURLY", hourlyRateCents: 4500 } })).resolves.toEqual({ unchanged: true });
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it("updates only client price fields and records the change after a partial team payout", async () => {
    const { call, transaction, database, jobRef } = setup();
    await expect(call()).resolves.toEqual({ unchanged: false });
    expect(database.runTransaction).toHaveBeenCalledOnce();
    expect(transaction.get.mock.calls).toEqual([[memberPath], [jobPath]]);
    expect(transaction.update).toHaveBeenCalledExactlyOnceWith(jobRef, {
      clientPrice: expect.anything(),
      "billing.mode": "HOURLY",
      "billing.hourlyRateCents": 5500,
    });
    expect(transaction.create).toHaveBeenCalledExactlyOnceWith(`${jobPath}/corrections/auto-id`, {
      kind: "CLIENT_PRICE",
      before: { mode: "HOURLY", hourlyRateCents: 4500 },
      after: clientPricing,
      reason: "Rate entered incorrectly",
      byUid: "manager",
      at: expect.anything(),
      afterPayout: true,
    });
  });

  it.each([true, false])("changes hourly to fixed and looks for payout records without Job markers (%s)", async (payoutRecord) => {
    const job = { ...paidJob, payoutIdsByCleaner: {} };
    const { call, transaction, jobRef } = setup({ job, payoutRecord });
    await call({ clientPricing: { mode: "FIXED", amountCents: 8599 } });
    expect(payoutQuery.where).toHaveBeenCalledWith("jobIds", "array-contains", "job");
    expect(transaction.update).toHaveBeenCalledExactlyOnceWith(jobRef, {
      clientPrice: 85.99,
      "billing.mode": "FIXED",
      "billing.hourlyRateCents": expect.anything(),
    });
    expect(transaction.create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      after: { mode: "FIXED", amountCents: 8599 }, afterPayout: payoutRecord,
    }));
  });

  it("corrects legacy dollar prices including a zero amount", async () => {
    const { call, transaction, jobRef } = setup({ job: { organizationId: "org", payoutId: "payout", clientPrice: 100.01 } });
    await call({ clientPricing: { mode: "FIXED", amountCents: 0 } });
    expect(transaction.update).toHaveBeenCalledExactlyOnceWith(jobRef, { clientPrice: 0 });
    expect(transaction.create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      before: { mode: "FIXED", amountCents: 10001 }, afterPayout: true,
    }));
  });

  it.each([{ role: "CLEANER", active: true }, { role: "MANAGER", active: false }, null])("rejects membership %j", async (member) => {
    const { call, transaction } = setup({ member });
    await expect(call()).rejects.toMatchObject({ code: "permission-denied" });
    expect(transaction.get).toHaveBeenCalledExactlyOnceWith(memberPath);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it("rejects anonymous and cross-organization requests", async () => {
    const { call, transaction } = setup({ job: { ...paidJob, organizationId: "other" } });
    await expect(call({}, null)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(call()).rejects.toMatchObject({ code: "not-found" });
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it.each([null, "  ab  ", "a".repeat(201), "one\u0000two"])("rejects invalid reasons", async (reason) => {
    const { call, transaction } = setup();
    await expect(call({ reason })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it.each([
    null, { mode: "FIXED" }, { mode: "FIXED", amountCents: -1 }, { mode: "FIXED", amountCents: "100" },
    { mode: "HOURLY", hourlyRateCents: 1.25 }, { mode: "HOURLY", hourlyRateCents: 10_000_001 },
    { mode: "HOURLY", hourlyRateCents: 5000, amountCents: 4000 }, { mode: "OVERRIDE", amountCents: 4000 },
  ])("rejects invalid prices %j", async (price) => {
    const { call, transaction } = setup();
    await expect(call({ clientPricing: price })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(transaction.create).not.toHaveBeenCalled();
  });
});
