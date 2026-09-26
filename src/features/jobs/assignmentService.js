import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../services/firebase/client.js";
import {
  getAssignedCleanerIds,
  isAssignmentAwareJob,
  normalizeJobRecord,
} from "./jobCompatibility.js";

const organizationId = "cleanflow-demo";
const assignmentSchemaVersion = 1;
const assignInterestedCleanerCall = httpsCallable(functions, "assignInterestedCleaner");
const removeAssignmentCall = httpsCallable(functions, "removeCleanerAssignment");
const replaceAssignmentCall = httpsCallable(functions, "replaceCleanerAssignment");
const updateRequiredCleanerCountCall = httpsCallable(functions, "updateRequiredCleanerCount");

function jobDocument(jobId) {
  return doc(db, "organizations", organizationId, "jobs", jobId);
}

function assignmentsCollection(jobId) {
  return collection(db, "organizations", organizationId, "jobs", jobId, "assignments");
}

function jobFromSnapshot(snapshot) {
  return normalizeJobRecord(snapshot.data(), snapshot.id);
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
  await assignInterestedCleanerCall({ jobId, offerId });
  const snapshot = await getDoc(jobDocument(jobId));
  if (!snapshot.exists()) throw new Error("Job not found.");
  return jobFromSnapshot(snapshot);
}

export async function removeAssignment(jobId, assignmentId) {
  await removeAssignmentCall({ jobId, assignmentId });
  const snapshot = await getDoc(jobDocument(jobId));
  if (!snapshot.exists()) throw new Error("Job not found.");
  return jobFromSnapshot(snapshot);
}

export async function replaceAssignment(jobId, assignmentId, replacementOfferId) {
  await replaceAssignmentCall({ jobId, assignmentId, replacementOfferId });
  const snapshot = await getDoc(jobDocument(jobId));
  if (!snapshot.exists()) throw new Error("Job not found.");
  return jobFromSnapshot(snapshot);
}

export async function updateRequiredCleanerCount(jobId, requiredCleanerCount) {
  await updateRequiredCleanerCountCall({ jobId, requiredCleanerCount });
  const snapshot = await getDoc(jobDocument(jobId));
  if (!snapshot.exists()) throw new Error("Job not found.");
  return jobFromSnapshot(snapshot);
}
