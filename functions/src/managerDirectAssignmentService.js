import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { pilotChecklistPhotoRequirementId } from "./checklistEvidenceDefinition.js";
import { initialChecklistRunId } from "./checklistRunService.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import { currentManualReplacementOffer, isManualReplacementOfferId } from "./managerManualReplacementOfferService.js";
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

/** A manager creates one Assignment, optionally confirming a signed-in replacement Offer. */
export async function assignCleanerDirectlyForManager(database, {
  organizationId,
  jobId,
  cleanerId,
  actorUid,
  replacementOfferId,
  now = () => new Date(),
}) {
  if (![organizationId, jobId, cleanerId].every(validRosterId)
    || (replacementOfferId !== undefined && !isManualReplacementOfferId(replacementOfferId))) {
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
    if (cleaner.active !== true || cleaner.archivedAt
      || (cleaner.organizationId != null && cleaner.organizationId !== organizationId)) {
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
    const replacementRef = replacementOfferId === undefined ? null : jobReference.collection("offers").doc(replacementOfferId);
    if (replacementRef) {
      const replacement = (await transaction.get(replacementRef)).data();
      const confirmed = assignmentsSnapshot.docs.find(snapshot => snapshot.id === replacement?.replacementAssignmentId);
      if (replacement?.status === "SELECTED" && replacement.organizationId === organizationId
        && replacement.jobId === jobId && replacement.cleanerId === cleanerId
        && confirmed?.data().replacementOfferId === replacementOfferId && confirmed.data().cleanerId === cleanerId) {
        return {
          jobId, assignmentId: confirmed.id, cleanerId, assignedCleanerIds: job.assignedCleanerIds,
          operationalStatus: job.operationalStatus, checklistContextRevision: checklistContextRevision(job),
        };
      }
      if (replacement?.status !== "INTERESTED" || replacement.cleanerId !== cleanerId || replacement.jobId !== jobId
        || job.organizationId !== organizationId
        || !currentManualReplacementOffer(job, replacement, replacementOfferId, now())) {
        throw precondition("This replacement offer is unavailable.", "replacement-unavailable");
      }
    }

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
    const nextAssignment = buildManagerDirectAssignmentData(job, { organizationId, jobId, cleanerId, cleanerName, actorUid });
    if (replacementRef) {
      nextAssignment.source = "OFFER";
      nextAssignment.sourceOfferId = replacementOfferId;
      nextAssignment.replacementOfferId = replacementOfferId;
      transaction.update(replacementRef, {
        status: "SELECTED", replacementAssignmentId: newAssignmentReference.id, selectedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.create(newAssignmentReference, nextAssignment);
    const replacementRecipient = job.manualReplacementOffer?.cleanerId;
    const retireReplacement = Boolean(job.manualReplacementOffer && (replacementRef
      || replacementRecipient === cleanerId || (batch && assignedCleanerIds.length >= batch.capacity)));
    transaction.update(jobReference, {
      assignedCleanerIds,
      operationalStatus: "ASSIGNED",
      checklistContextRevision: revision + 1,
      ...(automatic && !job.offerDistributionClosedAt ? { offerDistributionClosedAt: FieldValue.serverTimestamp() } : {}),
      ...(retireReplacement ? { manualReplacementOffer: FieldValue.delete() } : {}),
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

/** Remove exactly one active Assignment without reopening any invitations. */
export async function removeAutomaticCleanerAssignmentForManager(database, {
  organizationId,
  jobId,
  assignmentId,
  actorUid,
}) {
  if (![organizationId, jobId, assignmentId].every(validRosterId)) {
    throw new HttpsError("invalid-argument", "Job or Assignment is invalid.");
  }
  if (!validRosterId(actorUid)) {
    throw new HttpsError("unauthenticated", "An authenticated manager is required.");
  }

  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const memberReference = database.doc(`organizations/${organizationId}/members/${actorUid}`);
  const assignments = jobReference.collection("assignments");
  const assignmentReference = assignments.doc(assignmentId);
  const runReference = jobReference.collection("checklistRuns").doc(initialChecklistRunId);

  return database.runTransaction(async (transaction) => {
    const [memberSnapshot, jobSnapshot] = await Promise.all([
      transaction.get(memberReference),
      transaction.get(jobReference),
    ]);
    if (!isActiveManagerMembership(memberSnapshot.data())) {
      throw new HttpsError("permission-denied", "Active organization manager access is required.");
    }
    if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");
    const job = jobSnapshot.data();
    if (job.organizationId !== organizationId || job.schemaVersion !== 2 || job.archivedAt
      || job.operationalStatus !== "ASSIGNED" || job.startedAt != null || !isAutomaticOfferJob(job)) {
      throw precondition("This Job cannot change its automatic roster.", "job-ineligible");
    }
    const batch = automaticOfferBatch(job);
    if (!batch || (job.assignedCleanerId != null && job.assignedCleanerId !== "")) {
      throw precondition("The Job roster needs manager review.", "invalid-roster");
    }
    const revision = checklistContextRevision(job);
    if (revision === null || revision < batch.currentContextRevision || revision >= Number.MAX_SAFE_INTEGER) {
      throw precondition("The Job context revision needs manager review.", "invalid-revision");
    }

    // An empty DRAFT may have been prepared by a manager. A saved answer or
    // photo is work even while the Job remains ASSIGNED. Evidence revision also
    // preserves that distinction if every saved photo was subsequently removed.
    const [activeSnapshot, run, draft, evidence, legacyPhoto] = await Promise.all([
      transaction.get(assignments.where("isActive", "==", true).limit(batch.capacity + 1)),
      transaction.get(runReference),
      transaction.get(runReference.collection("drafts").doc("current")),
      transaction.get(runReference.collection("evidenceState").doc("current")),
      transaction.get(runReference.collection("evidence").doc(pilotChecklistPhotoRequirementId)),
    ]);
    if ((run.exists && run.data().status !== "DRAFT") || (draft.data()?.revision ?? 0) > 0
      || (evidence.data()?.revision ?? 0) > 0 || evidence.data()?.photos?.length > 0 || legacyPhoto.exists) {
      throw precondition("The checklist work has already started.", "job-ineligible");
    }
    const activeAssignments = activeSnapshot.docs.map((snapshot) => snapshot.data());
    if (activeAssignments.length > batch.capacity
      || !rosterMatchesActiveAssignments(job, activeAssignments, organizationId, jobId)) {
      throw precondition("The Job roster needs manager review.", "assignment-mismatch");
    }
    const assignment = activeSnapshot.docs.find((snapshot) => snapshot.id === assignmentId)?.data();
    if (!assignment || assignment.executionStatus !== "ASSIGNED") {
      throw precondition("This Assignment cannot be removed.", "assignment-not-editable");
    }

    const assignedCleanerIds = job.assignedCleanerIds.filter((cleanerId) => cleanerId !== assignment.cleanerId);
    const operationalStatus = assignedCleanerIds.length ? "ASSIGNED" : "UNASSIGNED";
    const removedAt = FieldValue.serverTimestamp();
    transaction.update(assignmentReference, { isActive: false, removedAt, removedByUid: actorUid });
    transaction.update(jobReference, {
      assignedCleanerIds,
      operationalStatus,
      checklistContextRevision: revision + 1,
      ...(!job.offerDistributionClosedAt ? { offerDistributionClosedAt: removedAt } : {}),
    });

    return { jobId, assignmentId, assignedCleanerIds, operationalStatus, checklistContextRevision: revision + 1 };
  });
}
