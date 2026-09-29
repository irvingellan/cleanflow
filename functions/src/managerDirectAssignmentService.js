import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isActiveManagerMembership } from "./managerAuthorization.js";

const eligibleStatuses = new Set(["UNASSIGNED", "OFFERED", "ASSIGNED"]);

function validId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && value.trim() === value
    && value !== "."
    && value !== ".."
    && !value.includes("/");
}

function precondition(message, reason) {
  return new HttpsError("failed-precondition", message, { reason });
}

function contextRevision(job) {
  if (!Object.prototype.hasOwnProperty.call(job, "checklistContextRevision")) return 0;
  return Number.isSafeInteger(job.checklistContextRevision) && job.checklistContextRevision >= 0
    ? job.checklistContextRevision
    : null;
}

function assertRosterConsistent(job, activeAssignments, organizationId, jobId) {
  if (!Array.isArray(job.assignedCleanerIds)
    || job.assignedCleanerIds.some((id) => !validId(id))
    || new Set(job.assignedCleanerIds).size !== job.assignedCleanerIds.length) {
    throw precondition("The Job roster needs manager review.", "invalid-roster");
  }

  const activeCleanerIds = activeAssignments.map((assignment) => {
    if (assignment.isActive !== true
      || assignment.organizationId !== organizationId
      || assignment.jobId !== jobId
      || !validId(assignment.cleanerId)) {
      throw precondition("The Job roster needs manager review.", "assignment-mismatch");
    }
    return assignment.cleanerId;
  });
  const activeIds = new Set(activeCleanerIds);
  if (activeIds.size !== activeCleanerIds.length
    || activeIds.size !== job.assignedCleanerIds.length
    || job.assignedCleanerIds.some((id) => !activeIds.has(id))
    || (activeIds.size > 0) !== (job.operationalStatus === "ASSIGNED")) {
    throw precondition("The Job roster needs manager review.", "assignment-mismatch");
  }
  return activeIds;
}

export function buildManagerDirectAssignmentData(job, {
  organizationId,
  jobId,
  cleanerId,
  cleanerName,
  actorUid,
}) {
  const assignment = {
    schemaVersion: 1,
    organizationId,
    jobId,
    cleanerId,
    cleanerNameSnapshot: cleanerName,
    source: "MANAGER_DIRECT",
    isActive: true,
    executionStatus: "ASSIGNED",
    propertyId: job.propertyId || "",
    propertyName: job.propertyName || "",
    scheduledDate: job.scheduledDate || "",
    assignedByUid: actorUid,
    createdAt: FieldValue.serverTimestamp(),
    assignedAt: FieldValue.serverTimestamp(),
  };
  if (job.scheduledStart) assignment.scheduledStart = job.scheduledStart;
  return assignment;
}

/** A manager's explicit selection creates one Assignment without changing Offers. */
export async function assignCleanerDirectlyForManager(database, {
  organizationId,
  jobId,
  cleanerId,
  actorUid,
}) {
  if (![organizationId, jobId, cleanerId].every(validId)) {
    throw new HttpsError("invalid-argument", "Job or Cleaner is invalid.");
  }
  if (!validId(actorUid)) {
    throw new HttpsError("unauthenticated", "An authenticated manager is required.");
  }

  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const cleanerReference = database.doc(`organizations/${organizationId}/cleaners/${cleanerId}`);
  const memberReference = database.doc(`organizations/${organizationId}/members/${actorUid}`);
  const assignmentsReference = jobReference.collection("assignments");
  const activeAssignmentsQuery = assignmentsReference.where("isActive", "==", true);
  const newAssignmentReference = assignmentsReference.doc();

  return database.runTransaction(async (transaction) => {
    const [memberSnapshot, jobSnapshot, cleanerSnapshot, assignmentsSnapshot] = await Promise.all([
      transaction.get(memberReference),
      transaction.get(jobReference),
      transaction.get(cleanerReference),
      transaction.get(activeAssignmentsQuery),
    ]);
    if (!isActiveManagerMembership(memberSnapshot.data())) {
      throw new HttpsError("permission-denied", "Active organization manager access is required.");
    }
    if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");
    const job = jobSnapshot.data();
    if (job.schemaVersion !== 2 || job.archivedAt || !eligibleStatuses.has(job.operationalStatus)) {
      throw precondition("This Job cannot receive a Cleaner assignment.", "job-ineligible");
    }
    if (!cleanerSnapshot.exists) throw new HttpsError("not-found", "Cleaner not found.");
    const cleaner = cleanerSnapshot.data();
    if (cleaner.active !== true || cleaner.archivedAt) {
      throw precondition("Only active Cleaners can be assigned.", "cleaner-inactive");
    }
    const cleanerName = typeof cleaner.name === "string" ? cleaner.name.trim() : "";
    if (!cleanerName) {
      throw precondition("Cleaner profile needs a name before assignment.", "cleaner-name-missing");
    }

    const activeAssignments = assignmentsSnapshot.docs.map((snapshot) => snapshot.data());
    const activeIds = assertRosterConsistent(job, activeAssignments, organizationId, jobId);
    if (activeIds.has(cleanerId)) {
      throw precondition("This Cleaner is already assigned.", "cleaner-already-assigned");
    }
    const revision = contextRevision(job);
    if (revision === null || revision >= Number.MAX_SAFE_INTEGER) {
      throw precondition("The Job context revision needs manager review.", "invalid-revision");
    }

    const assignedCleanerIds = [...job.assignedCleanerIds, cleanerId];
    transaction.create(newAssignmentReference, buildManagerDirectAssignmentData(job, {
      organizationId, jobId, cleanerId, cleanerName, actorUid,
    }));
    transaction.update(jobReference, {
      assignedCleanerIds,
      operationalStatus: "ASSIGNED",
      checklistContextRevision: revision + 1,
    });

    return {
      jobId,
      assignmentId: newAssignmentReference.id,
      cleanerId,
      assignedCleanerIds,
      operationalStatus: "ASSIGNED",
      checklistContextRevision: revision + 1,
    };
  });
}
