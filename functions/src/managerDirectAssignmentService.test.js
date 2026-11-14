import { describe, expect, it } from "vitest";
import {
  assignCleanerDirectlyForManager,
  buildManagerDirectAssignmentData,
  removeAutomaticCleanerAssignmentForManager,
} from "./managerDirectAssignmentService.js";

const organizationId = "cleanflow-demo";
const jobPath = `organizations/${organizationId}/jobs/job-a`;
const cleanerPath = `organizations/${organizationId}/cleaners/cleaner-a`;
const memberPath = `organizations/${organizationId}/members/manager-a`;
const offerPath = `${jobPath}/offers/offer-a`;
const assignmentPath = `${jobPath}/assignments/assignment-existing`;

const baseJob = {
  schemaVersion: 2,
  operationalStatus: "UNASSIGNED",
  assignedCleanerIds: [],
  propertyId: "property-a",
  propertyName: "Sample Property",
  scheduledDate: "2026-10-03",
  scheduledStart: "11:00",
  checklistContextRevision: 4,
};

function fakeDatabase(initialRecords, { failCommit = false } = {}) {
  const records = new Map(Object.entries(initialRecords).map(([path, data]) => [path, structuredClone(data)]));
  const writes = [];
  let nextId = 1;
  const reference = (path) => ({
    path,
    id: path.split("/").at(-1),
    collection(name) { return reference(`${path}/${name}`); },
    doc(id) { return reference(`${path}/${id || `assignment-new-${nextId++}`}`); },
    where(field, operator, value) {
      return { path, field, operator, value, limit: (max) => ({ path, field, operator, value, max }) };
    },
  });
  const database = {
    doc: reference,
    async runTransaction(callback) {
      const pending = [];
      const transaction = {
        async get(ref) {
          if (ref.field) {
            const docs = [...records.entries()]
              .filter(([path, data]) => path.startsWith(`${ref.path}/`)
                && path.split("/").length === ref.path.split("/").length + 1
                && ref.operator === "=="
                && data[ref.field] === ref.value)
              .slice(0, ref.max)
              .map(([path, data]) => ({ id: path.split("/").at(-1), data: () => structuredClone(data) }));
            return { docs };
          }
          const data = records.get(ref.path);
          return { exists: data !== undefined, data: () => data && structuredClone(data) };
        },
        create(ref, data) { pending.push({ type: "create", path: ref.path, data }); },
        update(ref, data) { pending.push({ type: "update", path: ref.path, data }); },
      };
      const result = await callback(transaction);
      if (failCommit) throw new Error("synthetic transaction commit failure");
      for (const write of pending) {
        writes.push(write);
        if (write.type === "create") {
          if (records.has(write.path)) throw new Error("already exists");
          records.set(write.path, write.data);
        } else {
          records.set(write.path, { ...records.get(write.path), ...write.data });
        }
      }
      return result;
    },
  };
  return { database, records, writes };
}

function fixtures({ job = baseJob, cleaner = { name: "Sample Cleaner", active: true },
  member = { role: "MANAGER", active: true }, extra = {} } = {}) {
  return {
    [jobPath]: job,
    [cleanerPath]: cleaner,
    [memberPath]: member,
    ...extra,
  };
}

const request = { organizationId, jobId: "job-a", cleanerId: "cleaner-a", actorUid: "manager-a" };

async function rejectedWithoutWrite(records, reason) {
  const { database, writes } = fakeDatabase(records);
  await expect(assignCleanerDirectlyForManager(database, request)).rejects.toMatchObject({
    code: "failed-precondition",
    details: { reason },
  });
  expect(writes).toHaveLength(0);
}

