import { newOfferPay } from "./offerPay.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { requireMission2Writes } from "./mission2WriteControl.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import {
  FIRST_ACCEPT_WINS,
  automaticOfferBatchVersion,
  automaticOfferBatch,
  automaticOfferCapacity,
  checklistContextRevision,
  emptyAutomaticOfferRoster,
  isAutomaticOfferJob,
  isCanonicalRoster,
} from "./firstAcceptWins.js";

const lifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maxRecipients = 50;

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160
    && value === value.trim() && value !== "." && value !== ".." && !value.includes("/");
}

/**
 * True when an open automatic batch can still receive more cleaners: the
 * batch is current, nobody closed it and at least one spot is open.
 */
export function canExtendAutomaticOfferBatch(job, organizationId) {
  const batch = automaticOfferBatch(job);
  return Boolean(batch) && isAutomaticOfferJob(job) && job.organizationId === organizationId
    && job.schemaVersion === 2 && !job.archivedAt && !job.firstAcceptClaim && !job.offerDistributionClosedAt
    && ["OFFERED", "ASSIGNED"].includes(job.operationalStatus) && isCanonicalRoster(job)
    && (job.assignedCleanerId == null || job.assignedCleanerId === "")
    && job.assignedCleanerIds.length < batch.capacity
    && checklistContextRevision(job) === batch.currentContextRevision;
}

/**
 * Opens an automatic distribution batch, or adds cleaners to the open batch
 * of the same Job ("send to more cleaners"). Existing Offers are never changed.
 */
export async function createAutomaticJobOffersForManager(database, {
  organizationId, actorUid, jobId, cleanerIds, now = Date.now,
}) {
  if (!validId(actorUid)) throw new HttpsError("unauthenticated", "A manager account is required.");
  if (![organizationId, jobId].every(validId) || !Array.isArray(cleanerIds)
    || cleanerIds.length < 1 || cleanerIds.length > maxRecipients
    || !cleanerIds.every(validId) || new Set(cleanerIds).size !== cleanerIds.length) {
    throw new HttpsError("invalid-argument", "Select a Job and up to 50 different cleaners.");
  }

  const organization = database.collection("organizations").doc(organizationId);
  const jobRef = organization.collection("jobs").doc(jobId);
  const offers = jobRef.collection("offers");

  return database.runTransaction(async (transaction) => {
    const [member, jobSnapshot, priorOffers, priorAssignments, ...rest] = await Promise.all([
      transaction.get(organization.collection("members").doc(actorUid)),
      transaction.get(jobRef),
      transaction.get(offers.limit(1)),
      transaction.get(jobRef.collection("assignments").limit(1)),
      ...cleanerIds.map((id) => transaction.get(organization.collection("cleaners").doc(id))),
      ...cleanerIds.map((id) => transaction.get(offers.doc(id))),
    ]);
    const cleaners = rest.slice(0, cleanerIds.length);
    const existingOffers = rest.slice(cleanerIds.length);

    if (!isActiveManagerMembership(member.data())) {
      throw new HttpsError("permission-denied", "Active organization manager access is required.");
    }
    const job = jobSnapshot.data();
    if (!job) throw new HttpsError("not-found", "Job not found.");
    const property = typeof job.propertyId === "string" && validId(job.propertyId)
      ? (await transaction.get(organization.collection("properties").doc(job.propertyId))).data()
      : undefined;
    const compensation = newOfferPay(job, property);
    const revision = checklistContextRevision(job);
    const capacity = automaticOfferCapacity(job);
    const extending = Object.hasOwn(job, "automaticOfferBatch");
    if (extending) {
      if (!canExtendAutomaticOfferBatch(job, organizationId)) {
        throw new HttpsError("failed-precondition", "This Job has no open spot for more cleaners.");
      }
    } else if (job.organizationId !== organizationId || job.schemaVersion !== 2
      || job.operationalStatus !== "UNASSIGNED" || job.archivedAt
      || job.offerDistributionMode != null || job.firstAcceptClaim || job.offerDistributionClosedAt
      || Object.hasOwn(job, "automaticOfferBatch") || !emptyAutomaticOfferRoster(job)
      || capacity === null || revision === null || revision > Number.MAX_SAFE_INTEGER - capacity
      || !priorOffers.empty || !priorAssignments.empty) {
      throw new HttpsError("failed-precondition", "This Job is ineligible for automatic offers.");
    }

    if (extending && cleanerIds.some((id, index) => existingOffers[index].exists || job.assignedCleanerIds.includes(id))) {
      throw new HttpsError("already-exists", "One of these cleaners already has an offer for this Job.");
    }

    if (cleaners.some((snapshot) => {
      const cleaner = snapshot.data();
      return cleaner?.active !== true || cleaner.archivedAt
        || (cleaner.organizationId != null && cleaner.organizationId !== organizationId)
        || typeof cleaner.name !== "string" || !cleaner.name.trim();
    })) {
      throw new HttpsError("failed-precondition", "Select active cleaners with valid profiles.");
    }

    await requireMission2Writes(transaction, database);
    const expiresAt = Timestamp.fromMillis(now() + lifetimeMs);
    for (const cleaner of cleaners) {
      transaction.create(offers.doc(cleaner.id), {
        organizationId,
        jobId,
        cleanerId: cleaner.id,
        cleanerName: cleaner.data().name.trim(),
        status: "PENDING",
        offerDistributionMode: FIRST_ACCEPT_WINS,
        automaticOfferBatchVersion,
        ...(extending && cleaner.id === cleanerIds[0] && { syncExtendedBatchAgenda: true }),
        offeredChecklistContextRevision: extending ? job.automaticOfferBatch.openingContextRevision : revision,
        offeredPropertyName: typeof job.propertyName === "string" ? job.propertyName : null,
        offeredScheduledDate: typeof job.scheduledDate === "string" ? job.scheduledDate : null,
        offeredScheduledStart: typeof job.scheduledStart === "string" ? job.scheduledStart : null,
        ...compensation,
        publicOfferExpiresAt: expiresAt,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (extending) return { jobId, count: cleaners.length };
    transaction.update(jobRef, {
      operationalStatus: "OFFERED",
      offerDistributionMode: FIRST_ACCEPT_WINS,
      automaticOfferBatch: { version: automaticOfferBatchVersion, capacity, openingContextRevision: revision, currentContextRevision: revision },
      offeredAt: FieldValue.serverTimestamp(),
      offerDistributionByUid: actorUid,
    });
    return { jobId, count: cleaners.length };
  });
}
