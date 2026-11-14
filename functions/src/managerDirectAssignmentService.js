import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import {
  automaticOfferBatch, checklistContextRevision, emptySingleOfferRoster, isAutomaticOfferJob,
  rosterMatchesActiveAssignments, validRosterId,
} from "./firstAcceptWins.js";

const eligibleStatuses = new Set(["UNASSIGNED", "OFFERED", "ASSIGNED"]);

function precondition(message, reason) {
  return new HttpsError("failed-precondition", message, { reason });
}

function assertRosterConsistent(job, activeAssignments, organizationId, jobId) {
  if (!Array.isArray(job.assignedCleanerIds)
    || job.assignedCleanerIds.some((id) => !validRosterId(id))
    || new Set(job.assignedCleanerIds).size !== job.assignedCleanerIds.length) {
    throw precondition("The Job roster needs manager review.", "invalid-roster");
  }

  if (!rosterMatchesActiveAssignments(job, activeAssignments, organizationId, jobId)) {
    throw precondition("The Job roster needs manager review.", "assignment-mismatch");
  }
  return new Set(job.assignedCleanerIds);
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
  if (![organizationId, jobId, cleanerId].every(validRosterId)) {
    throw new HttpsError("invalid-argument", "Job or Cleaner is invalid.");
  }
  if (!validRosterId(actorUid)) {
    throw new HttpsError("unauthenticated", "An authenticated manager is required.");
  }

  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const cleanerReference = database.doc(`organizations/${organizationId}/cleaners/${cleanerId}`);
  const memberReference = database.doc(`organizations/${organizationId}/members/${actorUid}`);
  const assignmentsReference = jobReference.collection("assignments");
  const activeAssignmentsQuery = assignmentsReference.where("isActive", "==", true);
  const newAssignmentReference = assignmentsReference.doc();

  return database.runTransaction(async (transaction) => {
    const [memberSnapshot, jobSnapshot, cleanerSnapshot] = await Promise.all([
      transaction.get(memberReference),
      transaction.get(jobReference),
      transaction.get(cleanerReference),
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

    const automatic = isAutomaticOfferJob(job);
    const isVersioned = automatic && Object.hasOwn(job, "automaticOfferBatch");
    const batch = isVersioned ? automaticOfferBatch(job) : null;
    if (isVersioned && (!batch || (job.assignedCleanerId != null && job.assignedCleanerId !== ""))) {
      throw precondition("The Job roster needs manager review.", "invalid-roster");
    }
    const assignmentsSnapshot = await transaction.get(isVersioned
      ? activeAssignmentsQuery.limit(batch.capacity + 1) : activeAssignmentsQuery);
    const activeAssignments = assignmentsSnapshot.docs.map((snapshot) => snapshot.data());
    const activeIds = assertRosterConsistent(job, activeAssignments, organizationId, jobId);
    if (activeIds.has(cleanerId)) {
      throw precondition("This Cleaner is already assigned.", "cleaner-already-assigned");
    }
    if (automatic && (isVersioned ? activeIds.size >= batch.capacity : !emptySingleOfferRoster(job))) {
      throw precondition(isVersioned ? "The Job has no available automatic offer spots."
        : "The Job's single opening is unavailable.", "job-ineligible");
    }
    const revision = checklistContextRevision(job);
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
      ...(automatic && !job.offerDistributionClosedAt ? { offerDistributionClosedAt: FieldValue.serverTimestamp() } : {}),
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
