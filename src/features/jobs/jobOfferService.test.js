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
vi.mock("../../services/firebase/client.js", () => ({ db: { testDatabase: true } }));

const { createPublicOfferLink } = await import("./jobOfferService.js");

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
    });
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
