import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../services/firebase/client.js";
import {
  getAssignedCleanerIds,
  isAssignmentAwareJob,
  normalizeJobRecord,
} from "./jobCompatibility.js";
import { isAutomaticOfferJob } from "./automaticOffers.js";
import { buildAssignmentChecklistContextRevisionUpdate } from "./checklistContextRevision.js";
import { isJobFilled, managerDecisionOf, maxCleanersPerJob, requiredCleanerCount } from "./offerSlots.js";

const organizationId = "cleanflow-demo";
const assignmentSchemaVersion = 1;
const assignCleanerDirectlyCall = httpsCallable(functions, "assignCleanerDirectly");
const removeAutomaticCleanerAssignmentCall = httpsCallable(functions, "removeAutomaticCleanerAssignment");

function jobDocument(jobId) {
  return doc(db, "organizations", organizationId, "jobs", jobId);
}

function offersCollection(jobId) {
  return collection(db, "organizations", organizationId, "jobs", jobId, "offers");
}

function offerDocument(jobId, offerId) {
  return doc(db, "organizations", organizationId, "jobs", jobId, "offers", offerId);
}

function assignmentsCollection(jobId) {
  return collection(db, "organizations", organizationId, "jobs", jobId, "assignments");
}

function assignmentDocument(jobId, assignmentId) {
  return doc(db, "organizations", organizationId, "jobs", jobId, "assignments", assignmentId);
}

function jobFromSnapshot(snapshot) {
  return normalizeJobRecord(snapshot.data(), snapshot.id);
}

function assignmentError(code, message, job) {
  const error = new Error(message);
  error.code = code;
  error.job = job;
  return error;
}

export function canEditAssignmentRoster(job) {
  return (
    isAssignmentAwareJob(job) &&
    (job?.operationalStatus === "OFFERED" || job?.operationalStatus === "ASSIGNED")
  );
}

export function canAssignInterestedOffer(job, offer) {
  return (
    canEditAssignmentRoster(job) &&
    !isAutomaticOfferJob(job) &&
    offer?.status === "INTERESTED" &&
    !managerDecisionOf(offer) &&
    typeof offer.cleanerId === "string" &&
    Boolean(offer.cleanerId.trim()) &&
    !getAssignedCleanerIds(job).includes(offer.cleanerId)
  );
}

export function canDirectlyFillJob(job) {
  if (job?.schemaVersion !== 2 || job.archivedAt
    || !["UNASSIGNED", "OFFERED", "ASSIGNED"].includes(job.operationalStatus)) return false;
  if (!isAutomaticOfferJob(job)) return true;

  const roster = getAssignedCleanerIds(job);
  const batch = job.automaticOfferBatch;
  if (batch === undefined) return roster.length === 0;

  return batch?.version === 2 && Number.isInteger(batch.capacity)
    && batch.capacity === requiredCleanerCount(job)
    && batch.capacity >= 1 && batch.capacity <= maxCleanersPerJob
    && roster.length < batch.capacity;
}

export function canAssignCleanerDirectly(job, cleaner) {
  return (
    canDirectlyFillJob(job) &&
    cleaner?.active === true &&
    !cleaner.archivedAt &&
    typeof cleaner.id === "string" &&
    Boolean(cleaner.id.trim()) &&
    !getAssignedCleanerIds(job).includes(cleaner.id)
  );
}

export function replacementCleanerIds(job, previousCleanerId, replacementCleanerId) {
  return getAssignedCleanerIds(job).map((cleanerId) =>
    cleanerId === previousCleanerId ? replacementCleanerId : cleanerId,
  );
}

function assertRosterEditable(snapshot) {
  if (!snapshot.exists()) {
    throw assignmentError("job-not-found", "Job not found.");
  }

  const job = jobFromSnapshot(snapshot);

  if (!isAssignmentAwareJob(job)) {
    throw assignmentError("legacy-job", "This Job uses the legacy assignment workflow.", job);
  }

  if (!canEditAssignmentRoster(job)) {
    throw assignmentError("assignment-roster-locked", "Cleaner assignments cannot be changed after work starts.", job);
  }

  return job;
}

export function buildAssignmentCreateData(job, offer) {
  const assignment = {
    schemaVersion: assignmentSchemaVersion,
    organizationId,
    jobId: job.id,
    cleanerId: offer.cleanerId,
    cleanerNameSnapshot: offer.cleanerName || "",
    source: "OFFER",
    sourceOfferId: offer.id,
    isActive: true,
    executionStatus: "ASSIGNED",
    propertyId: job.propertyId || "",
    propertyName: job.propertyName || "",
    scheduledDate: job.scheduledDate || "",
    createdAt: serverTimestamp(),
    assignedAt: serverTimestamp(),
  };

  if (job.scheduledStart) {
    assignment.scheduledStart = job.scheduledStart;
  }

  return assignment;
}

