import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export const maximumRequiredCleanerCount = 4;

const rosterEditableStatuses = new Set(["OFFERED", "ASSIGNED"]);
const cleanerCountEditableStatuses = new Set(["UNASSIGNED", "OFFERED", "ASSIGNED"]);

function invalidJobId() {
  throw new HttpsError("invalid-argument", "Job is invalid.");
}

function validJobId(jobId) {
  return typeof jobId === "string" && jobId.trim().length > 0
    && jobId.trim().length <= 256 && !jobId.includes("/");
}

function requireJobId(jobId) {
  if (!validJobId(jobId)) invalidJobId();
  return jobId.trim();
}

function failedPrecondition(message, reason, details = {}) {
  return new HttpsError("failed-precondition", message, { reason, ...details });
}

function cleanId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function schemaVersion(job) {
  return Number.isInteger(job?.schemaVersion) && job.schemaVersion > 0
    ? job.schemaVersion
    : 0;
}

function isAssignmentAware(job) {
  return schemaVersion(job) >= 2;
}

export function getRequiredCleanerCount(job) {
  if (!isAssignmentAware(job)) return 1;
  if (!Object.prototype.hasOwnProperty.call(job || {}, "requiredCleanerCount")) return 1;
  const count = job.requiredCleanerCount;
  if (!Number.isSafeInteger(count) || count < 1 || count > maximumRequiredCleanerCount) {
    throw failedPrecondition("The required cleaner count is invalid and needs manager review.", "invalid-required-cleaner-count");
  }
  return count;
}

export function validateRequiredCleanerCount(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximumRequiredCleanerCount) {
    throw new HttpsError("invalid-argument", `Required cleaner count must be an integer from 1 to ${maximumRequiredCleanerCount}.`, {
      reason: "invalid-required-cleaner-count",
      maximum: maximumRequiredCleanerCount,
    });
  }
  return value;
}

function checklistContextRevision(job) {
  const revision = Object.prototype.hasOwnProperty.call(job || {}, "checklistContextRevision")
    ? job.checklistContextRevision
    : 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw failedPrecondition("The Job checklist context needs manager review before changing its cleaner roster.", "invalid-context-revision");
  }
  return revision;
}

function rosterIds(job) {
  return [...new Set((Array.isArray(job?.assignedCleanerIds) ? job.assignedCleanerIds : [])
    .map(cleanId)
    .filter(Boolean))];
}

function activeAssignments(snapshot) {
  return snapshot.docs
    .filter((document) => document.data().isActive === true)
    .map((document) => ({ ...document.data(), id: document.id }));
}

function assertAssignmentProjectionConsistent(job, assignments) {
  const assignmentIds = assignments.map((assignment) => cleanId(assignment.cleanerId));
  if (assignmentIds.some((id) => !id) || new Set(assignmentIds).size !== assignmentIds.length) {
    throw failedPrecondition("The active cleaner roster is inconsistent and needs manager review.", "assignment-roster-inconsistent");
  }
  const projectedIds = rosterIds(job);
  if (projectedIds.length !== assignmentIds.length
    || projectedIds.some((id) => !assignmentIds.includes(id))) {
    throw failedPrecondition("The active cleaner roster is inconsistent and needs manager review.", "assignment-roster-inconsistent");
  }
  return assignments.length;
}

function assertRosterEditable(job) {
  if (!isAssignmentAware(job)) {
    throw failedPrecondition("This Job uses the legacy single-cleaner workflow.", "legacy-job");
  }
  if (job.archivedAt || !rosterEditableStatuses.has(job.operationalStatus)) {
    throw failedPrecondition("Cleaner assignments cannot be changed after work starts.", "assignment-roster-locked");
  }
}

