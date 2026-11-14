import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  automaticOfferBatch, automaticOfferState, checklistContextRevision, FIRST_ACCEPT_WINS,
  isAutomaticOfferJob, isCanonicalRoster, rosterMatchesActiveAssignments, validRosterId,
} from "./firstAcceptWins.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import { maxCleanersPerJob } from "./offerSlots.js";
import { currentScheduleConfirmation, jobScheduleRevision } from "./rescheduleConfirmations.js";

export const manualReplacementOfferKind = "MANUAL_REPLACEMENT";
const offerLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maxAutomaticOfferReads = 51;
const replacementOfferIdPattern = /^replacement-[a-zA-Z0-9]{20}$/;

export function isManualReplacementOfferId(value) {
  return typeof value === "string" && replacementOfferIdPattern.test(value);
}

export function currentManualReplacementOffer(job, offer, offerId, now = new Date()) {
  const pointer = job?.manualReplacementOffer;
  if (!isManualReplacementOfferId(offerId) || pointer?.offerId !== offerId
    || !validRosterId(offer?.cleanerId) || pointer.cleanerId !== offer.cleanerId
    || offer.offerKind !== manualReplacementOfferKind || offer.replacementOfferId !== offerId
    || offer.organizationId !== job.organizationId || offer.scheduleRevision !== pointer.issuedScheduleRevision
    || pointer.scheduleRevision !== jobScheduleRevision(job) || !Number.isSafeInteger(pointer.scheduleRevision)
    || !Number.isSafeInteger(pointer.issuedScheduleRevision) || pointer.issuedScheduleRevision < 1
    || pointer.issuedScheduleRevision > pointer.scheduleRevision || job.archivedAt || job.startedAt != null || !job.offerDistributionClosedAt
    || !isAutomaticOfferJob(job) || job.schemaVersion !== 2 || !isCanonicalRoster(job)
    || !["UNASSIGNED", "OFFERED", "ASSIGNED"].includes(job.operationalStatus)
    || !["PENDING", "INTERESTED"].includes(offer.status) || offer.revokedAt
    || !(offer.publicOfferExpiresAt?.toMillis?.() > now.getTime())) return false;
  const batch = automaticOfferBatch(job);
  return Boolean(batch && job.assignedCleanerIds.length < batch.capacity && !job.assignedCleanerIds.includes(offer.cleanerId));
}

function unavailable() {
  return new HttpsError("failed-precondition", "This replacement opening is no longer available.", { reason: "replacement-unavailable" });
}

/** One explicit signed-in offer for a vacancy created by a reschedule decline. */
export function createManualReplacementOfferForManager(database, {
  organizationId, actorUid, jobId, cleanerId, scheduleRevision, now = () => new Date(),
}) {
  if (![organizationId, actorUid, jobId, cleanerId].every(validRosterId)
    || !Number.isSafeInteger(scheduleRevision) || scheduleRevision < 1) {
    throw new HttpsError("invalid-argument", "Replacement offer request is invalid.");
  }
  const organization = database.collection("organizations").doc(organizationId);
  const jobRef = organization.collection("jobs").doc(jobId);
  const offers = jobRef.collection("offers");
  const offerRef = offers.doc("replacement-" + offers.doc().id);

  return database.runTransaction(async (transaction) => {
    const [member, jobSnapshot, cleanerSnapshot] = await Promise.all([
      transaction.get(organization.collection("members").doc(actorUid)),
      transaction.get(jobRef), transaction.get(organization.collection("cleaners").doc(cleanerId)),
    ]);
    if (!isActiveManagerMembership(member.data())) throw new HttpsError("permission-denied", "Active manager access is required.");
    const job = jobSnapshot.data();
    const cleaner = cleanerSnapshot.data();
    if (!job || job.organizationId !== organizationId) throw new HttpsError("not-found", "Job not found.");
    if (cleaner?.active !== true || cleaner.archivedAt || (cleaner.organizationId != null && cleaner.organizationId !== organizationId)
      || typeof cleaner.name !== "string" || !cleaner.name.trim()) throw unavailable();
    const batch = automaticOfferBatch(job);
    const confirmation = job.scheduleConfirmation;
    if (job.schemaVersion !== 2 || !isAutomaticOfferJob(job) || !batch
      || job.archivedAt || job.startedAt != null || (job.assignedCleanerId != null && job.assignedCleanerId !== "")
      || !["UNASSIGNED", "OFFERED", "ASSIGNED"].includes(job.operationalStatus)
      || !isCanonicalRoster(job) || job.assignedCleanerIds.length >= batch.capacity || job.assignedCleanerIds.includes(cleanerId)
      || jobScheduleRevision(job) !== scheduleRevision) throw unavailable();
    const declinedCleaners = Object.keys(confirmation?.byCleaner || {});
    const declineExists = declinedCleaners.length <= maxCleanersPerJob && declinedCleaners.some(id => (
      currentScheduleConfirmation(job, id, scheduleRevision)?.state === "DECLINED"
    ));
    if (!declineExists) throw unavailable();

    const priorId = job.manualReplacementOffer?.offerId;
    const checkOpenBatch = !job.offerDistributionClosedAt && !job.firstAcceptClaim
      && checklistContextRevision(job) === batch.currentContextRevision;
    const [assignments, prior, automaticCandidates] = await Promise.all([
      transaction.get(jobRef.collection("assignments").where("isActive", "==", true).limit(batch.capacity + 1)),
      isManualReplacementOfferId(priorId) ? transaction.get(offers.doc(priorId)) : null,
      checkOpenBatch ? transaction.get(offers.where("status", "==", "PENDING").limit(maxAutomaticOfferReads)) : null,
    ]);
    if (!rosterMatchesActiveAssignments(job, assignments.docs.map(snapshot => snapshot.data()), organizationId, jobId)) {
      throw unavailable();
    }
    const time = now();
    if (automaticCandidates && (automaticCandidates.docs.length >= maxAutomaticOfferReads
      || automaticCandidates.docs.some(snapshot => {
        const offer = snapshot.data();
        return snapshot.id === offer.cleanerId && offer.organizationId === organizationId && offer.jobId === jobId
          && offer.offerDistributionMode === FIRST_ACCEPT_WINS && automaticOfferState(offer, job, time) === "available";
      }))) {
      throw new HttpsError("failed-precondition", "An automatic offer is still available.", { reason: "automatic-offers-active" });
    }
    if (prior?.data()?.jobId === jobId && currentManualReplacementOffer(job, prior.data(), priorId, time)) {
      if (prior.data().cleanerId === cleanerId) return { offerId: priorId };
      throw new HttpsError("failed-precondition", "An offer is already open for this vacancy.", { reason: "replacement-pending" });
    }

    transaction.create(offerRef, {
      organizationId, jobId, cleanerId, cleanerName: cleaner.name.trim(), status: "PENDING",
      offerKind: manualReplacementOfferKind, replacementOfferId: offerRef.id, scheduleRevision,
      publicOfferExpiresAt: Timestamp.fromMillis(time.getTime() + offerLifetimeMs),
      createdAt: FieldValue.serverTimestamp(), createdByUid: actorUid,
    });
    transaction.update(jobRef, {
      manualReplacementOffer: { offerId: offerRef.id, cleanerId, scheduleRevision, issuedScheduleRevision: scheduleRevision },
      ...(job.offerDistributionClosedAt ? {} : { offerDistributionClosedAt: FieldValue.serverTimestamp() }),
      ...(job.operationalStatus === "UNASSIGNED" ? { operationalStatus: "OFFERED" } : {}),
    });
    return { offerId: offerRef.id };
  });
}
