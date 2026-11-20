import { doc as transactionDoc } from "firebase/firestore";
import { collection, doc, documentId, getDoc, getDocs, limit, query, where } from "firebase/firestore/lite";
import { validRosterId } from "../../../functions/src/firstAcceptWins.js";
import { maxCleanersPerJob } from "../../../functions/src/offerSlots.js";
import { offerPayForRecipient, storedOfferPay } from "../../../functions/src/offerPay.js";
import { serverFirestore, withReadDeadline } from "../../services/firebase/serverReads.js";
import { isAssignmentAwareJob } from "../jobs/jobCompatibility.js";

function rosterFor(job) {
  const ids = isAssignmentAwareJob(job) ? job.assignedCleanerIds : [job.assignedCleanerId];
  return Array.isArray(ids) && ids.length <= maxCleanersPerJob && ids.every(validRosterId)
    && new Set(ids).size === ids.length ? ids : [];
}

function belongsTo(record, jobId, organizationId, cleanerId) {
  return record?.cleanerId === cleanerId && (record.organizationId == null || record.organizationId === organizationId)
    && (record.jobId == null || record.jobId === jobId);
}

function personalTerms(agreement, job, cleanerId) {
  if (!agreement || typeof agreement !== "object") return null;
  if (!Object.hasOwn(agreement, "offeredCompensation") && !Object.hasOwn(agreement, "offeredPay")) {
    return Object.hasOwn(agreement, "fixedHousePay") || Object.hasOwn(agreement, "offeredFirstSlotExtraCents") ? null : undefined;
  }
  const terms = storedOfferPay(agreement);
  if ((Object.hasOwn(agreement, "fixedHousePay") && !terms.fixedHousePay)
      || (Object.hasOwn(agreement, "offeredPay") && !terms.offeredPay)
      || (Object.hasOwn(agreement, "offeredFirstSlotExtraCents") && !terms.offeredFirstSlotExtraCents)) return null;
  return offerPayForRecipient(terms, job, cleanerId);
}

async function agreementFor(job, organizationId, cleanerId, assignments, readOffer) {
  const owned = assignments.filter(record => record.cleanerId === cleanerId);
  if (owned.length > 1) return null;
  const [assignment] = owned;
  const modern = isAssignmentAwareJob(job);
  if (modern && !assignment) return job.firstAcceptClaim?.cleanerId === cleanerId ? null : undefined;
  if (assignment && (!belongsTo(assignment, job.id, organizationId, cleanerId) || assignment.isActive !== true)) return null;
  if (assignment?.source === "MANAGER_DIRECT") {
    if (assignment.sourceOfferId != null || assignment.replacementOfferId != null) return null;
    return Object.hasOwn(assignment, "paySnapshot") ? personalTerms(assignment.paySnapshot, job, cleanerId) ?? null : undefined;
  }
  if (assignment?.source && assignment.source !== "OFFER") return null;
  const offerId = modern ? assignment.sourceOfferId : cleanerId;
  if (!validRosterId(offerId)) return null;
  const offer = await readOffer(offerId, cleanerId);
  if (!offer) return modern ? null : undefined;
  if (!belongsTo(offer, job.id, organizationId, cleanerId) || !["ACCEPTED", "INTERESTED", "SELECTED"].includes(offer.status)
    || offer.revokedAt || offer.managerDecision != null) return null;
  if ((assignment?.replacementOfferId != null || offer.offerKind === "MANUAL_REPLACEMENT")
    && (assignment?.replacementOfferId !== offerId || offer.replacementOfferId !== offerId
      || offer.replacementAssignmentId !== assignment.id || offer.status !== "SELECTED")) return null;
  return personalTerms(offer, job, cleanerId);
}

function assignmentQuery(jobRef, cleanerIds) {
  return query(collection(jobRef, "assignments"), where("isActive", "==", true),
    where("cleanerId", "in", cleanerIds), limit(cleanerIds.length + 1));
}

// Historical offer IDs can differ from their recipient. Check ownership on the
// server before following such a pointer, including a replacement invitation.
async function ownOffer(jobRef, offerId, cleanerId, readInTransaction) {
  if (offerId !== cleanerId) {
    const matched = await getDocs(query(collection(jobRef, "offers"), where(documentId(), "==", offerId),
      where("cleanerId", "==", cleanerId), limit(1)));
    if (matched.empty) return null;
    if (!readInTransaction) return matched.docs[0].data();
  }
  const snapshot = readInTransaction ? await readInTransaction("offers", offerId) : await getDoc(doc(jobRef, "offers", offerId));
  return snapshot.data();
}

async function enrichJob(job, organizationId, cleanerIds, readInTransaction, signal) {
  // Only these freshly verified terms may be consumed by financial models.
  const enriched = { ...job, payoutAgreementsByCleaner: {} };
  if (job.operationalStatus !== "COMPLETED" || !cleanerIds.length) return enriched;
  if (!validRosterId(organizationId) || !validRosterId(job.id) || (job.organizationId != null && job.organizationId !== organizationId)) {
    enriched.payoutAgreementsByCleaner = Object.fromEntries(cleanerIds.map(id => [id, null]));
    return enriched;
  }
  signal?.throwIfAborted();
  const jobRef = doc(serverFirestore(), "organizations", organizationId, "jobs", job.id);
  let assignments = [];
  if (isAssignmentAwareJob(job)) {
    const selected = await getDocs(assignmentQuery(jobRef, cleanerIds));
    assignments = await Promise.all(selected.docs.map(async candidate => {
      const snapshot = readInTransaction ? await readInTransaction("assignments", candidate.id) : candidate;
      const data = snapshot.data();
      // A changed/deleted selected document invalidates its original cleaner's source.
      return data?.cleanerId === candidate.data().cleanerId ? { ...data, id: candidate.id }
        : { cleanerId: candidate.data().cleanerId, isActive: false };
    }));
  }
  signal?.throwIfAborted();
  const entries = await Promise.all(cleanerIds.map(async cleanerId => {
    const value = assignments.length > cleanerIds.length ? null : await agreementFor(job, organizationId, cleanerId, assignments,
      (offerId, id) => ownOffer(jobRef, offerId, id, readInTransaction));
    return [cleanerId, value];
  }));
  enriched.payoutAgreementsByCleaner = Object.fromEntries(entries.filter(([, value]) => value !== undefined));
  return enriched;
}

/** Bounded batches of manager-only reads. No source data is persisted on the Job. */
export async function enrichPayoutAgreements(jobs, { organizationId, signal } = {}) {
  const result = [];
  for (let offset = 0; offset < jobs.length; offset += maxCleanersPerJob) {
    signal?.throwIfAborted();
    const batch = jobs.slice(offset, offset + maxCleanersPerJob);
    result.push(...await withReadDeadline(Promise.all(batch.map(job => enrichJob(job, organizationId, rosterFor(job), null, signal)))));
  }
  signal?.throwIfAborted();
  return result;
}

/**
 * Web transactions accept document references only. Discover the active IDs for
 * this recipient after reading the completed Job, then re-read their contents
 * in the transaction. Roster mutations also update the Job and trigger a retry.
 */
export function jobWithPayoutAgreementsInTransaction(transaction, jobReference, job, cleanerId) {
  const ids = rosterFor(job).includes(cleanerId) ? [cleanerId] : [];
  const organizationId = jobReference.parent.parent.id;
  return withReadDeadline(enrichJob(job, organizationId, ids,
    (collectionId, id) => transaction.get(transactionDoc(jobReference, collectionId, id))));
}