function assignmentCreateData({ organizationId, jobId, job, offer, sourceOfferId }) {
  const assignment = {
    schemaVersion: 1,
    organizationId,
    jobId,
    cleanerId: cleanId(offer.cleanerId),
    cleanerNameSnapshot: typeof offer.cleanerName === "string" ? offer.cleanerName : "",
    sourceOfferId,
    isActive: true,
    executionStatus: "ASSIGNED",
    propertyId: job.propertyId || "",
    propertyName: job.propertyName || "",
    scheduledDate: job.scheduledDate || "",
    createdAt: FieldValue.serverTimestamp(),
    assignedAt: FieldValue.serverTimestamp(),
  };
  if (job.scheduledStart) assignment.scheduledStart = job.scheduledStart;
  return assignment;
}

function actionableOfferExists(snapshot) {
  return snapshot.docs.some((document) => ["PENDING", "INTERESTED"].includes(document.data().status));
}

function assignmentMutationJobPatch(job, assignedCleanerIds, operationalStatus) {
  return {
    operationalStatus,
    assignedCleanerIds,
    checklistContextRevision: checklistContextRevision(job) + 1,
  };
}

export async function assignInterestedCleanerForManager(database, {
  organizationId,
  jobId,
  offerId,
}) {
  const normalizedJobId = requireJobId(jobId);
  if (typeof offerId !== "string" || !offerId.trim() || offerId.includes("/")) {
    throw new HttpsError("invalid-argument", "Offer is invalid.");
  }
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${normalizedJobId}`);
  const offerReference = jobReference.collection("offers").doc(offerId.trim());
  const assignmentsReference = jobReference.collection("assignments");
  const newAssignmentReference = assignmentsReference.doc();

  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, offerSnapshot, assignmentSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(offerReference),
      transaction.get(assignmentsReference),
    ]);
    if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");
    const job = jobSnapshot.data();
    assertRosterEditable(job);
    const assignments = activeAssignments(assignmentSnapshot);
    const assignedCount = assertAssignmentProjectionConsistent(job, assignments);
    const requiredCleanerCount = getRequiredCleanerCount(job);
    const offer = offerSnapshot.exists ? offerSnapshot.data() : null;
    const cleanerId = cleanId(offer?.cleanerId);
    if (offer?.status !== "INTERESTED" || !cleanerId) {
      throw failedPrecondition("Only an interested cleaner can be assigned.", "offer-not-interested");
    }

    const existingAssignment = assignments.find((assignment) => assignment.cleanerId === cleanerId);
    if (existingAssignment) {
      if (existingAssignment.sourceOfferId === offerId.trim()) {
        return { changed: false, assignedCleanerIds: rosterIds(job), operationalStatus: job.operationalStatus };
      }
      throw failedPrecondition("This cleaner is already assigned.", "cleaner-already-assigned");
    }
    if (assignedCount >= requiredCleanerCount) {
      throw failedPrecondition("Team is currently full.", "team-full", { requiredCleanerCount, assignedCount });
    }

    const assignedCleanerIds = [...rosterIds(job), cleanerId];
    transaction.create(newAssignmentReference, assignmentCreateData({
      organizationId,
      jobId: normalizedJobId,
      job,
      offer: { ...offer, cleanerId },
      sourceOfferId: offerId.trim(),
    }));
    transaction.update(jobReference, assignmentMutationJobPatch(job, assignedCleanerIds, "ASSIGNED"));
    return { changed: true, assignedCleanerIds, operationalStatus: "ASSIGNED" };
  });
}

export async function removeAssignmentForManager(database, {
  organizationId,
  jobId,
  assignmentId,
  actorUid,
}) {
  const normalizedJobId = requireJobId(jobId);
  if (typeof assignmentId !== "string" || !assignmentId.trim() || assignmentId.includes("/")) {
    throw new HttpsError("invalid-argument", "Assignment is invalid.");
  }
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${normalizedJobId}`);
  const assignmentReference = jobReference.collection("assignments").doc(assignmentId.trim());
  const offersReference = jobReference.collection("offers");

  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, assignmentsSnapshot, offersSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(jobReference.collection("assignments")),
      transaction.get(offersReference),
    ]);
    if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");
    const job = jobSnapshot.data();
    assertRosterEditable(job);
    const assignments = activeAssignments(assignmentsSnapshot);
    assertAssignmentProjectionConsistent(job, assignments);
    const assignment = assignments.find((entry) => entry.id === assignmentId.trim());
    if (!assignment) {
      return { changed: false, assignedCleanerIds: rosterIds(job), operationalStatus: job.operationalStatus };
    }
    if (assignment.executionStatus !== "ASSIGNED") {
      throw failedPrecondition("Cleaner work has already started and cannot be removed.", "assignment-execution-started");
    }

    const assignedCleanerIds = rosterIds(job).filter((id) => id !== assignment.cleanerId);
    const operationalStatus = assignedCleanerIds.length
      ? "ASSIGNED"
      : actionableOfferExists(offersSnapshot) ? "OFFERED" : "UNASSIGNED";
    const removal = {
      isActive: false,
      removedAt: FieldValue.serverTimestamp(),
    };
    if (typeof actorUid === "string" && actorUid.trim()) removal.removedByUid = actorUid.trim();
    transaction.update(assignmentReference, removal);
    transaction.update(jobReference, assignmentMutationJobPatch(job, assignedCleanerIds, operationalStatus));
    return { changed: true, assignedCleanerIds, operationalStatus };
  });
}

