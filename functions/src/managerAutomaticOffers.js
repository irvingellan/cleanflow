import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import {
  FIRST_ACCEPT_WINS,
  automaticOfferBatchVersion,
  automaticOfferCapacity,
  checklistContextRevision,
  emptyAutomaticOfferRoster,
} from "./firstAcceptWins.js";

const lifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maxRecipients = 50;

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160
    && value === value.trim() && value !== "." && value !== ".." && !value.includes("/");
}

/** A new, immutable distribution batch. Existing Offers keep their original behavior. */
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
    const [member, jobSnapshot, priorOffers, priorAssignments, ...cleaners] = await Promise.all([
      transaction.get(organization.collection("members").doc(actorUid)),
      transaction.get(jobRef),
      transaction.get(offers.limit(1)),
      transaction.get(jobRef.collection("assignments").limit(1)),
      ...cleanerIds.map((id) => transaction.get(organization.collection("cleaners").doc(id))),
    ]);

    if (!isActiveManagerMembership(member.data())) {
      throw new HttpsError("permission-denied", "Active organization manager access is required.");
    }
    const job = jobSnapshot.data();
    if (!job) throw new HttpsError("not-found", "Job not found.");
    const revision = checklistContextRevision(job);
    const capacity = automaticOfferCapacity(job);
    if (job.organizationId !== organizationId || job.schemaVersion !== 2
      || job.operationalStatus !== "UNASSIGNED" || job.archivedAt
      || job.offerDistributionMode != null || job.firstAcceptClaim || job.offerDistributionClosedAt
      || Object.hasOwn(job, "automaticOfferBatch") || !emptyAutomaticOfferRoster(job)
      || capacity === null || revision === null || revision > Number.MAX_SAFE_INTEGER - capacity
      || !priorOffers.empty || !priorAssignments.empty) {
      throw new HttpsError("failed-precondition", "This Job is ineligible for automatic offers.");
    }

    if (cleaners.some((snapshot) => {
      const cleaner = snapshot.data();
      return cleaner?.active !== true || cleaner.archivedAt
        || (cleaner.organizationId != null && cleaner.organizationId !== organizationId)
        || typeof cleaner.name !== "string" || !cleaner.name.trim();
    })) {
      throw new HttpsError("failed-precondition", "Select active cleaners with valid profiles.");
    }

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
        offeredChecklistContextRevision: revision,
        offeredPropertyName: typeof job.propertyName === "string" ? job.propertyName : null,
        offeredScheduledDate: typeof job.scheduledDate === "string" ? job.scheduledDate : null,
        offeredScheduledStart: typeof job.scheduledStart === "string" ? job.scheduledStart : null,
        offeredCompensation: null,
        publicOfferExpiresAt: expiresAt,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
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
