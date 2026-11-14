import { maxCleanersPerJob } from "./offerSlots.js";

export const FIRST_ACCEPT_WINS = "FIRST_ACCEPT_WINS";
const firstAcceptMultiSlotLabel = {
  en: "Assign the available spots to the first cleaners who accept",
  pt: "Atribuir as vagas às primeiras cleaners que aceitarem",
  es: "Asignar las plazas a las primeras cleaners que acepten",
};

export function automaticOfferOptInLabel(job, language, translate) {
  return (job.requiredCleanerCount ?? 1) === 1
    ? translate("offers.firstAcceptOptIn")
    : firstAcceptMultiSlotLabel[language] || firstAcceptMultiSlotLabel.en;
}

export function isAutomaticOfferJob(job) {
  return job?.offerDistributionMode === FIRST_ACCEPT_WINS;
}

export function canOptIntoAutomaticOffers(job) {
  const capacity = job?.requiredCleanerCount === undefined ? 1 : job.requiredCleanerCount;
  return job?.schemaVersion === 2 && job.operationalStatus === "UNASSIGNED" && !job.archivedAt
    && job.offerDistributionMode == null && !job.firstAcceptClaim && !job.offerDistributionClosedAt
    && !job.assignedCleanerId && Array.isArray(job.assignedCleanerIds) && job.assignedCleanerIds.length === 0
    && Number.isInteger(capacity) && capacity >= 1 && capacity <= maxCleanersPerJob;
}

export function automaticOfferDisplayStatus(job, offer, now = Date.now()) {
  if (!isAutomaticOfferJob(job)) return null;
  if (offer.status === "ACCEPTED" || offer.status === "DECLINED") return offer.status;
  if (job.automaticOfferBatch !== undefined) {
    const batch = job.automaticOfferBatch;
    const revision = job.checklistContextRevision ?? 0;
    if (offer.status !== "PENDING" || offer.revokedAt || job.offerDistributionClosedAt || job.archivedAt
      || batch?.version !== 2 || offer.automaticOfferBatchVersion !== 2
      || batch.currentContextRevision !== revision
      || offer.offeredChecklistContextRevision !== batch.openingContextRevision
      || !["OFFERED", "ASSIGNED"].includes(job.operationalStatus)) return "UNAVAILABLE";
    const expiresAt = offer.publicOfferExpiresAt?.toMillis?.();
    return Number.isFinite(expiresAt) && expiresAt > now ? "AWAITING_ACCEPTANCE" : "EXPIRED";
  }
  if (offer.status !== "PENDING" || job.firstAcceptClaim || job.offerDistributionClosedAt
    || job.archivedAt || job.operationalStatus !== "OFFERED"
    || offer.offeredChecklistContextRevision !== (job.checklistContextRevision ?? 0)) return "UNAVAILABLE";
  const expiresAt = offer.publicOfferExpiresAt?.toMillis?.();
  return Number.isFinite(expiresAt) && expiresAt > now ? "AWAITING_ACCEPTANCE" : "EXPIRED";
}