export async function replaceAssignmentForManager(database, {
  organizationId,
  jobId,
  assignmentId,
  replacementOfferId,
  actorUid,
}) {
  const normalizedJobId = requireJobId(jobId);
  if ([assignmentId, replacementOfferId].some((value) => typeof value !== "string" || !value.trim() || value.includes("/"))) {
    throw new HttpsError("invalid-argument", "Assignment replacement is invalid.");
  }
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${normalizedJobId}`);
  const assignmentReference = jobReference.collection("assignments").doc(assignmentId.trim());
  const offerReference = jobReference.collection("offers").doc(replacementOfferId.trim());
  const assignmentsReference = jobReference.collection("assignments");
  const newAssignmentReference = assignmentsReference.doc();

  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, offerSnapshot, assignmentsSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(offerReference),
      transaction.get(assignmentsReference),
    ]);
    if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");
    const job = jobSnapshot.data();
    assertRosterEditable(job);
    const assignments = activeAssignments(assignmentsSnapshot);
    assertAssignmentProjectionConsistent(job, assignments);
    const oldAssignment = assignments.find((entry) => entry.id === assignmentId.trim());
    const offer = offerSnapshot.exists ? offerSnapshot.data() : null;
    const replacementCleanerId = cleanId(offer?.cleanerId);
    if (!oldAssignment) {
      if (assignments.some((entry) => entry.sourceOfferId === replacementOfferId.trim())) {
        return { changed: false, assignedCleanerIds: rosterIds(job), operationalStatus: job.operationalStatus };
      }
      throw failedPrecondition("This assignment is no longer active.", "assignment-not-active");
    }
    if (oldAssignment.executionStatus !== "ASSIGNED") {
      throw failedPrecondition("Cleaner work has already started and cannot be replaced.", "assignment-execution-started");
    }
    if (offer?.status !== "INTERESTED" || !replacementCleanerId) {
      throw failedPrecondition("Only an interested cleaner can be assigned.", "offer-not-interested");
    }
    if (assignments.some((entry) => entry.cleanerId === replacementCleanerId)) {
      throw failedPrecondition("This cleaner is already assigned.", "cleaner-already-assigned");
    }

    const assignedCleanerIds = rosterIds(job).map((id) =>
      id === oldAssignment.cleanerId ? replacementCleanerId : id,
    );
    const removal = { isActive: false, removedAt: FieldValue.serverTimestamp() };
    if (typeof actorUid === "string" && actorUid.trim()) removal.removedByUid = actorUid.trim();
    transaction.update(assignmentReference, removal);
    transaction.create(newAssignmentReference, assignmentCreateData({
      organizationId,
      jobId: normalizedJobId,
      job,
      offer: { ...offer, cleanerId: replacementCleanerId },
      sourceOfferId: replacementOfferId.trim(),
    }));
    transaction.update(jobReference, assignmentMutationJobPatch(job, assignedCleanerIds, "ASSIGNED"));
    return { changed: true, assignedCleanerIds, operationalStatus: "ASSIGNED" };
  });
}

export async function updateRequiredCleanerCountForManager(database, {
  organizationId,
  jobId,
  requiredCleanerCount: requestedCount,
}) {
  const normalizedJobId = requireJobId(jobId);
  const requiredCleanerCount = validateRequiredCleanerCount(requestedCount);
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${normalizedJobId}`);
  return database.runTransaction(async (transaction) => {
    const jobSnapshot = await transaction.get(jobReference);
    if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");
    const job = jobSnapshot.data();
    if (job.archivedAt || !cleanerCountEditableStatuses.has(job.operationalStatus)) {
      throw failedPrecondition("Required cleaners can only be changed before work starts.", "count-locked");
    }
    if (!isAssignmentAware(job)) {
      if (requiredCleanerCount === 1 && getRequiredCleanerCount(job) === 1) {
        return { changed: false, requiredCleanerCount: 1 };
      }
      throw failedPrecondition("Legacy Jobs remain on the single-cleaner workflow.", "legacy-job");
    }
    const assignmentsSnapshot = await transaction.get(jobReference.collection("assignments"));
    const assignments = activeAssignments(assignmentsSnapshot);
    const assignedCount = assertAssignmentProjectionConsistent(job, assignments);
    if (requiredCleanerCount < assignedCount) {
      throw failedPrecondition("Required cleaners cannot be fewer than the currently assigned team.", "below-assigned-count", {
        requiredCleanerCount,
        assignedCount,
      });
    }
    const currentCount = getRequiredCleanerCount(job);
    if (currentCount === requiredCleanerCount) return { changed: false, requiredCleanerCount };
    transaction.update(jobReference, { requiredCleanerCount });
    return { changed: true, requiredCleanerCount };
  });
}

