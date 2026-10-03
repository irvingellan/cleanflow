import { describe, expect, it } from "vitest";
import {
  buildDemoScenario,
  selectDemoCleanupTargets,
} from "./devCenterData.js";
import { buildWeeklyClose, previousServiceWeek } from "../../src/features/weekly-close/weeklyCloseModel.js";

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
    scenario.jobs.forEach((job) => {
      expect(job.data).toMatchObject({
        schemaVersion: 1,
        demoSeed: true,
        demoSeedBatch: batch,
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
    [quick, busyWeek, payoutTest].flatMap((scenario) => scenario.jobs).forEach((job) => {
      expect(job.data.schemaVersion).toBe(1);
    });
    const assignedJob = quick.jobs.find((job) => job.data.operationalStatus === "ASSIGNED");
    expect(assignedJob.data).toMatchObject({
      demoSeed: true,
      schemaVersion: 1,
      assignedCleanerId: expect.any(String),
      assignedCleanerName: expect.any(String),
      cleanerPayout: 150,
    });
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

  it("creates a synthetic Weekly Close week with financial gaps and marked payout evidence", () => {
    const timestamp = new Date("2026-10-03T14:00:00Z");
    const scenario = buildDemoScenario({ scenario: "weeklyClose", batch, createdAt: timestamp, now: timestamp });
    const records = [...scenario.clients, ...scenario.properties, ...scenario.cleaners, ...scenario.jobs, ...scenario.payouts];
    expect(scenario.jobs).toHaveLength(12);
    expect(scenario.payouts).toHaveLength(2);
    records.forEach(({ data }) => expect(data).toMatchObject({ demoSeed: true, demoSeedBatch: batch, demoSeedScenario: "weeklyClose" }));
    expect(scenario.jobs.find((job) => job.id.endsWith("missing-charge")).data).not.toHaveProperty("clientPrice");
    expect(scenario.jobs.find((job) => job.id.endsWith("missing-payout")).data).not.toHaveProperty("cleanerPayout");
    expect(scenario.jobs.find((job) => job.id.endsWith("zero")).data).toMatchObject({ clientPrice: 0, cleanerPayout: 0 });
    const model = buildWeeklyClose({
      jobs: scenario.jobs.map(({ id, data }) => ({ id, ...data })),
      payouts: scenario.payouts.map(({ id, data }) => ({ id, ...data })),
      clients: scenario.clients.map(({ id, data }) => ({ id, ...data })),
      properties: scenario.properties.map(({ id, data }) => ({ id, ...data })),
      weekStart: previousServiceWeek(timestamp).start,
      organizationId: "cleanflow-demo",
    });
    expect(model.overall).toMatchObject({ completedServiceCount: 8, knownClientCharges: 960, knownCleanerPayoutTotal: 500, missingClientPriceCount: 1, missingCleanerPayoutCount: 1 });
    expect(model.jobs.find((job) => job.id.endsWith("v2")).payoutStatus).toBe("UNKNOWN");
    expect(model.jobs.find((job) => job.id.endsWith("batch-a")).payoutStatus).toBe("UNKNOWN");
  });

  it("Weekly Close demo week follows Los Angeles Sunday/Monday instead of the UTC boundary", () => {
    const sunday = buildDemoScenario({ scenario: "weeklyClose", batch, createdAt, now: new Date("2026-10-05T06:30:00Z") });
    const monday = buildDemoScenario({ scenario: "weeklyClose", batch, createdAt, now: new Date("2026-10-05T07:30:00Z") });
    expect(sunday.jobs[0].data.scheduledDate).toBe("2026-09-21");
    expect(monday.jobs[0].data.scheduledDate).toBe("2026-09-28");
  });
});