describe("manager direct Assignment", () => {
  it.each(["UNASSIGNED", "OFFERED"])("assigns an active Cleaner to a %s v2 Job with no Offer", async (status) => {
    const { database, records, writes } = fakeDatabase(fixtures({
      job: { ...baseJob, operationalStatus: status },
    }));

    const result = await assignCleanerDirectlyForManager(database, request);
    const assignment = records.get(`${jobPath}/assignments/${result.assignmentId}`);
    expect(result).toMatchObject({
      jobId: "job-a",
      cleanerId: "cleaner-a",
      assignedCleanerIds: ["cleaner-a"],
      operationalStatus: "ASSIGNED",
      checklistContextRevision: 5,
    });
    expect(records.get(jobPath)).toMatchObject({
      operationalStatus: "ASSIGNED",
      assignedCleanerIds: ["cleaner-a"],
      checklistContextRevision: 5,
    });
    expect(assignment).toMatchObject({
      schemaVersion: 1,
      organizationId,
      jobId: "job-a",
      cleanerId: "cleaner-a",
      cleanerNameSnapshot: "Sample Cleaner",
      source: "MANAGER_DIRECT",
      assignedByUid: "manager-a",
      isActive: true,
      executionStatus: "ASSIGNED",
      propertyId: "property-a",
      propertyName: "Sample Property",
      scheduledDate: "2026-10-03",
      scheduledStart: "11:00",
    });
    expect(assignment).toHaveProperty("assignedAt");
    expect(assignment).not.toHaveProperty("sourceOfferId");
    expect(assignment).not.toHaveProperty("cleanerAcknowledgedAt");
    expect(assignment).not.toHaveProperty("payoutPaidAt");
    expect([...records.keys()].some((path) => path.includes("/offers/"))).toBe(false);
    expect(writes.map((write) => write.path)).toEqual([
      `${jobPath}/assignments/${result.assignmentId}`,
      jobPath,
    ]);
  });

  it("adds a second active Cleaner without a capacity gate or changing pending/interested Offers", async () => {
    const existingAssignment = {
      organizationId,
      jobId: "job-a",
      cleanerId: "cleaner-b",
      isActive: true,
    };
    const offer = { cleanerId: "cleaner-c", status: "INTERESTED" };
    const { database, records } = fakeDatabase(fixtures({
      job: { ...baseJob, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-b"] },
      extra: {
        [assignmentPath]: existingAssignment,
        [offerPath]: offer,
        [`${jobPath}/offers/offer-pending`]: { cleanerId: "cleaner-a", status: "PENDING" },
      },
    }));

    await assignCleanerDirectlyForManager(database, request);
    expect(records.get(jobPath).assignedCleanerIds).toEqual(["cleaner-b", "cleaner-a"]);
    expect(records.get(assignmentPath)).toEqual(existingAssignment);
    expect(records.get(offerPath)).toEqual(offer);
    expect(records.get(`${jobPath}/offers/offer-pending`)).toEqual({
      cleanerId: "cleaner-a", status: "PENDING",
    });
  });

  it("requires active manager membership and an active, unarchived Cleaner", async () => {
    const unauthorized = fakeDatabase(fixtures({ member: { role: "MANAGER", active: false } }));
    await expect(assignCleanerDirectlyForManager(unauthorized.database, request)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(unauthorized.writes).toHaveLength(0);
    const noMember = fakeDatabase(fixtures());
    noMember.records.delete(memberPath);
    await expect(assignCleanerDirectlyForManager(noMember.database, request)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(noMember.writes).toHaveLength(0);
    await rejectedWithoutWrite(fixtures({ cleaner: { name: "Sample Cleaner", active: false } }), "cleaner-inactive");
    await rejectedWithoutWrite(fixtures({ cleaner: { name: "Sample Cleaner", active: true, archivedAt: "archive" } }), "cleaner-inactive");
  });

  it.each(["IN_PROGRESS", "COMPLETED"])("rejects a %s Job", async (status) => {
    await rejectedWithoutWrite(fixtures({ job: { ...baseJob, operationalStatus: status } }), "job-ineligible");
  });

  it("rejects archived and legacy Jobs", async () => {
    await rejectedWithoutWrite(fixtures({ job: { ...baseJob, archivedAt: "archive" } }), "job-ineligible");
    await rejectedWithoutWrite(fixtures({ job: { ...baseJob, schemaVersion: 1 } }), "job-ineligible");
  });

  it("rejects a Cleaner already actively assigned and an inconsistent roster", async () => {
    const existing = {
      organizationId, jobId: "job-a", cleanerId: "cleaner-a", isActive: true,
    };
    await rejectedWithoutWrite(fixtures({
      job: { ...baseJob, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"] },
      extra: { [assignmentPath]: existing },
    }), "cleaner-already-assigned");
    await rejectedWithoutWrite(fixtures({
      job: { ...baseJob, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-b"] },
    }), "assignment-mismatch");
  });

  it("keeps the Job and Assignment unchanged if the transaction commit fails", async () => {
    const { database, records, writes } = fakeDatabase(fixtures(), { failCommit: true });
    await expect(assignCleanerDirectlyForManager(database, request))
      .rejects.toThrow("synthetic transaction commit failure");
    expect(records.get(jobPath)).toEqual(baseJob);
    expect([...records.keys()].some((path) => path.includes("/assignments/"))).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("rejects malformed identifiers before any database access", async () => {
    const { database, writes } = fakeDatabase(fixtures());
    await expect(assignCleanerDirectlyForManager(database, { ...request, cleanerId: "../other" }))
      .rejects.toMatchObject({ code: "invalid-argument" });
    await expect(assignCleanerDirectlyForManager(database, { ...request, actorUid: "" }))
      .rejects.toMatchObject({ code: "unauthenticated" });
    expect(writes).toHaveLength(0);
  });

  it("builds the direct Assignment without an Offer, acknowledgment, or payment state", () => {
    const assignment = buildManagerDirectAssignmentData(baseJob, {
      ...request, cleanerName: "Sample Cleaner",
    });
    expect(assignment.source).toBe("MANAGER_DIRECT");
    expect(assignment).not.toHaveProperty("sourceOfferId");
    expect(assignment).not.toHaveProperty("cleanerAcknowledgedOfferId");
    expect(assignment).not.toHaveProperty("payoutId");
  });
});

describe("manager removal from a versioned automatic roster", () => {
  const secondAssignmentPath = `${jobPath}/assignments/assignment-second`;
  const removal = { organizationId, jobId: "job-a", assignmentId: "assignment-existing", actorUid: "manager-a" };
  const batch = { version: 2, capacity: 2, openingContextRevision: 2, currentContextRevision: 4 };
  const assigned = {
    ...baseJob, organizationId, operationalStatus: "ASSIGNED",
    assignedCleanerIds: ["cleaner-a", "cleaner-b"], requiredCleanerCount: 2,
    offerDistributionMode: "FIRST_ACCEPT_WINS", automaticOfferBatch: batch,
  };
  const firstAssignment = {
    isActive: true, organizationId, jobId: "job-a", cleanerId: "cleaner-a", executionStatus: "ASSIGNED",
  };
  const secondAssignment = { ...firstAssignment, cleanerId: "cleaner-b" };
  const originalOffer = { status: "ACCEPTED", acceptedAssignmentId: "assignment-existing" };

  function removalFixtures({ job = assigned, assignment = firstAssignment,
    member = { role: "MANAGER", active: true }, extra = {} } = {}) {
    return fixtures({ job, member, extra: {
      [assignmentPath]: assignment,
      [secondAssignmentPath]: secondAssignment,
      [offerPath]: originalOffer,
      ...extra,
    } });
  }

  it("removes only the named Assignment and preserves the close marker and accepted Offer", async () => {
    const { database, records, writes } = fakeDatabase(removalFixtures({
      job: { ...assigned, offerDistributionClosedAt: "prior-close", checklistContextRevision: 5 },
    }));
    const result = await removeAutomaticCleanerAssignmentForManager(database, removal);
    expect(result).toEqual({
      jobId: "job-a", assignmentId: "assignment-existing",
      assignedCleanerIds: ["cleaner-b"], operationalStatus: "ASSIGNED", checklistContextRevision: 6,
    });
    expect(records.get(jobPath)).toMatchObject({
      assignedCleanerIds: ["cleaner-b"], offerDistributionClosedAt: "prior-close", automaticOfferBatch: batch,
    });
    expect(records.get(assignmentPath)).toMatchObject({ isActive: false, removedByUid: "manager-a" });
    expect(records.get(assignmentPath)).toHaveProperty("removedAt");
    expect(records.get(secondAssignmentPath)).toEqual(secondAssignment);
    expect(records.get(offerPath)).toEqual(originalOffer);
    expect(writes.map(write => write.path)).toEqual([assignmentPath, jobPath]);
    await expect(removeAutomaticCleanerAssignmentForManager(database, removal)).rejects.toMatchObject({
      details: { reason: "assignment-not-editable" },
    });
    expect(writes).toHaveLength(2);
  });

  it("closes a partially filled batch on last removal and returns the Job to UNASSIGNED", async () => {
    const { database, records } = fakeDatabase(fixtures({
      job: { ...assigned, assignedCleanerIds: ["cleaner-a"] },
      extra: {
        [assignmentPath]: firstAssignment, [offerPath]: originalOffer,
        [`${jobPath}/checklistRuns/initial`]: { status: "DRAFT" },
      },
    }));
    await expect(removeAutomaticCleanerAssignmentForManager(database, removal)).resolves.toMatchObject({
      assignedCleanerIds: [], operationalStatus: "UNASSIGNED", checklistContextRevision: 5,
    });
    expect(records.get(jobPath)).toHaveProperty("offerDistributionClosedAt");
    expect(records.get(offerPath)).toEqual(originalOffer);
  });

  it.each([
    ["a foreign Job", { job: { ...assigned, organizationId: "other-org" } }, "job-ineligible"],
    ["a manual Job", { job: { ...assigned, offerDistributionMode: null } }, "job-ineligible"],
    ["an unversioned automatic Job", { job: { ...assigned, automaticOfferBatch: null } }, "invalid-roster"],
    ["an archived Job", { job: { ...assigned, archivedAt: "archived" } }, "job-ineligible"],
    ["a started Job", { job: { ...assigned, startedAt: "started" } }, "job-ineligible"],
    ["an in-progress Job", { job: { ...assigned, operationalStatus: "IN_PROGRESS" } }, "job-ineligible"],
    ["an active foreign Assignment", { assignment: { ...firstAssignment, jobId: "other-job" } }, "assignment-mismatch"],
    ["a started Assignment", { assignment: { ...firstAssignment, executionStatus: "IN_PROGRESS" } }, "assignment-not-editable"],
    ["saved checklist answers", { extra: {
      [`${jobPath}/checklistRuns/initial`]: { status: "DRAFT" },
      [`${jobPath}/checklistRuns/initial/drafts/current`]: { revision: 1 },
    } }, "job-ineligible"],
    ["saved then removed checklist photos", { extra: {
      [`${jobPath}/checklistRuns/initial`]: { status: "DRAFT" },
      [`${jobPath}/checklistRuns/initial/evidenceState/current`]: { revision: 2, photos: [] },
    } }, "job-ineligible"],
    ["a saved legacy checklist photo", { extra: {
      [`${jobPath}/checklistRuns/initial`]: { status: "DRAFT" },
      [`${jobPath}/checklistRuns/initial/evidence/living-belongings`]: { status: "SAVED" },
    } }, "job-ineligible"],
    ["a checklist ready for review", { extra: {
      [`${jobPath}/checklistRuns/initial`]: { status: "READY_FOR_REVIEW" },
    } }, "job-ineligible"],
    ["a stale revision", { job: { ...assigned, checklistContextRevision: 3 } }, "invalid-revision"],
    ["an over-capacity roster", { extra: {
      [`${jobPath}/assignments/assignment-third`]: { ...firstAssignment, cleanerId: "cleaner-c" },
    } }, "assignment-mismatch"],
  ])("rejects %s without writes", async (_label, overrides, reason) => {
    const { database, writes } = fakeDatabase(removalFixtures(overrides));
    await expect(removeAutomaticCleanerAssignmentForManager(database, removal)).rejects.toMatchObject({
      code: "failed-precondition", details: { reason },
    });
    expect(writes).toHaveLength(0);
  });

  it("rejects a non-manager or non-matching Assignment and preserves state on failed commit", async () => {
    const unauthorized = fakeDatabase(removalFixtures({ member: { role: "CLEANER", active: true } }));
    await expect(removeAutomaticCleanerAssignmentForManager(unauthorized.database, removal)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(unauthorized.writes).toHaveLength(0);

    const mismatch = fakeDatabase(removalFixtures());
    await expect(removeAutomaticCleanerAssignmentForManager(mismatch.database, {
      ...removal, assignmentId: "stale-id",
    })).rejects.toMatchObject({ details: { reason: "assignment-not-editable" } });
    expect(mismatch.writes).toHaveLength(0);

    const failed = fakeDatabase(removalFixtures(), { failCommit: true });
    await expect(removeAutomaticCleanerAssignmentForManager(failed.database, removal))
      .rejects.toThrow("synthetic transaction commit failure");
    expect(failed.records.get(jobPath)).toEqual(assigned);
    expect(failed.records.get(assignmentPath)).toEqual(firstAssignment);
    expect(failed.writes).toHaveLength(0);
  });
});
