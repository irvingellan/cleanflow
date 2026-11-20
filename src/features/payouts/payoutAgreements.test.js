import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrichPayoutAgreements, jobWithPayoutAgreementsInTransaction } from "./payoutAgreements.js";

const sdk = vi.hoisted(() => {
  const reference = (base, ...parts) => [base, ...parts].filter(Boolean).join("/");
  return { reference, getDocs: vi.fn(), getDoc: vi.fn() };
});
vi.mock("firebase/firestore", () => ({ doc: (base, ...parts) => sdk.reference(base.path, ...parts) }));
vi.mock("firebase/firestore/lite", () => ({
  doc: sdk.reference, collection: sdk.reference, getDocs: sdk.getDocs, getDoc: sdk.getDoc,
  documentId: () => "__name__", where: (field, op, value) => ({ field, op, value }), limit: count => ({ count }),
  query: (path, ...constraints) => ({ path, constraints }),
}));
vi.mock("../../services/firebase/serverReads.js", () => ({ serverFirestore: () => "", withReadDeadline: p => p }));

const root = "organizations/org/jobs/job";
const snap = (id, value) => ({ id, data: () => value });
const job = { id: "job", organizationId: "org", schemaVersion: 2, operationalStatus: "COMPLETED",
  assignedCleanerIds: ["a", "b"], cleanerPayout: 200 };
const assignment = (id, fields) => snap(id, { organizationId: "org", jobId: "job", isActive: true, ...fields });
const apply = async (record = job) => (await enrichPayoutAgreements([record], { organizationId: "org" }))[0].payoutAgreementsByCleaner;
const db = new Map();

beforeEach(() => {
  vi.clearAllMocks();
  db.clear();
  sdk.getDoc.mockImplementation(async path => db.get(path) ?? snap(path.split("/").at(-1), undefined));
  sdk.getDocs.mockImplementation(async ({ path, constraints }) => {
    const docs = [...db].filter(([key]) => key.startsWith(path + "/")).map(([, doc]) => doc)
      .filter(doc => constraints.every(({ field, op, value }) => {
        if (!field) return true;
        const actual = field === "__name__" ? doc.id : doc.data()[field];
        return op === "in" ? value.includes(actual) : actual === value;
      })).slice(0, constraints.find(rule => rule.count)?.count);
    return { docs, empty: docs.length === 0 };
  });
});

