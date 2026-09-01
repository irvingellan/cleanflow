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
import { db } from "../../services/firebase/client.js";
import {
  getAssignedCleanerIds,
  isAssignmentAwareJob,
  normalizeJobRecord,
} from "./jobCompatibility.js";

const organizationId = "cleanflow-demo";
const assignmentSchemaVersion = 1;

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
    offer?.status === "INTERESTED" &&
    typeof offer.cleanerId === "string" &&
    Boolean(offer.cleanerId.trim()) &&
    !getAssignedCleanerIds(job).includes(offer.cleanerId)
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
      : hasActionableOffers
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

export async function assignInterestedCleaner(jobId, offerId) {
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

    transaction.set(newAssignmentReference, buildAssignmentCreateData(job, offer));
    transaction.update(jobReference, {
      assignedCleanerIds: [...assignedCleanerIds, offer.cleanerId],
      operationalStatus: "ASSIGNED",
    });
  });

  return jobFromSnapshot(await getDoc(jobReference));
}

async function hasActionableOffers(jobId) {
  const snapshot = await getDocs(
    query(offersCollection(jobId), where("status", "in", ["PENDING", "INTERESTED"])),
  );

  return !snapshot.empty;
}

export async function removeAssignment(jobId, assignmentId, actorUid) {
  const jobReference = jobDocument(jobId);
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
    transaction.update(
      jobReference,
      assignmentRemovalJobUpdate(job, assignment.cleanerId, jobHasActionableOffers),
    );
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
    transaction.update(jobReference, {
      assignedCleanerIds: replacementCleanerIds(
        job,
        previousAssignment.cleanerId,
        replacementOffer.cleanerId,
      ),
      operationalStatus: "ASSIGNED",
    });
  });

  return jobFromSnapshot(await getDoc(jobReference));
}
