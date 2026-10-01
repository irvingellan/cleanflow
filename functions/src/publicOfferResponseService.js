import { FieldValue } from "firebase-admin/firestore";
import {
  createManagerOperationalNotification, managerOfferNotificationGeneration,
  managerOperationalNotificationCollection, managerOperationalNotificationEventId,
  managerOperationalNotificationTypes,
} from "./managerOperationalNotifications.js";

export function canUsePublicOffer(job) {
  if (job?.archivedAt) return false;
  return Number.isInteger(job?.schemaVersion) && job.schemaVersion >= 2
    ? ["OFFERED", "ASSIGNED"].includes(job.operationalStatus)
    : job?.operationalStatus === "OFFERED";
}

export function publicOfferState(offer, job, now) {
  if (!offer.publicOfferExpiresAt?.toMillis || offer.publicOfferExpiresAt.toMillis() <= now.getTime()) return "expired";
  return canUsePublicOffer(job) && ["PENDING", "INTERESTED", "DECLINED"].includes(offer.status)
    ? "available" : "unavailable";
}

export async function respondToPublicOffer(database, {
  organizationId, jobReference, offerReference, tokenHash, status, now = () => new Date(),
}) {
  const jobPath = `organizations/${organizationId}/jobs/${jobReference?.id || ""}`;
  if (jobReference?.path !== jobPath
    || offerReference?.path !== `${jobPath}/offers/${offerReference?.id || ""}`
    || !["INTERESTED", "DECLINED"].includes(status)) return { state: "unavailable" };
  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([
      transaction.get(jobReference), transaction.get(offerReference),
    ]);
    if (!jobSnapshot.exists || !offerSnapshot.exists) return { state: "not-found" };
    const job = jobSnapshot.data();
    const offer = offerSnapshot.data();
    if (offer.publicOfferTokenHash !== tokenHash) return { state: "not-found" };
    const state = publicOfferState(offer, job, typeof now === "function" ? now() : now);
    if (state !== "available") return { state };
    if (offer.status !== "PENDING") return { state: "answered", status: offer.status };
    const notificationContext = {
      organizationId, offerId: offerReference.id, cleanerId: offer.cleanerId,
      eventType: managerOperationalNotificationTypes.interest,
      offerGeneration: managerOfferNotificationGeneration(offer), propertyName: job.propertyName,
    };
    // Normal re-invites reuse the document ID but set a fresh server createdAt.
    // Legacy records without that timestamp keep a conservative single receipt.
    const existingEvent = status === "INTERESTED" ? await transaction.get(
      jobReference.collection(managerOperationalNotificationCollection).doc(managerOperationalNotificationEventId({
        ...notificationContext, jobId: jobReference.id,
      })),
    ) : null;
    transaction.update(offerReference, { status, respondedAt: FieldValue.serverTimestamp() });
    if (status === "INTERESTED" && !existingEvent.exists) {
      createManagerOperationalNotification(transaction, jobReference, notificationContext);
    }
    return { state: "answered", status };
  });
}
