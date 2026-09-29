import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { checklistCapabilityState } from "./checklistCapabilityService.js";
import { createChecklistRunForManager, projectChecklistRunForManager } from "./checklistRunService.js";
import {
  abandonChecklistRunAndCompleteJobForManager,
  completeJobWithoutChecklistForManager,
} from "./jobCompletionService.js";

const organizationId = "cleanflow-demo";
const jobId = "job-a";
const jobPath = `organizations/${organizationId}/jobs/${jobId}`;
const runPath = `${jobPath}/checklistRuns/initial`;
const capabilityPath = `${runPath}/checklistCapabilities/active`;
const draftPath = `${runPath}/drafts/current`;
const evidencePath = `${runPath}/evidence/living-belongings`;
const mutationPath = `${runPath}/draftMutations/mutation-a`;
const assignmentPath = `${jobPath}/assignments/assignment-a`;
const propertyPath = `organizations/${organizationId}/properties/property-a`;
const request = { organizationId, jobId };
const abandonRequest = { ...request, actorUid: "manager-a" };

function fakeDatabase({ initialRecords = {}, failCommit = false } = {}) {
  const records = new Map(Object.entries(initialRecords).map(([path, data]) => [path, structuredClone(data)]));
  const writes = [];
  const reference = (path) => ({
    path,
    collection(name) { return reference(`${path}/${name}`); },
    doc(id) { return reference(`${path}/${id}`); },
  });

  return {
    records,
    writes,
    database: {
      doc: reference,
      async runTransaction(callback) {
        const pending = [];
        const result = await callback({
          async get(ref) {
            const data = records.get(ref.path);
            return {
              id: ref.path.split("/").at(-1),
              exists: data !== undefined,
              data: () => data && structuredClone(data),
            };
          },
          create(ref, data) {
            pending.push({ type: "create", path: ref.path, data });
          },
          update(ref, data) {
            pending.push({ type: "update", path: ref.path, data });
          },
        });
        if (failCommit) throw new Error("synthetic transaction commit failure");
        for (const write of pending) {
          writes.push(write);
          records.set(write.path, write.type === "create"
            ? { ...write.data }
            : { ...records.get(write.path), ...write.data });
        }
        return result;
      },
    },
  };
}

const assignedJob = {
  operationalStatus: "ASSIGNED",
  assignedCleanerIds: ["cleaner-a"],
  checklistContextRevision: 3,
  payoutStatus: "UNPAID",
  paymentStatus: "UNPAID",
  cleanerPayout: 100,
};
const draftRun = {
  organizationId,
  jobId,
  status: "DRAFT",
  createdByUid: "manager-a",
  resolvedDefinition: { sections: [], inventoryItems: [], requiredPhotoTypes: [] },
  propertySnapshot: { propertyName: "Fictional Property" },
};

