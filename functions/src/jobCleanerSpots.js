import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  automaticOfferBatch, automaticOfferBatchVersion, automaticOfferCapacity, checklistContextRevision, FIRST_ACCEPT_WINS,
  isAutomaticOfferJob, rosterMatchesActiveAssignments, validRosterId,
} from "./firstAcceptWins.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import { requireMission2Writes } from "./mission2WriteControl.js";
import { maxCleanersPerJob } from "./offerSlots.js";

const editableStatuses = new Set(["UNASSIGNED", "OFFERED", "ASSIGNED"]);
const ineligible = () => new HttpsError("failed-precondition", "This Job's cleaner spots cannot be changed.");

// Old single-slot batches have no version marker. Upgrade only the original invitations
// for this revision and keep the existing winner's per-offer replay receipt.
async function legacyBatchForResize(transaction, jobRef, job, revision, active) {
  if (automaticOfferCapacity(job) !== 1) throw ineligible();
  const claim = job.firstAcceptClaim;
  const offers = await transaction.get(jobRef.collection("offers").where("offerDistributionMode", "==", FIRST_ACCEPT_WINS));
  const originalOffers = offers.docs.filter(doc => {
    const data = doc.data();
    return doc.id === data.cleanerId && (data.organizationId == null || data.organizationId === job.organizationId) && data.jobId === jobRef.id
      && !Object.hasOwn(data, "automaticOfferBatchVersion")
      && Number.isSafeInteger(data.offeredChecklistContextRevision) && data.offeredChecklistContextRevision >= 0
      && data.offeredChecklistContextRevision <= revision;
  });
  const winner = claim && originalOffers.find(doc => doc.id === claim.offerId && doc.data().cleanerId === claim.cleanerId
    && doc.data().status === "ACCEPTED");
  if (claim && (!winner || !validRosterId(claim.assignmentId))) throw ineligible();
  if (winner && active.some(assignment => assignment.cleanerId === claim.cleanerId
    && (assignment.id !== claim.assignmentId || assignment.sourceOfferId !== winner.id))) throw ineligible();
  const originalRevisions = new Set(originalOffers.map(doc => doc.data().offeredChecklistContextRevision));
  const openingContextRevision = winner?.data().offeredChecklistContextRevision
    ?? (originalRevisions.size === 1 ? [...originalRevisions][0] : revision);
  for (const doc of originalOffers) {
    if (doc.data().offeredChecklistContextRevision !== openingContextRevision) continue;
    if (doc.id !== winner?.id && (doc.data().status !== "PENDING" || doc.data().revokedAt)) continue;
    transaction.update(doc.ref, {
      automaticOfferBatchVersion,
      ...(doc.data().organizationId == null && { organizationId: job.organizationId }),
      ...(doc.id === winner?.id && { acceptedAssignmentId: claim.assignmentId }),
    });
  }
  return { version: automaticOfferBatchVersion, openingContextRevision, currentContextRevision: revision };
}

export async function setJobCleanerSpotsForManager(database, { organizationId, actorUid, jobId, count }) {
  if (![organizationId, actorUid, jobId].every(validRosterId) || !Number.isInteger(count) || count < 1 || count > maxCleanersPerJob) {
    throw new HttpsError("invalid-argument", "Select a Job and a valid number of cleaner spots.");
  }
  const org = database.collection("organizations").doc(organizationId);
  const jobRef = org.collection("jobs").doc(jobId);
  return database.runTransaction(async transaction => {
    const [member, snapshot] = await transaction.getAll(org.collection("members").doc(actorUid), jobRef);
    if (!isActiveManagerMembership(member.data()) || (member.data().organizationId != null && member.data().organizationId !== organizationId)) {
      throw new HttpsError("permission-denied", "Active organization manager access is required.");
    }
    if (!snapshot.exists) throw new HttpsError("not-found", "Job not found.");
    const job = snapshot.data();
    const revision = checklistContextRevision(job);
    const previous = automaticOfferCapacity(job);
    if (job.organizationId !== organizationId || job.schemaVersion !== 2 || !isAutomaticOfferJob(job)
      || job.archivedAt || job.startedAt || !editableStatuses.has(job.operationalStatus)
      || job.assignedCleanerId || job.payoutId || job.payoutPaidAt || Object.keys(job.payoutIdsByCleaner ?? {}).length
      || previous === null || revision === null || revision >= Number.MAX_SAFE_INTEGER) throw ineligible();
    const activeDocs = await transaction.get(jobRef.collection("assignments").where("isActive", "==", true).limit(maxCleanersPerJob + 1));
    const active = activeDocs.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    if (!rosterMatchesActiveAssignments(job, active, organizationId, jobId) || count < active.length) throw ineligible();
    const versioned = Object.hasOwn(job, "automaticOfferBatch");
    const current = automaticOfferBatch(job);
    if (job.firstAcceptClaim && (!job.offerDistributionClosedAt || previous !== 1)) throw ineligible();
    if (versioned && (!current || current.currentContextRevision > revision
      || (!job.offerDistributionClosedAt && current.currentContextRevision !== revision))) throw ineligible();
    if (previous === count) return { jobId, requiredCleanerCount: count };
    await requireMission2Writes(transaction, database);
    const batch = current ?? await legacyBatchForResize(transaction, jobRef, job, revision, active);
    const reopening = count > previous;
    transaction.update(jobRef, {
      requiredCleanerCount: count,
      automaticOfferBatch: {
        ...batch, capacity: count, currentContextRevision: revision, spotsUpdatedByUid: actorUid,
        ...(reopening && { reopenedAtContextRevision: revision }),
      },
      ...(count === active.length && !job.offerDistributionClosedAt && { offerDistributionClosedAt: FieldValue.serverTimestamp() }),
      ...(reopening && {
        operationalStatus: active.length ? "ASSIGNED" : "OFFERED",
        offerDistributionClosedAt: FieldValue.delete(), firstAcceptClaim: FieldValue.delete(),
      }),
    });
    return { jobId, requiredCleanerCount: count };
  });
}