export function isActionableOffer(offer) {
  return offer?.status === "PENDING" || offer?.status === "INTERESTED";
}

export function assignmentRemovalJobUpdate(job, cleanerId, hasActionableOffers) {
  const assignedCleanerIds = getAssignedCleanerIds(job).filter((id) => id !== cleanerId);

  return {
    assignedCleanerIds,
    operationalStatus: assignedCleanerIds.length
      ? "ASSIGNED"
      : hasActionableOffers && !isAutomaticOfferJob(job)
        ? "OFFERED"
        : "UNASSIGNED",
  };
}

export async function getJobAssignments(jobId) {
  const snapshot = await getDocs(assignmentsCollection(jobId));

  return snapshot.docs
    .map((assignmentSnapshot) => ({ ...assignmentSnapshot.data(), id: assignmentSnapshot.id }))
    .sort((first, second) => first.id.localeCompare(second.id));
}

/**
 * Confirms an interested cleaner. When every spot is already filled the
 * manager must ask for one more spot explicitly (`addSpot`), so a stale screen
 * or a double click cannot put an extra cleaner on a single-cleaner Job.
 */
export async function assignInterestedCleaner(jobId, offerId, { addSpot = false } = {}) {
  const jobReference = jobDocument(jobId);
  const offerReference = offerDocument(jobId, offerId);
  const newAssignmentReference = doc(assignmentsCollection(jobId));

  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(offerReference),
    ]);
    const job = assertRosterEditable(jobSnapshot);

    if (!offerSnapshot.exists() || offerSnapshot.data().status !== "INTERESTED") {
      throw assignmentError("offer-not-interested", "Only interested cleaners can be assigned.", job);
    }

    const offer = { ...offerSnapshot.data(), id: offerSnapshot.id };
    const assignedCleanerIds = getAssignedCleanerIds(job);
    if (!canAssignInterestedOffer(job, offer)) {
      throw assignmentError("cleaner-already-assigned", "This cleaner is already assigned.", job);
    }
    if (isJobFilled(job) && !addSpot) {
      throw assignmentError("job-filled", "Every spot on this Job is already filled.", job);
    }
    if (addSpot && assignedCleanerIds.length + 1 > maxCleanersPerJob) {
      throw assignmentError("too-many-cleaners", "This Job already has the maximum number of cleaners.", job);
    }

    transaction.set(newAssignmentReference, buildAssignmentCreateData(job, offer));
    const jobUpdate = {
      assignedCleanerIds: [...assignedCleanerIds, offer.cleanerId],
      operationalStatus: "ASSIGNED",
      ...(addSpot && assignedCleanerIds.length + 1 > requiredCleanerCount(job)
        ? { requiredCleanerCount: assignedCleanerIds.length + 1 } : {}),
    };
    transaction.update(jobReference, {
      ...jobUpdate,
      ...buildAssignmentChecklistContextRevisionUpdate(job),
    });
  });

  return jobFromSnapshot(await getDoc(jobReference));
}

export async function assignCleanerDirectly(jobId, cleanerId, replacementOfferId) {
  await assignCleanerDirectlyCall({ jobId, cleanerId, ...(replacementOfferId ? { replacementOfferId } : {}) });
  return jobFromSnapshot(await getDoc(jobDocument(jobId)));
}

async function hasActionableOffers(jobId) {
  const snapshot = await getDocs(
    query(offersCollection(jobId), where("status", "in", ["PENDING", "INTERESTED"])),
  );

  return !snapshot.empty;
}

