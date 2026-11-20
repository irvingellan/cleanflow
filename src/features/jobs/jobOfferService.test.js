import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_database, ...parts) => ({ path: parts.join("/") })),
  collection: vi.fn((_database, ...parts) => ({ path: parts.join("/") })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
  Timestamp: { fromMillis: vi.fn((millis) => ({ millis })) },
  updateDoc: vi.fn(),
  where: vi.fn(),
  transactionUpdate: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  limit: mocks.limit,
  query: mocks.query,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
  Timestamp: mocks.Timestamp,
  updateDoc: mocks.updateDoc,
  where: mocks.where,
}));
vi.mock("../../services/firebase/client.js", () => ({ db: { testDatabase: true }, functions: {} }));

const { createJobOffers, createPublicOfferLink } = await import("./jobOfferService.js");

describe("createPublicOfferLink compensation snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runTransaction.mockImplementation(async (_database, callback) => callback({
      get: async (reference) => reference.path.endsWith("/jobs/job-1")
        ? {
          exists: () => true,
          data: () => ({ schemaVersion: 2, operationalStatus: "OFFERED" }),
        }
        : {
          exists: () => true,
          data: () => ({ status: "PENDING" }),
        },
      update: mocks.transactionUpdate,
    }));
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes) => {
        bytes.fill(7);
        return bytes;
      },
      subtle: {
        digest: async () => new Uint8Array(32).buffer,
      },
    });
  });

  it("persists and returns the exact manager-confirmed amount with the new link", async () => {
    const result = await createPublicOfferLink({
      jobId: "job-1",
      cleanerId: "cleaner-1",
      offeredCompensation: 125.5,
    });

    expect(mocks.transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "organizations/cleanflow-demo/jobs/job-1/offers/cleaner-1",
      }),
      expect.objectContaining({ offeredCompensation: 125.5 }),
    );
    expect(result).toMatchObject({
      url: expect.stringMatching(/^http:\/\/localhost:\d+\/offer\//),
      offeredCompensation: 125.5,
      tokenHash: "00".repeat(32),
      expiresAtMs: expect.any(Number),
    });
  });

  it("rotates the public link without changing an hourly snapshot or putting it in the URL", async () => {
    const offeredPay = { mode: "HOURLY", rateCents: 3125 };
    mocks.runTransaction.mockImplementationOnce(async (_database, callback) => callback({
      get: async reference => ({
        exists: () => true,
        data: () => reference.path.endsWith("jobs/job-1")
          ? { schemaVersion: 2, operationalStatus: "OFFERED" }
          : { status: "PENDING", offeredPay },
      }),
      update: mocks.transactionUpdate,
    }));
    const link = await createPublicOfferLink({ jobId: "job-1", cleanerId: "cleaner-1", offeredCompensation: null });
    expect(link.offeredPay).toEqual(offeredPay);
    expect(link).not.toHaveProperty("offeredCompensation");
    expect(link.url).not.toMatch(/3125|hour|[?]/);
    expect(mocks.transactionUpdate.mock.calls[0][1]).not.toHaveProperty("offeredCompensation");
    expect(mocks.transactionUpdate.mock.calls[0][1]).not.toHaveProperty("offeredPay");
  });

  it("persists an explicit null for a manager-confirmed unset amount", async () => {
    const result = await createPublicOfferLink({
      jobId: "job-1",
      cleanerId: "cleaner-1",
      offeredCompensation: null,
    });

    expect(mocks.transactionUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ offeredCompensation: null }),
    );
    expect(result.offeredCompensation).toBeNull();
  });

  it("does not update an Offer after the cleaner has responded", async () => {
    mocks.runTransaction.mockImplementationOnce(async (_database, callback) => callback({
      get: async (reference) => reference.path.endsWith("/jobs/job-1")
        ? {
          exists: () => true,
          data: () => ({ schemaVersion: 2, operationalStatus: "OFFERED" }),
        }
        : {
          exists: () => true,
          data: () => ({ status: "INTERESTED" }),
        },
      update: mocks.transactionUpdate,
    }));

    await expect(createPublicOfferLink({
      jobId: "job-1",
      cleanerId: "cleaner-1",
      offeredCompensation: 125,
    })).rejects.toMatchObject({ code: "offer-unavailable" });
    expect(mocks.transactionUpdate).not.toHaveBeenCalled();
  });

  it("rejects omitted or invalid amounts before creating a public link", async () => {
    await expect(createPublicOfferLink({ jobId: "job-1", cleanerId: "cleaner-1" }))
      .rejects.toMatchObject({ code: "invalid-offered-compensation" });
    await expect(createPublicOfferLink({
      jobId: "job-1",
      cleanerId: "cleaner-1",
      offeredCompensation: -1,
    })).rejects.toMatchObject({ code: "invalid-offered-compensation" });

    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });
});

describe("manual hourly offers", () => {
  const offeredPay = { mode: "HOURLY", rateCents: 3167 };
  const job = { schemaVersion: 2, operationalStatus: "OFFERED", assignedCleanerIds: [], pay: offeredPay };
  const send = () => createJobOffers({ jobId: "hourly-job", cleaners: [{ id: "cleaner", name: "Cleaner" }], offeredPay });
  function transactionWithOffer(existing, currentJob = job) {
    const set = vi.fn();
    const jobSnapshot = { exists: () => true, data: () => currentJob };
    mocks.getDoc.mockResolvedValue(jobSnapshot);
    mocks.runTransaction.mockImplementationOnce(async (_db, callback) => callback({
      get: async ref => ref.path.endsWith("/jobs/hourly-job") ? jobSnapshot : { exists: () => existing },
      set,
    }));
    return set;
  }
  it("saves only the agreed hourly rate and makes the new Hub invitation visible", async () => {
    const set = transactionWithOffer(false);
    await send();
    expect(set.mock.calls[0][1]).toMatchObject({ offeredPay, publicOfferExpiresAt: { millis: expect.any(Number) } });
    expect(set.mock.calls[0][1]).not.toHaveProperty("offeredCompensation");
  });
  it("preserves prior offers and refuses stale displayed rates", async () => {
    const existing = transactionWithOffer(true);
    await expect(send()).rejects.toThrow("already has an offer");
    expect(existing).not.toHaveBeenCalled();
    const changedMode = transactionWithOffer(false);
    await expect(createJobOffers({ jobId: "hourly-job", cleaners: [{ id: "cleaner" }], offeredCompensation: 80 }))
      .rejects.toThrow("rate changed");
    expect(changedMode).not.toHaveBeenCalled();
    const stale = transactionWithOffer(false, { ...job, pay: { ...offeredPay, rateCents: 1000 } });
    await expect(send()).rejects.toThrow("rate changed");
    expect(stale).not.toHaveBeenCalled();
  });
});