describe("completeJobWithoutChecklistForManager", () => {
  it.each(["ASSIGNED", "IN_PROGRESS"])("completes a %s Job without creating a Run or report", async (status) => {
    const assignment = { cleanerId: "cleaner-a", isActive: true, status: "ASSIGNED" };
    const { database, records, writes } = fakeDatabase({
      initialRecords: {
        [jobPath]: { ...assignedJob, operationalStatus: status },
        [assignmentPath]: assignment,
      },
    });

    await expect(completeJobWithoutChecklistForManager(database, request)).resolves.toEqual({
      completed: true,
      operationalStatus: "COMPLETED",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(jobPath);
    expect(Object.keys(writes[0].data).sort()).toEqual([
      "checklistContextRevision", "completedAt", "operationalStatus",
    ]);
    expect(records.get(jobPath)).toMatchObject({
      operationalStatus: "COMPLETED",
      checklistContextRevision: 4,
      assignedCleanerIds: ["cleaner-a"],
      payoutStatus: "UNPAID",
      paymentStatus: "UNPAID",
      cleanerPayout: 100,
    });
    expect(records.get(jobPath).completedAt).toBeInstanceOf(FieldValue);
    expect(records.get(assignmentPath)).toEqual(assignment);
    expect(records.has(runPath)).toBe(false);
    expect([...records.keys()].some((path) => path.includes("clientReportCapabilities"))).toBe(false);
  });

  it.each(["DRAFT", "READY_FOR_REVIEW", "ABANDONED", "VOID"])("blocks bypass when an initial %s Run exists", async (runStatus) => {
    const job = { ...assignedJob };
    const run = { status: runStatus };
    const { database, records, writes } = fakeDatabase({
      initialRecords: { [jobPath]: job, [runPath]: run },
    });

    await expect(completeJobWithoutChecklistForManager(database, request)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "checklist-run-exists" },
    });
    expect(writes).toEqual([]);
    expect(records.get(jobPath)).toEqual(job);
    expect(records.get(runPath)).toEqual(run);
  });

  it("does not complete an archived Job", async () => {
    const { database, writes } = fakeDatabase({
      initialRecords: { [jobPath]: { ...assignedJob, archivedAt: "2026-09-29T10:00:00Z" } },
    });
    await expect(completeJobWithoutChecklistForManager(database, request)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "archived" },
    });
    expect(writes).toEqual([]);
  });

  it.each(["UNASSIGNED", "OFFERED"])("rejects an ineligible %s Job", async (status) => {
    const { database, writes } = fakeDatabase({
      initialRecords: { [jobPath]: { ...assignedJob, operationalStatus: status } },
    });
    await expect(completeJobWithoutChecklistForManager(database, request)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "status" },
    });
    expect(writes).toEqual([]);
  });

  it("returns an idempotent retry without changing the first completion timestamp", async () => {
    const { database, records, writes } = fakeDatabase({ initialRecords: { [jobPath]: assignedJob } });
    await completeJobWithoutChecklistForManager(database, request);
    const firstTimestamp = records.get(jobPath).completedAt;

    await expect(completeJobWithoutChecklistForManager(database, request)).resolves.toEqual({
      completed: false,
      operationalStatus: "COMPLETED",
    });
    expect(writes).toHaveLength(1);
    expect(records.get(jobPath).completedAt).toBe(firstTimestamp);
    expect(records.get(jobPath).checklistContextRevision).toBe(4);
  });

  it("leaves the Job unchanged if the transaction commit fails", async () => {
    const { database, records, writes } = fakeDatabase({
      initialRecords: { [jobPath]: assignedJob },
      failCommit: true,
    });
    await expect(completeJobWithoutChecklistForManager(database, request))
      .rejects.toThrow("synthetic transaction commit failure");
    expect(records.get(jobPath)).toEqual(assignedJob);
    expect(writes).toEqual([]);
  });

  it.each([-1, null, "3", Number.MAX_SAFE_INTEGER])("does not reset an invalid revision %s", async (revision) => {
    const job = { ...assignedJob, checklistContextRevision: revision };
    const { database, records, writes } = fakeDatabase({ initialRecords: { [jobPath]: job } });
    await expect(completeJobWithoutChecklistForManager(database, request))
      .rejects.toMatchObject({ code: "failed-precondition", details: { reason: "revision" } });
    expect(records.get(jobPath)).toEqual(job);
    expect(writes).toEqual([]);
  });

  it("treats a missing revision as zero", async () => {
    const { checklistContextRevision: _missing, ...job } = assignedJob;
    const { database, records } = fakeDatabase({ initialRecords: { [jobPath]: job } });
    await completeJobWithoutChecklistForManager(database, request);
    expect(records.get(jobPath).checklistContextRevision).toBe(1);
  });

  it("rejects a missing Job and malformed path identifiers", async () => {
    const { database, writes } = fakeDatabase();
    await expect(completeJobWithoutChecklistForManager(database, request))
      .rejects.toMatchObject({ code: "not-found" });
    await expect(completeJobWithoutChecklistForManager(database, { ...request, jobId: "../other" }))
      .rejects.toMatchObject({ code: "invalid-argument" });
    expect(writes).toEqual([]);
  });
});