export async function removeAssignment(jobId, assignmentId, actorUid) {
  const jobReference = jobDocument(jobId);
  const job = assertRosterEditable(await getDoc(jobReference));
  if (isAutomaticOfferJob(job) && job.automaticOfferBatch?.version === 2) {
    await removeAutomaticCleanerAssignmentCall({ jobId, assignmentId });
    return jobFromSnapshot(await getDoc(jobReference));
  }

  const assignmentReference = assignmentDocument(jobId, assignmentId);
  // Firestore transactions can only read documents; this immediate bounded offer read
  // determines the post-removal parent state without introducing a collection-group query.
  const jobHasActionableOffers = await hasActionableOffers(jobId);

  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, assignmentSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(assignmentReference),
    ]);
    const job = assertRosterEditable(jobSnapshot);

    if (!assignmentSnapshot.exists() || assignmentSnapshot.data().isActive !== true) {
      throw assignmentError("assignment-not-active", "This assignment is no longer active.", job);
    }

    const assignment = assignmentSnapshot.data();
    if (!getAssignedCleanerIds(job).includes(assignment.cleanerId)) {
      throw assignmentError("assignment-mismatch", "This assignment no longer matches the Job roster.", job);
    }

    const removal = { isActive: false, removedAt: serverTimestamp() };
    if (typeof actorUid === "string" && actorUid.trim()) {
      removal.removedByUid = actorUid.trim();
    }

    transaction.update(assignmentReference, removal);
    const jobUpdate = assignmentRemovalJobUpdate(job, assignment.cleanerId, jobHasActionableOffers);
    transaction.update(jobReference, {
      ...jobUpdate,
      ...buildAssignmentChecklistContextRevisionUpdate(job),
    });
  });

  return jobFromSnapshot(await getDoc(jobReference));
}

export async function replaceAssignment(jobId, assignmentId, replacementOfferId, actorUid) {
  const jobReference = jobDocument(jobId);
  const assignmentReference = assignmentDocument(jobId, assignmentId);
  const offerReference = offerDocument(jobId, replacementOfferId);
  const newAssignmentReference = doc(assignmentsCollection(jobId));

  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, assignmentSnapshot, offerSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(assignmentReference),
      transaction.get(offerReference),
    ]);
    const job = assertRosterEditable(jobSnapshot);
    if (isAutomaticOfferJob(job)) {
      throw assignmentError("invalid-replacement", "Use direct assignment after removing the current cleaner.", job);
    }

    if (!assignmentSnapshot.exists() || assignmentSnapshot.data().isActive !== true) {
      throw assignmentError("assignment-not-active", "This assignment is no longer active.", job);
    }
    if (!offerSnapshot.exists() || offerSnapshot.data().status !== "INTERESTED") {
      throw assignmentError("offer-not-interested", "Only interested cleaners can be assigned.", job);
    }

    const previousAssignment = assignmentSnapshot.data();
    const replacementOffer = { ...offerSnapshot.data(), id: offerSnapshot.id };
    const assignedCleanerIds = getAssignedCleanerIds(job);
    if (
      !previousAssignment.cleanerId ||
      !assignedCleanerIds.includes(previousAssignment.cleanerId) ||
      !replacementOffer.cleanerId ||
      assignedCleanerIds.includes(replacementOffer.cleanerId)
    ) {
      throw assignmentError("invalid-replacement", "The replacement cleaner is not available for this roster.", job);
    }

    const removal = { isActive: false, removedAt: serverTimestamp() };
    if (typeof actorUid === "string" && actorUid.trim()) {
      removal.removedByUid = actorUid.trim();
    }

    transaction.update(assignmentReference, removal);
    transaction.set(newAssignmentReference, buildAssignmentCreateData(job, replacementOffer));
    const jobUpdate = {
      assignedCleanerIds: replacementCleanerIds(
        job,
        previousAssignment.cleanerId,
        replacementOffer.cleanerId,
      ),
      operationalStatus: "ASSIGNED",
    };
    transaction.update(jobReference, {
      ...jobUpdate,
      ...buildAssignmentChecklistContextRevisionUpdate(job),
    });
  });

  return jobFromSnapshot(await getDoc(jobReference));
}

/** Number of cleaners a manual Job needs. It can never drop below the current roster. */
export async function setRequiredCleanerCount(jobId, count) {
  const jobReference = jobDocument(jobId);
  await runTransaction(db, async (transaction) => {
    const job = assertRosterEditableOrOpen(await transaction.get(jobReference));
    if (!Number.isInteger(count) || count < 1 || count > maxCleanersPerJob
      || count < getAssignedCleanerIds(job).length) {
      throw assignmentError("invalid-spot-count", "The number of cleaners is not valid for this Job.", job);
    }
    transaction.update(jobReference, { requiredCleanerCount: count });
  });
  return jobFromSnapshot(await getDoc(jobReference));
}

function assertRosterEditableOrOpen(snapshot) {
  if (!snapshot.exists()) throw assignmentError("job-not-found", "Job not found.");
  const job = jobFromSnapshot(snapshot);
  if (!isAssignmentAwareJob(job) || isAutomaticOfferJob(job) || job.archivedAt
    || !["UNASSIGNED", "OFFERED", "ASSIGNED"].includes(job.operationalStatus)) {
    throw assignmentError("assignment-roster-locked", "Cleaner spots cannot be changed for this Job.", job);
  }
  return job;
}
