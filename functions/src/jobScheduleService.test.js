import { describe, expect, it } from "vitest";
import {
  isValidScheduledDate,
  normalizeRescheduleInput,
  rescheduleJobForManager,
} from "./jobScheduleService.js";

function fakeDatabase({ initialRecords = {}, failCommit = false } = {}) {
  const records = new Map(Object.entries(initialRecords).map(([path, data]) => [path, structuredClone(data)]));
  const reference = (path) => ({
    path,
    collection(name) {
      return reference(`${path}/${name}`);
    },
    doc(id) {
      return reference(`${path}/${id}`);
    },
  });
  const database = {
    doc: reference,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          const data = records.get(ref.path);
          return {
            exists: Boolean(data),
            data: () => data && structuredClone(data),
          };
        },
        create(ref, data) {
          writes.push({ type: "create", path: ref.path, data: { ...data } });
        },
        update(ref, data) {
          writes.push({ type: "update", path: ref.path, data: { ...data } });
        },
      };
      const result = await callback(transaction);
      if (failCommit) throw new Error("synthetic transaction commit failure");
      for (const write of writes) {
        if (write.type === "create") {
          if (records.has(write.path)) throw new Error("already exists");
          records.set(write.path, { ...write.data });
        } else {
          records.set(write.path, { ...records.get(write.path), ...write.data });
        }
      }
      return result;
    },
  };
  return { database, records };
}

describe("Job schedule validation", () => {
  it.each([
    ["2026-02-28", true],
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-04-31", false],
    ["2026-13-01", false],
    ["0000-01-01", false],
    ["10/02/2026", false],
  ])("validates calendar date %s", (date, expected) => {
    expect(isValidScheduledDate(date)).toBe(expected);
  });

  it("requires a valid date and valid optional 24-hour time", () => {
    expect(normalizeRescheduleInput({ jobId: "job", scheduledDate: "2026-10-01", scheduledStart: "" }))
      .toEqual({ jobId: "job", scheduledDate: "2026-10-01", scheduledStart: "" });
    expect(() => normalizeRescheduleInput({ jobId: "job", scheduledDate: "2026-02-30", scheduledStart: "" }))
      .toThrow("Enter a valid scheduled date.");
    expect(() => normalizeRescheduleInput({ jobId: "job", scheduledDate: "2026-10-01", scheduledStart: "24:00" }))
      .toThrow("Enter a valid scheduled time or leave it blank.");
    expect(() => normalizeRescheduleInput({ jobId: "../other", scheduledDate: "2026-10-01", scheduledStart: "10:00" }))
      .toThrow("Job is invalid.");
  });
});

describe("rescheduleJobForManager atomicity", () => {
  const jobPath = "organizations/cleanflow-demo/jobs/job";
  const job = {
    operationalStatus: "ASSIGNED",
    scheduledDate: "2026-10-01",
    scheduledStart: "10:00",
    checklistContextRevision: 4,
    scheduleRevision: 2,
  };
  const request = {
    organizationId: "cleanflow-demo",
    jobId: "job",
    scheduledDate: "2026-10-02",
    scheduledStart: "11:00",
    actorUid: "manager-uid",
  };

  it("leaves both Job and history unchanged if the transaction commit fails", async () => {
    const { database, records } = fakeDatabase({
      initialRecords: { [jobPath]: job },
      failCommit: true,
    });
    const beforeJob = structuredClone(records.get(jobPath));

    await expect(rescheduleJobForManager(database, request)).rejects.toThrow("synthetic transaction commit failure");
    expect(records.get(jobPath)).toEqual(beforeJob);
    expect(records.has(`${jobPath}/scheduleHistory/3`)).toBe(false);
  });

  it("increments both revisions once per actual change, including a return to an earlier schedule", async () => {
    const { database, records } = fakeDatabase({ initialRecords: { [jobPath]: job } });
    await rescheduleJobForManager(database, request);
    await rescheduleJobForManager(database, { ...request, scheduledDate: "2026-10-01", scheduledStart: "10:00" });
    const updatedJob = records.get(jobPath);

    expect(updatedJob).toMatchObject({
      scheduledDate: "2026-10-01",
      scheduledStart: "10:00",
      scheduleRevision: 4,
      checklistContextRevision: 6,
    });
    expect(records.get(`${jobPath}/scheduleHistory/3`)).toMatchObject({
      previousScheduledDate: "2026-10-01",
      newScheduledDate: "2026-10-02",
      actorUid: "manager-uid",
    });
    expect(records.get(`${jobPath}/scheduleHistory/4`)).toMatchObject({
      previousScheduledDate: "2026-10-02",
      newScheduledDate: "2026-10-01",
      actorUid: "manager-uid",
    });
  });

  it("treats missing legacy revisions as zero and returns an unchanged retry without another record", async () => {
    const { database, records } = fakeDatabase({
      initialRecords: { [jobPath]: { operationalStatus: "UNASSIGNED", scheduledDate: "2026-10-01" } },
    });
    const first = await rescheduleJobForManager(database, { ...request, scheduledStart: "" });
    const retry = await rescheduleJobForManager(database, { ...request, scheduledStart: "" });

    expect(first).toMatchObject({ changed: true, scheduleRevision: 1, checklistContextRevision: 1 });
    expect(retry).toMatchObject({ changed: false, scheduleRevision: 1, checklistContextRevision: 1 });
    expect(records.has(`${jobPath}/scheduleHistory/1`)).toBe(true);
    expect(records.has(`${jobPath}/scheduleHistory/2`)).toBe(false);
  });

  it("fails closed on malformed revision state without scheduling writes", async () => {
    const { database, records } = fakeDatabase({
      initialRecords: { [jobPath]: { ...job, scheduleRevision: -1 } },
    });
    const beforeJob = structuredClone(records.get(jobPath));
    await expect(rescheduleJobForManager(database, request)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(records.get(jobPath)).toEqual(beforeJob);
    expect(records.has(`${jobPath}/scheduleHistory/3`)).toBe(false);
  });
});
