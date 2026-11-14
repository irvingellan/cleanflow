import { FieldValue } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { FIRST_ACCEPT_WINS } from "./firstAcceptWins.js";
import {
  isValidScheduledDate,
  normalizeRescheduleInput,
  rescheduleJobForManager,
} from "./jobScheduleService.js";

function copyRecord(record) {
  // Preserve Timestamp prototypes in fixture data.
  return { ...record };
}

function fakeDatabase({ initialRecords = {}, failCommit = false } = {}) {
  const records = new Map(Object.entries(initialRecords).map(([path, data]) => [path, copyRecord(data)]));
  const reference = (path) => ({
    path,
    id: path.split("/").at(-1),
    collection(name) {
      return reference(`${path}/${name}`);
    },
    doc(id) {
      return reference(`${path}/${id}`);
    },
    where(field, operator, value) {
      return { limit: max => ({ path, field, operator, value, max }) };
    },
  });
  const database = {
    doc: reference,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          if (ref.field) {
            const docs = [...records].filter(([path, data]) => (
              path.startsWith(`${ref.path}/`) && path.split("/").length === ref.path.split("/").length + 1
              && ref.operator === "==" && data[ref.field] === ref.value
            )).slice(0, ref.max).map(([path, data]) => ({
              id: path.split("/").at(-1), data: () => copyRecord(data),
            }));
            return { docs };
          }
          const data = records.get(ref.path);
          return {
            exists: Boolean(data),
            data: () => data && copyRecord(data),
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
          const saved = { ...records.get(write.path), ...write.data };
          for (const [key, value] of Object.entries(write.data)) {
            if (value?.isEqual?.(FieldValue.delete())) delete saved[key];
          }
          records.set(write.path, saved);
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

  const teamJob = {
    ...job, schemaVersion: 2, organizationId: "cleanflow-demo", assignedCleanerIds: ["cleaner-a"],
    requiredCleanerCount: 2, offerDistributionMode: FIRST_ACCEPT_WINS,
    automaticOfferBatch: { version: 2, capacity: 2, openingContextRevision: 3, currentContextRevision: 4 },
  };
  const assignmentPath = `${jobPath}/assignments/assignment-a`;
  const assignment = {
    organizationId: "cleanflow-demo", jobId: "job", isActive: true, cleanerId: "cleaner-a",
    assignmentMethod: FIRST_ACCEPT_WINS, executionStatus: "ASSIGNED", scheduledDate: job.scheduledDate,
  };

  it("freezes only current Assignment bindings and advances an open batch without rewriting history", async () => {
    const offerPath = `${jobPath}/offers/cleaner-b`;
    const offer = { offeredScheduledDate: job.scheduledDate, offeredChecklistContextRevision: 3 };
    const { database, records } = fakeDatabase({ initialRecords: {
      [jobPath]: teamJob, [assignmentPath]: assignment, [offerPath]: offer,
    } });

    const result = await rescheduleJobForManager(database, { ...request, expectedScheduleRevision: 2 });
    expect(result.scheduleConfirmation).toEqual({
      revision: 3, byCleaner: { "cleaner-a": { state: "PENDING", assignmentId: "assignment-a" } },
    });
    expect(records.get(jobPath).automaticOfferBatch).toEqual({ ...teamJob.automaticOfferBatch, currentContextRevision: 5 });
    expect(records.get(assignmentPath)).toEqual(assignment);
    expect(records.get(offerPath)).toEqual(offer);
  });

  it("keeps date rescheduling available but opens no actionable state for an inconsistent roster", async () => {
    const { database, records } = fakeDatabase({ initialRecords: {
      [jobPath]: teamJob, [assignmentPath]: { ...assignment, organizationId: "other" },
    } });
    const result = await rescheduleJobForManager(database, request);
    expect(result).not.toHaveProperty("scheduleConfirmation");
    expect(records.get(jobPath).automaticOfferBatch).toEqual(teamJob.automaticOfferBatch);
  });

  it("does not let a stale manager command overwrite a newer date", async () => {
    const { database, records } = fakeDatabase({ initialRecords: {
      [jobPath]: teamJob, [assignmentPath]: assignment,
    } });
    const first = await rescheduleJobForManager(database, { ...request, expectedScheduleRevision: 2 });
    await expect(rescheduleJobForManager(database, { ...request, expectedScheduleRevision: 2, scheduledStart: "14:00" }))
      .rejects.toMatchObject({ code: "failed-precondition", details: { reason: "stale-schedule" } });
    expect(await rescheduleJobForManager(database, { ...request, expectedScheduleRevision: 2 }))
      .toMatchObject({ changed: false, scheduleConfirmation: first.scheduleConfirmation });
    expect(records.get(jobPath).scheduledStart).toBe(request.scheduledStart);
  });

  it.each(["PENDING", "INTERESTED"])("only carries a pending replacement across reschedule (%s)", async (status) => {
    const offerId = "replacement-01234567890123456789";
    const current = { ...teamJob, offerDistributionClosedAt: true, manualReplacementOffer: {
      offerId, cleanerId: "cleaner-b", scheduleRevision: 2, issuedScheduleRevision: 2,
    } };
    const offerPath = `${jobPath}/offers/${offerId}`;
    const offer = {
      organizationId: request.organizationId, jobId: request.jobId, scheduleRevision: 2, cleanerId: "cleaner-b",
      offerKind: "MANUAL_REPLACEMENT", replacementOfferId: offerId, status, publicOfferExpiresAt: { toMillis: () => Date.UTC(2026, 10, 1) },
    };
    const { database, records } = fakeDatabase({ initialRecords: { [jobPath]: current, [assignmentPath]: assignment, [offerPath]: offer } });
    await rescheduleJobForManager(database, { ...request, now: () => new Date("2026-10-01T10:00Z") });
    expect(records.get(jobPath).manualReplacementOffer).toEqual(status === "PENDING"
      ? { ...current.manualReplacementOffer, scheduleRevision: 3 } : undefined);
    expect(records.get(jobPath).automaticOfferBatch).toEqual(teamJob.automaticOfferBatch);
    expect(records.get(offerPath)).toEqual(offer);
  });

});