export async function startAssignedJobForManager(database, { organizationId, jobId }) {
  const normalizedJobId = requireJobId(jobId);
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${normalizedJobId}`);
  return database.runTransaction(async (transaction) => {
    const jobSnapshot = await transaction.get(jobReference);
    if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");
    const job = jobSnapshot.data();
    if (job.archivedAt) throw failedPrecondition("Archived services cannot be started.", "archived");
    if (!["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus)) {
      throw failedPrecondition("This service cannot be started from its current status.", "status");
    }

    if (isAssignmentAware(job)) {
      const assignmentsSnapshot = await transaction.get(jobReference.collection("assignments"));
      const assignments = activeAssignments(assignmentsSnapshot);
      const assignedCount = assertAssignmentProjectionConsistent(job, assignments);
      const requiredCleanerCount = getRequiredCleanerCount(job);
      if (assignedCount < requiredCleanerCount) {
        throw failedPrecondition(
          `This service needs ${requiredCleanerCount} cleaners. ${assignedCount} are currently assigned.`,
          "team-understaffed",
          { requiredCleanerCount, assignedCount },
        );
      }
    } else if (!cleanId(job.assignedCleanerId) && !cleanId(job.assignedCleanerName)) {
      throw failedPrecondition("Assign a cleaner before starting this service.", "cleaner-unassigned");
    }

    if (job.operationalStatus === "IN_PROGRESS") return { changed: false, operationalStatus: "IN_PROGRESS" };
    const updates = { operationalStatus: "IN_PROGRESS" };
    if (!job.startedAt) updates.startedAt = FieldValue.serverTimestamp();
    transaction.update(jobReference, updates);
    return { changed: true, operationalStatus: "IN_PROGRESS" };
  });
}