describe("abandonChecklistRunAndCompleteJobForManager", () => {
  it("projects the terminal status and date for manager review without discarding the frozen Run", () => {
    const abandonedAt = Timestamp.fromDate(new Date("2026-09-29T12:00:00Z"));
    const managerRun = projectChecklistRunForManager({
      ...draftRun, status: "ABANDONED", abandonedAt,
    });
    expect(managerRun).toMatchObject({
      status: "ABANDONED",
      abandonedAt: "2026-09-29T12:00:00.000Z",
      property: { name: "Fictional Property" },
    });
  });

  it.each(["ASSIGNED", "IN_PROGRESS"])("atomically abandons a DRAFT Run and completes a %s Job", async (status) => {
    const assignment = { cleanerId: "cleaner-a", isActive: true, status: "ASSIGNED", payoutStatus: "UNPAID" };
    const draft = { revision: 2, generalNotes: "Saved draft", checklistAnswers: {} };
    const evidence = { status: "SAVED", storagePath: "private/synthetic-photo.jpg" };
    const receipt = { mutationId: "mutation-a", revision: 2 };
    const capability = { status: "ACTIVE", tokenHash: "hash-only", cleanerId: "cleaner-a", contextRevision: 3 };
    const { database, records, writes } = fakeDatabase({
      initialRecords: {
        [jobPath]: { ...assignedJob, operationalStatus: status },
        [runPath]: draftRun,
        [capabilityPath]: capability,
        [draftPath]: draft,
        [evidencePath]: evidence,
        [mutationPath]: receipt,
        [assignmentPath]: assignment,
      },
    });

    await expect(abandonChecklistRunAndCompleteJobForManager(database, abandonRequest)).resolves.toEqual({
      completed: true,
      operationalStatus: "COMPLETED",
    });

    expect(writes.map(({ path }) => path)).toEqual([runPath, capabilityPath, jobPath]);
    expect(Object.keys(writes[0].data).sort()).toEqual([
      "abandonReason", "abandonedAt", "abandonedByUid", "status",
    ]);
    expect(Object.keys(writes[1].data).sort()).toEqual(["revokedAt", "revokedByUid", "status"]);
    expect(Object.keys(writes[2].data).sort()).toEqual([
      "checklistContextRevision", "completedAt", "operationalStatus",
    ]);
    expect(records.get(runPath)).toMatchObject({
      ...draftRun,
      status: "ABANDONED",
      abandonedByUid: "manager-a",
      abandonReason: "MANAGER_COMPLETED_WITHOUT_CHECKLIST",
    });
    expect(records.get(runPath).abandonedAt).toBeInstanceOf(FieldValue);
    expect(records.get(capabilityPath)).toMatchObject({
      ...capability, status: "REVOKED", revokedByUid: "manager-a",
    });
    expect(checklistCapabilityState(records.get(capabilityPath), records.get(jobPath), records.get(runPath)))
      .toBe("REVOKED");
    expect(records.get(jobPath)).toMatchObject({
      operationalStatus: "COMPLETED",
      checklistContextRevision: 4,
      payoutStatus: "UNPAID",
      paymentStatus: "UNPAID",
      cleanerPayout: 100,
    });
    expect(records.get(jobPath).completedAt).toBeInstanceOf(FieldValue);
    expect(records.get(assignmentPath)).toEqual(assignment);
    expect(records.get(draftPath)).toEqual(draft);
    expect(records.get(evidencePath)).toEqual(evidence);
    expect(records.get(mutationPath)).toEqual(receipt);
    expect([...records.keys()].some((path) => path.includes("clientReportCapabilities"))).toBe(false);
  });

  it("completes a Draft Run with no capability without creating a token record", async () => {
    const { database, records, writes } = fakeDatabase({
      initialRecords: { [jobPath]: assignedJob, [runPath]: draftRun },
    });
    await abandonChecklistRunAndCompleteJobForManager(database, abandonRequest);
    expect(writes.map(({ path }) => path)).toEqual([runPath, jobPath]);
    expect(records.has(capabilityPath)).toBe(false);
  });

  it("returns an exact same-manager retry without changing timestamps or revision", async () => {
    const { database, records, writes } = fakeDatabase({
      initialRecords: { [jobPath]: assignedJob, [runPath]: draftRun },
    });
    await abandonChecklistRunAndCompleteJobForManager(database, abandonRequest);
    const firstJobTimestamp = records.get(jobPath).completedAt;
    const firstRunTimestamp = records.get(runPath).abandonedAt;

    await expect(abandonChecklistRunAndCompleteJobForManager(database, abandonRequest)).resolves.toEqual({
      completed: false,
      operationalStatus: "COMPLETED",
    });
    expect(writes).toHaveLength(2);
    expect(records.get(jobPath).completedAt).toBe(firstJobTimestamp);
    expect(records.get(runPath).abandonedAt).toBe(firstRunTimestamp);
    expect(records.get(jobPath).checklistContextRevision).toBe(4);

    await expect(abandonChecklistRunAndCompleteJobForManager(database, {
      ...abandonRequest, actorUid: "manager-b",
    })).rejects.toMatchObject({ code: "failed-precondition", details: { reason: "already-completed" } });
    expect(writes).toHaveLength(2);
  });

  it.each(["READY_FOR_REVIEW", "ABANDONED", "VOID"])("refuses a %s Run", async (status) => {
    const run = { ...draftRun, status };
    const { database, records, writes } = fakeDatabase({
      initialRecords: { [jobPath]: assignedJob, [runPath]: run },
    });
    await expect(abandonChecklistRunAndCompleteJobForManager(database, abandonRequest))
      .rejects.toMatchObject({ code: "failed-precondition", details: { reason: "checklist-run-status" } });
    expect(records.get(jobPath)).toEqual(assignedJob);
    expect(records.get(runPath)).toEqual(run);
    expect(writes).toEqual([]);
  });

  it.each(["UNASSIGNED", "OFFERED"])("refuses an ineligible %s Job", async (status) => {
    const { database, writes } = fakeDatabase({
      initialRecords: { [jobPath]: { ...assignedJob, operationalStatus: status }, [runPath]: draftRun },
    });
    await expect(abandonChecklistRunAndCompleteJobForManager(database, abandonRequest))
      .rejects.toMatchObject({ code: "failed-precondition", details: { reason: "status" } });
    expect(writes).toEqual([]);
  });

  it("refuses an archived Job, a missing Run, or a Job completed through another path", async () => {
    for (const initialRecords of [
      { [jobPath]: { ...assignedJob, archivedAt: "2026-09-29T10:00:00Z" }, [runPath]: draftRun },
      { [jobPath]: assignedJob },
      { [jobPath]: { ...assignedJob, operationalStatus: "COMPLETED", completedAt: "earlier" }, [runPath]: draftRun },
    ]) {
      const { database, writes } = fakeDatabase({ initialRecords });
      await expect(abandonChecklistRunAndCompleteJobForManager(database, abandonRequest))
        .rejects.toMatchObject({ code: "failed-precondition" });
      expect(writes).toEqual([]);
    }
  });

  it.each([-1, null, "3", Number.MAX_SAFE_INTEGER])("rejects invalid revision %s without writes", async (revision) => {
    const { database, writes } = fakeDatabase({
      initialRecords: { [jobPath]: { ...assignedJob, checklistContextRevision: revision }, [runPath]: draftRun },
    });
    await expect(abandonChecklistRunAndCompleteJobForManager(database, abandonRequest))
      .rejects.toMatchObject({ code: "failed-precondition", details: { reason: "revision" } });
    expect(writes).toEqual([]);
  });

  it("treats a missing revision as zero", async () => {
    const { checklistContextRevision: _missing, ...job } = assignedJob;
    const { database, records } = fakeDatabase({ initialRecords: { [jobPath]: job, [runPath]: draftRun } });
    await abandonChecklistRunAndCompleteJobForManager(database, abandonRequest);
    expect(records.get(jobPath).checklistContextRevision).toBe(1);
  });

  it("preserves every record if the transaction commit fails", async () => {
    const capability = { status: "ACTIVE", tokenHash: "hash-only" };
    const { database, records, writes } = fakeDatabase({
      initialRecords: { [jobPath]: assignedJob, [runPath]: draftRun, [capabilityPath]: capability },
      failCommit: true,
    });
    await expect(abandonChecklistRunAndCompleteJobForManager(database, abandonRequest))
      .rejects.toThrow("synthetic transaction commit failure");
    expect(records.get(jobPath)).toEqual(assignedJob);
    expect(records.get(runPath)).toEqual(draftRun);
    expect(records.get(capabilityPath)).toEqual(capability);
    expect(writes).toEqual([]);
  });

  it("rejects a missing Job or malformed path and actor identifiers", async () => {
    const { database, writes } = fakeDatabase();
    await expect(abandonChecklistRunAndCompleteJobForManager(database, abandonRequest))
      .rejects.toMatchObject({ code: "not-found" });
    for (const malformedRequest of [
      { ...abandonRequest, jobId: "../other" },
      { ...abandonRequest, actorUid: "" },
    ]) {
      await expect(abandonChecklistRunAndCompleteJobForManager(database, malformedRequest))
        .rejects.toMatchObject({ code: "invalid-argument" });
    }
    expect(writes).toEqual([]);
  });
});

