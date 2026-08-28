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
      ...scenario.clients,
      ...scenario.properties,
      ...scenario.cleaners,
      ...scenario.jobs,
      ...scenario.offers,
      ...scenario.issues,
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

  it("creates a realistic, marked Manager Training operation without duplicate property times", () => {
    const training = buildDemoScenario({
      scenario: "managerTraining",
      batch,
      createdAt,
      now,
    });
    const statusCounts = training.jobs.reduce((counts, job) => {
      counts[job.data.operationalStatus] = (counts[job.data.operationalStatus] || 0) + 1;
      return counts;
    }, {});
    const records = [
      ...training.clients,
      ...training.properties,
      ...training.cleaners,
      ...training.jobs,
      ...training.offers,
      ...training.issues,
    ];
    const propertyTimes = training.jobs.map((job) =>
      `${job.data.propertyId}:${job.data.scheduledDate}:${job.data.scheduledStart}`,
    );

    expect(training.jobs).toHaveLength(36);
    expect(training.clients).toHaveLength(3);
    expect(training.properties).toHaveLength(9);
    expect(training.cleaners).toHaveLength(6);
    expect(training.offers).toHaveLength(14);
    expect(training.issues).toHaveLength(3);
    expect(statusCounts).toEqual({
      UNASSIGNED: 8,
      OFFERED: 7,
      ASSIGNED: 8,
      IN_PROGRESS: 3,
      COMPLETED: 10,
    });
    expect(training.offers.filter((offer) => offer.data.status === "INTERESTED")).toHaveLength(3);
    expect(new Set(propertyTimes).size).toBe(training.jobs.length);
    records.forEach((record) => {
      expect(record.data).toMatchObject({
        demoSeed: true,
        demoSeedBatch: batch,
        demoSeedScenario: "manager-training",
        createdAt,
      });
    });
    expect(selectDemoCleanupTargets([
      ...records,
      { id: "normal-record", data: { demoSeed: false } },
    ])).toHaveLength(records.length);
  });
});