describe("payout agreement reads", () => {
  it("uses a private frozen total for the actual working team, preserving an explicit null for another offer", async () => {
    db.set(root + "/assignments/aa", assignment("aa", { cleanerId: "a", source: "MANAGER_DIRECT",
      paySnapshot: { offeredCompensation: 33.33, offeredFirstSlotExtraCents: 1, fixedHousePay: { totalCents: 10000, teamSize: 3 } } }));
    db.set(root + "/assignments/bb", assignment("bb", { cleanerId: "b", source: "OFFER", sourceOfferId: "b" }));
    db.set(root + "/offers/b", snap("b", { cleanerId: "b", status: "INTERESTED", offeredCompensation: null, secret: "internal" }));
    await expect(apply()).resolves.toEqual({ a: { offeredCompensation: 50 }, b: { offeredCompensation: null } });
    expect(sdk.getDocs.mock.calls[0][0].constraints).toContainEqual({ field: "cleanerId", op: "in", value: ["a", "b"] });
    expect(sdk.getDocs.mock.calls[0][0].constraints).toContainEqual({ count: 3 });
  });

  it("allows the Job fallback for pre-agreement records; a named or malformed source blocks it", async () => {
    await expect(apply({ ...job, payoutAgreementsByCleaner: { a: { offeredCompensation: 999 } } })).resolves.toEqual({});
    db.set(root + "/assignments/aa", assignment("aa", { cleanerId: "a", source: "OFFER", sourceOfferId: "missing" }));
    db.set(root + "/assignments/bb", assignment("bb", { cleanerId: "b", source: "MANAGER_DIRECT", paySnapshot: { internal: 123 } }));
    await expect(apply()).resolves.toEqual({ a: null, b: null });
    db.set(root + "/offers/missing", snap("missing", { cleanerId: "a", status: "INTERESTED" }));
    await expect(apply()).resolves.toEqual({ b: null });
  });

  it("checks the exact recipient on noncanonical IDs and never reads the indicated stranger's terms", async () => {
    db.set(root + "/assignments/aa", assignment("aa", { cleanerId: "a", source: "OFFER", sourceOfferId: "b" }));
    db.set(root + "/offers/b", snap("b", { cleanerId: "b", status: "ACCEPTED", offeredCompensation: 88 }));
    await expect(apply()).resolves.toEqual({ a: null });
    expect(sdk.getDoc).not.toHaveBeenCalled();
    expect(sdk.getDocs.mock.calls.at(-1)[0].constraints).toContainEqual({ field: "cleanerId", op: "==", value: "a" });
  });

  it.each([
    { cleanerId: "b" }, { organizationId: "other" }, { jobId: "other" }, { status: "DECLINED" }, { revokedAt: "then" },
    { fixedHousePay: { totalCents: 10000, teamSize: 3 } },
  ])("marks suspicious agreement data for review (%o)", async changed => {
    db.set(root + "/assignments/aa", assignment("aa", { cleanerId: "a", source: "OFFER", sourceOfferId: "a" }));
    db.set(root + "/offers/a", snap("a", { cleanerId: "a", status: "INTERESTED", offeredCompensation: 90, ...changed }));
    await expect(apply()).resolves.toEqual({ a: null });
  });

  it("accepts only reciprocal replacement offers and preserves a frozen hourly rate", async () => {
    const source = "replacement-01234567890123456789";
    db.set(root + "/assignments/aa", assignment("aa", { cleanerId: "a", source: "OFFER", sourceOfferId: source, replacementOfferId: source }));
    const offer = { cleanerId: "a", status: "SELECTED", offerKind: "MANUAL_REPLACEMENT", replacementOfferId: source,
      replacementAssignmentId: "aa", offeredPay: { mode: "HOURLY", rateCents: 2467 } };
    db.set(root + "/offers/" + source, snap(source, offer));
    await expect(apply()).resolves.toEqual({ a: { offeredPay: { mode: "HOURLY", rateCents: 2467 } } });
    db.set(root + "/offers/" + source, snap(source, { ...offer, replacementAssignmentId: "wrong" }));
    await expect(apply()).resolves.toEqual({ a: null });
  });

  it("loads only the canonical interested offer on single-cleaner legacy jobs, preserving the prior personal value", async () => {
    const legacy = { ...job, schemaVersion: 1, assignedCleanerId: "b", assignedCleanerIds: undefined };
    await expect(apply(legacy)).resolves.toEqual({});
    db.set(root + "/offers/b", snap("b", { cleanerId: "b", status: "INTERESTED", offeredCompensation: 68.25 }));
    await expect(apply(legacy)).resolves.toEqual({ b: { offeredCompensation: 68.25 } });
    expect(sdk.getDocs).not.toHaveBeenCalled();
  });

  it("re-reads only the payout recipient's assignment and offer in the transaction", async () => {
    const aa = assignment("aa", { cleanerId: "a", source: "OFFER", sourceOfferId: "a" });
    db.set(root + "/assignments/aa", aa);
    db.set(root + "/assignments/bb", assignment("bb", { cleanerId: "b", source: "OFFER", sourceOfferId: "b" }));
    const transaction = { get: vi.fn(async path => path.endsWith("/offers/a")
      ? snap("a", { cleanerId: "a", status: "INTERESTED", offeredCompensation: 71 }) : db.get(path)) };
    const ref = { path: root, parent: { parent: { id: "org" } } };
    const enriched = await jobWithPayoutAgreementsInTransaction(transaction, ref, job, "a");
    expect(enriched.payoutAgreementsByCleaner).toEqual({ a: { offeredCompensation: 71 } });
    expect(transaction.get.mock.calls.flat()).toEqual([root + "/assignments/aa", root + "/offers/a"]);
    transaction.get.mockResolvedValue(snap("aa", undefined));
    expect((await jobWithPayoutAgreementsInTransaction(transaction, ref, job, "a")).payoutAgreementsByCleaner).toEqual({ a: null });
  });

  it("rejects ambiguous active assignments and skips irrelevant or foreign jobs", async () => {
    db.set(root + "/assignments/a1", assignment("a1", { cleanerId: "a", source: "MANAGER_DIRECT" }));
    db.set(root + "/assignments/a2", assignment("a2", { cleanerId: "a", source: "MANAGER_DIRECT" }));
    await expect(apply()).resolves.toEqual({ a: null });
    vi.clearAllMocks();
    await expect(apply({ ...job, organizationId: "other" })).resolves.toEqual({ a: null, b: null });
    await expect(apply({ ...job, operationalStatus: "ASSIGNED" })).resolves.toEqual({});
    expect(sdk.getDocs).not.toHaveBeenCalled();
  });

  it("surfaces denied reads and cancellation instead of treating them as missing agreements", async () => {
    sdk.getDocs.mockRejectedValueOnce(new Error("denied"));
    await expect(apply()).rejects.toThrow("denied");
    const controller = new AbortController();
    controller.abort();
    await expect(enrichPayoutAgreements([job], { organizationId: "org", signal: controller.signal })).rejects.toThrow();
  });
});
