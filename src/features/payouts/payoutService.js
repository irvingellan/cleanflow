import {
  FieldPath,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import {
  collection as serverCollection, documentId, getDocs as getServerDocs, limit as serverLimit,
  orderBy as serverOrderBy, query as serverQuery, where as serverWhere,
} from "firebase/firestore/lite";
import { db } from "../../services/firebase/client.js";
import { serverFirestore, withReadDeadline } from "../../services/firebase/serverReads.js";
import { isAssignmentAwareJob } from "../jobs/jobCompatibility.js";

import { enrichPayoutAgreements, jobWithPayoutAgreementsInTransaction } from "./payoutAgreements.js";
import { missingAgreementReview, payoutNeedsHoursReview, unpaidPayoutShares } from "./payoutShares.js";

const organizationId = "cleanflow-demo";
const allowedPaymentMethods = ["ZELLE", "VENMO", "CASH", "CHECK", "OTHER"];
const maximumJobsPerPayout = 100;
const maximumPayoutNoteLength = 500;

function payoutsCollection() {
  return collection(db, "organizations", organizationId, "payouts");
}

function jobFromSnapshot(snapshot) {
  return {
    ...snapshot.data(),
    id: snapshot.id,
  };
}

function completionSortValue(job) {
  if (job.completedAt?.toMillis) {
    return job.completedAt.toMillis();
  }

  const scheduledAt = new Date(`${job.scheduledDate || ""}T00:00:00`).getTime();
  return Number.isNaN(scheduledAt) ? 0 : scheduledAt;
}

export function isEligibleForLegacyPayout(job) {
  return !isAssignmentAwareJob(job) && job.operationalStatus === "COMPLETED" && unpaidPayoutShares(job).length > 0;
}

function payoutError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// One-shot server read with a deadline: a full-SDK read on a stalled realtime
// channel (seen on iPhone Safari) could hold the screen for 30 s or more.
export async function getUnpaidCompletedJobs({ includePendingHours = false } = {}) {
  const snapshot = await withReadDeadline(getServerDocs(serverQuery(
    serverCollection(serverFirestore(), "organizations", organizationId, "jobs"),
    serverWhere("operationalStatus", "==", "COMPLETED"),
  )));

  // Legacy Jobs have no payout marker. Keep them eligible until a manager explicitly
  // records a payout; some also have no completedAt, so do not order them out of the query.
  const candidates = snapshot.docs.map(jobFromSnapshot).filter(job => !job.archivedAt && !job.payoutId && !job.payoutPaidAt);
  const jobs = await enrichPayoutAgreements(candidates, { organizationId });
  return jobs.filter(job => job.operationalStatus === "COMPLETED" &&
    (unpaidPayoutShares(job).length > 0 || (includePendingHours && (payoutNeedsHoursReview(job) || missingAgreementReview(job)))))
    .sort((firstJob, secondJob) => completionSortValue(secondJob) - completionSortValue(firstJob));
}

export async function getRecentPayouts() {
  const snapshot = await withReadDeadline(getServerDocs(serverQuery(
    serverCollection(serverFirestore(), "organizations", organizationId, "payouts"),
    serverOrderBy("paidAt", "desc"),
    serverLimit(20),
  )));

  return snapshot.docs.map(jobFromSnapshot);
}

/** Read all reciprocal payment proof, without the recent-payments directory cap. */
export async function getPayoutEvidenceForJobs(jobs) {
  const jobIds = [...new Set(jobs.map(job => job.id).filter(Boolean))];
  const payoutIds = [...new Set(jobs.flatMap(job => [job.payoutId, ...Object.values(job.payoutIdsByCleaner ?? {})]).filter(id => typeof id === "string" && id.trim()))];
  if (jobIds.length === 0 && payoutIds.length === 0) return [];
  const payouts = serverCollection(serverFirestore(), "organizations", organizationId, "payouts");
  const reads = [];
  for (let index = 0; index < jobIds.length; index += 30) {
    reads.push(getServerDocs(serverQuery(payouts, serverWhere("jobIds", "array-contains-any", jobIds.slice(index, index + 30)))));
  }
  for (let index = 0; index < payoutIds.length; index += 30) {
    reads.push(getServerDocs(serverQuery(payouts, serverWhere(documentId(), "in", payoutIds.slice(index, index + 30)))));
  }
  const snapshots = await Promise.all(reads);
  // Preserve repeated reads so the model detects contradictory evidence.
  return snapshots.flatMap(snapshot => snapshot.docs.map(jobFromSnapshot));
}

export async function recordPayout({ cleaner, jobIds, paymentMethod, note }) {
  const uniqueJobIds = [...new Set(jobIds.filter(Boolean))];
  const normalizedNote = typeof note === "string" ? note.trim() : "";

  if (!cleaner?.id) {
    throw payoutError("missing-cleaner", "A cleaner is required.");
  }

  if (uniqueJobIds.length === 0) {
    throw payoutError("missing-jobs", "Select at least one job.");
  }

  if (uniqueJobIds.length > maximumJobsPerPayout) {
    throw payoutError("too-many-jobs", "Too many jobs selected for one payout.");
  }

  if (!allowedPaymentMethods.includes(paymentMethod)) {
    throw payoutError("invalid-payment-method", "Choose a valid payment method.");
  }

  if (normalizedNote.length > maximumPayoutNoteLength) {
    throw payoutError("note-too-long", "Keep the payout note short.");
  }

  const payoutReference = doc(payoutsCollection());
  const jobReferences = uniqueJobIds.map((jobId) =>
    doc(db, "organizations", organizationId, "jobs", jobId),
  );
  let recordedAmount = 0;

  const settle = () => runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(
      jobReferences.map((jobReference) => transaction.get(jobReference)),
    );
    const jobs = await Promise.all(snapshots.map((snapshot, index) =>
      jobWithPayoutAgreementsInTransaction(transaction, jobReferences[index], jobFromSnapshot(snapshot), cleaner.id)));

    const allocations = jobs.map(job => {
      const share = unpaidPayoutShares(job).find(({ cleanerId }) => cleanerId === cleaner.id);
      if (job.operationalStatus !== "COMPLETED" || !share) {
        throw payoutError("job-not-payable", "One or more jobs are no longer payable.");
      }
      return [job.id, share.cents];
    });
    const jobAmountsCents = Object.fromEntries(allocations);
    const amount = allocations.reduce((sum, [, cents]) => sum + cents, 0) / 100;
    recordedAmount = amount;
    const payout = {
      organizationId,
      cleanerId: cleaner.id,
      cleanerNameSnapshot: cleaner.name || "",
      jobIds: uniqueJobIds,
      jobAmountsCents,
      amount,
      paymentMethod,
      status: "PAID",
      createdAt: serverTimestamp(),
      paidAt: serverTimestamp(),
      note: normalizedNote,
    };

    if (cleaner.paymentContact) {
      payout.paymentContactSnapshot = cleaner.paymentContact;
    }

    transaction.set(payoutReference, payout);
    jobReferences.forEach((jobReference, index) => {
      const job = jobs[index];
      if (isAssignmentAwareJob(job)) {
        // Add one key so a stale transaction retries instead of failing the Rules' paid-share check.
        transaction.update(jobReference, new FieldPath("payoutIdsByCleaner", cleaner.id), payoutReference.id);
        return;
      }
      transaction.update(jobReference, {
        payoutId: payoutReference.id,
        payoutPaidAt: serverTimestamp(),
      });
    });
  });

  try {
    await settle();
  } catch (error) {
    // Rules reject a stale write over a paid share before the transaction can retry.
    if (error?.code !== "permission-denied") throw error;
    const current = await runTransaction(db, (transaction) =>
      Promise.all(jobReferences.map((jobReference) => transaction.get(jobReference))));
    if (current.some((snapshot) => snapshot.data()?.payoutIdsByCleaner?.[cleaner.id])) {
      throw payoutError("job-not-payable", "One or more jobs are no longer payable.");
    }
    throw error;
  }

  return {
    id: payoutReference.id,
    amount: recordedAmount,
    jobIds: uniqueJobIds,
  };
}
