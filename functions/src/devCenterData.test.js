import { describe, expect, it } from "vitest";
import {
  buildDemoScenario,
  selectDemoCleanupTargets,
} from "./devCenterData.js";

const createdAt = "test-timestamp";
const batch = "dev-center-test";
const now = new Date("2026-08-28T12:00:00");

describe("Dev Center demo scenarios", () => {
  it("marks every generated record as Dev Center demo data", () => {
    const scenario = buildDemoScenario({ scenario: "quick", batch, createdAt, now });
    const records = [
      scenario.client,
      ...scenario.properties,
      ...scenario.cleaners,
      ...scenario.jobs,
      ...scenario.offers,
    ];

    expect(records).toHaveLength(21);
    records.forEach((record) => {
      expect(record.data).toMatchObject({
        demoSeed: true,
        demoSeedBatch: batch,
        demoSeedScenario: "quick",
        createdAt,
      });
    });
  });

  it("creates the intended rough status distribution for each scenario", () => {
    const quick = buildDemoScenario({ scenario: "quick", batch, createdAt, now });
    const busyWeek = buildDemoScenario({ scenario: "busyWeek", batch, createdAt, now });
    const payoutTest = buildDemoScenario({ scenario: "payoutTest", batch, createdAt, now });

    expect(quick.jobs).toHaveLength(10);
    expect(new Set(quick.jobs.map((job) => job.data.operationalStatus))).toEqual(
      new Set(["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"]),
    );
    expect(busyWeek.jobs).toHaveLength(35);
    expect(payoutTest.jobs).toHaveLength(5);
    expect(payoutTest.jobs.every((job) => job.data.operationalStatus === "COMPLETED")).toBe(true);
    expect(payoutTest.jobs.every((job) => !job.data.payoutId)).toBe(true);
  });

  it("selects only marked demo records for cleanup", () => {
    const targets = selectDemoCleanupTargets([
      { id: "demo-job", data: { demoSeed: true } },
      { id: "real-job", data: { operationalStatus: "COMPLETED" } },
      { id: "legacy-job", data: { demoSeed: false } },
    ]);

    expect(targets.map((record) => record.id)).toEqual(["demo-job"]);
  });
});