describe("Checklist Run creation after direct completion", () => {
  it.each([
    ["completed", { ...assignedJob, operationalStatus: "COMPLETED" }],
    ["archived", { ...assignedJob, archivedAt: "2026-09-29T10:00:00Z" }],
  ])("does not start a new Run on a %s Job", async (_label, job) => {
    const { database, records, writes } = fakeDatabase({ initialRecords: { [jobPath]: job } });
    await expect(createChecklistRunForManager(database, { ...request, actorUid: "manager-a" }))
      .rejects.toMatchObject({ code: "failed-precondition" });
    expect(writes).toEqual([]);
    expect(records.has(runPath)).toBe(false);
  });

  it("still permits an intentional pre-start Run", async () => {
    const { database, records, writes } = fakeDatabase({
      initialRecords: {
        [jobPath]: { ...assignedJob, propertyId: "property-a", operationalStatus: "UNASSIGNED" },
        [propertyPath]: { name: "Fictional Property" },
      },
    });
    await expect(createChecklistRunForManager(database, { ...request, actorUid: "manager-a" }))
      .resolves.toMatchObject({ runId: "initial", created: true, status: "DRAFT" });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(runPath);
    expect(records.get(runPath)).toMatchObject({
      status: "DRAFT",
      createdByUid: "manager-a",
      propertySnapshot: { propertyName: "Fictional Property" },
    });
  });
});
