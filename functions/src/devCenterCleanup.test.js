import { describe, expect, it } from "vitest";
import { planDemoCleanup } from "./devCenterCleanup.js";

const seed = (kind, id, data = {}) => ({
  createTime: { seconds: 10, nanoseconds: 123 },
  updateTime: { seconds: 10, nanoseconds: 123 },
  kind, id, data: { demoSeed: true, demoSeedBatch: "dev-center-synthetic", createdAt: "timestamp", ...data },
});

describe("conservative Sandbox demo cleanup", () => {
  it("clears generated synthetic REAL jobs and reciprocal synthetic payouts only", () => {
    const records = [seed("jobs", "job", { dataProvenance: "REAL", payoutId: "payout" }), seed("payouts", "payout", { jobIds: ["job"] })];
    expect(planDemoCleanup(records)).toEqual({ targets: records, skippedBatches: 0 });
  });
  it("preserves workflow-created children and the entire generated parent batch", () => {
    const records = [{ ...seed("jobs", "job"), hasProtectedChildren: true }, seed("clients", "client")];
    expect(planDemoCleanup(records)).toEqual({ targets: [], skippedBatches: 1 });
  });
  it("never deletes a referenced parent from an unmarked surviving record", () => {
    const records = [seed("properties", "property"), seed("clients", "client"), { kind: "jobs", id: "manual", data: { propertyId: "property" } }];
    expect(planDemoCleanup(records)).toEqual({ targets: [], skippedBatches: 1 });
  });
  it("foreign payout or roster references protect generated jobs/cleaners", () => {
    const records = [seed("jobs", "job"), seed("cleaners", "cleaner"), { kind: "payouts", id: "manual", data: { jobIds: ["job"], cleanerId: "cleaner" } }];
    expect(planDemoCleanup(records).targets).toEqual([]);
  });
  it("preserves edited records and missing/malformed seed batch identities", () => {
    const records = [{ ...seed("jobs", "edited"), updateTime: { seconds: 11, nanoseconds: 123 } }, { kind: "clients", id: "partial", data: { demoSeed: true } }];
    expect(planDemoCleanup(records).targets).toEqual([]);
  });
  it("propagates preservation across linked generated batches", () => {
    const job = { ...seed("jobs", "job", { clientId: "client" }), hasProtectedChildren: true };
    const client = seed("clients", "client", { demoSeedBatch: "dev-center-another" });
    expect(planDemoCleanup([job, client])).toEqual({ targets: [], skippedBatches: 2 });
  });
  it("protects an edited document and its batch even when business timestamps are equal or absent", () => {
    for (const data of [{ createdAt: "same", updatedAt: "same" }, { createdAt: undefined, updatedAt: undefined }]) {
      const edited = { ...seed("jobs", "edited", data), updateTime: { seconds: 11, nanoseconds: 123 } };
      expect(planDemoCleanup([edited, seed("clients", "sibling")])).toEqual({ targets: [], skippedBatches: 1 });
    }
  });
  it("compares nanoseconds exactly rather than rounding to milliseconds", () => {
    const edited = { ...seed("jobs", "edited"), updateTime: { seconds: 10, nanoseconds: 124 } };
    expect(planDemoCleanup([edited])).toEqual({ targets: [], skippedBatches: 1 });
  });
  it("preserves missing, malformed or unsafe document metadata", () => {
    for (const metadata of [
      { createTime: undefined }, { updateTime: undefined }, { createTime: null, updateTime: null },
      { createTime: "timestamp", updateTime: "timestamp" },
      { createTime: {}, updateTime: {} },
      { updateTime: { seconds: 10, nanoseconds: -1 } },
      { updateTime: { seconds: 10, nanoseconds: 1_000_000_000 } },
      { createTime: { seconds: 1.5, nanoseconds: 0 }, updateTime: { seconds: 1.5, nanoseconds: 0 } },
      { createTime: { seconds: -62135596801, nanoseconds: 0 }, updateTime: { seconds: -62135596801, nanoseconds: 0 } },
      { createTime: { seconds: 253402300800, nanoseconds: 0 }, updateTime: { seconds: 253402300800, nanoseconds: 0 } },
      { createTime: { seconds: Number.MAX_SAFE_INTEGER + 1, nanoseconds: 0 }, updateTime: { seconds: Number.MAX_SAFE_INTEGER + 1, nanoseconds: 0 } },
      { createTime: { isEqual: () => true }, updateTime: { isEqual: () => true } },
      { createTime: { get seconds() { throw new Error("Uncomparable metadata"); } }, updateTime: { seconds: 10, nanoseconds: 0 } },
    ]) {
      expect(planDemoCleanup([{ ...seed("jobs", "unsafe"), ...metadata }, seed("clients", "sibling")])).toEqual({ targets: [], skippedBatches: 1 });
    }
  });
  it.each(["offers", "assignments", "issues"])("uses surviving %s children as reference evidence, never deletion targets", (kind) => {
    const cleaner = seed("cleaners", "cleaner");
    const job = { kind: "jobs", id: "manual", data: {} };
    const child = { kind, id: "manual/child", survives: true, data: { cleanerId: cleaner.id, jobId: job.id } };
    expect(planDemoCleanup([cleaner, job, child])).toEqual({ targets: [], skippedBatches: 1 });
  });
  it("preserves children of surviving parents even if the child has valid seed markers", () => {
    const child = { ...seed("offers", "manual/child", { cleanerId: "cleaner" }), survives: true };
    expect(planDemoCleanup([child, seed("cleaners", "cleaner")])).toEqual({ targets: [], skippedBatches: 1 });
  });
  it("propagates surviving child protection from batch A to referenced batch B", () => {
    const cleaner = seed("cleaners", "cleaner", { clientId: "client" });
    const client = seed("clients", "client", { demoSeedBatch: "dev-center-second" });
    const child = { kind: "assignments", id: "manual/assignment", survives: true, data: { cleanerId: "cleaner" } };
    expect(planDemoCleanup([cleaner, client, child])).toEqual({ targets: [], skippedBatches: 2 });
  });
  it("fails closed for unknown historical schemas or deeper surviving history", () => {
    const history = { kind: "jobs", id: "manual", data: {}, hasUnknownHistory: true };
    expect(planDemoCleanup([history, seed("cleaners", "cleaner"), seed("clients", "client", { demoSeedBatch: "dev-center-second" })])).toEqual({ targets: [], skippedBatches: 2 });
  });
  it("still clears the entire untouched synthetic batch, independent of business timestamps", () => {
    const records = [
      seed("clients", "client"), seed("properties", "property", { clientId: "client" }),
      seed("cleaners", "cleaner"), seed("jobs", "job", { propertyId: "property", cleanerId: "cleaner" }),
      seed("offers", "job/offer", { jobId: "job", cleanerId: "cleaner" }),
      seed("issues", "job/issue", { jobId: "job" }), seed("payouts", "payout", { jobIds: ["job"] }),
    ].map(record => ({ ...record, data: { ...record.data, createdAt: undefined, updatedAt: "irrelevant" } }));
    expect(planDemoCleanup(records)).toEqual({ targets: records, skippedBatches: 0 });
  });
});
