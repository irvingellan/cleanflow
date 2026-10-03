import { describe, expect, it } from "vitest";
import { planDemoCleanup } from "./devCenterCleanup.js";

const seed = (kind, id, data = {}) => ({
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
    const records = [seed("jobs", "edited", { updatedAt: "later" }), { kind: "clients", id: "partial", data: { demoSeed: true } }];
    expect(planDemoCleanup(records).targets).toEqual([]);
  });
  it("propagates preservation across linked generated batches", () => {
    const job = { ...seed("jobs", "job", { clientId: "client" }), hasProtectedChildren: true };
    const client = seed("clients", "client", { demoSeedBatch: "dev-center-another" });
    expect(planDemoCleanup([job, client])).toEqual({ targets: [], skippedBatches: 2 });
  });
});
