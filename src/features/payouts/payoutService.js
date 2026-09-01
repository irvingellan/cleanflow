import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";
import { isAssignmentAwareJob } from "../jobs/jobCompatibility.js";

const organizationId = "cleanflow-demo";
const allowedPaymentMethods = ["ZELLE", "VENMO", "CASH", "CHECK", "OTHER"];
const maximumJobsPerPayout = 100;
const maximumPayoutNoteLength = 500;

function jobsCollection() {
  return collection(db, "organizations", organizationId, "jobs");
}

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
  return (
    !isAssignmentAwareJob(job) &&
    job.operationalStatus === "COMPLETED" &&
    Boolean(job.assignedCleanerId) &&
    Number.isFinite(job.cleanerPayout) &&
    job.cleanerPayout > 0 &&
    !job.payoutId
  );
}

function payoutError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function getUnpaidCompletedJobs() {
  const snapshot = await getDocs(
    query(jobsCollection(), where("operationalStatus", "==", "COMPLETED")),
  );

  // Legacy Jobs have no payout marker. Keep them eligible until a manager explicitly
  // records a payout; some also have no completedAt, so do not order them out of the query.
  return snapshot.docs
    .map(jobFromSnapshot)
    .filter(isEligibleForLegacyPayout)
    .sort((firstJob, secondJob) => completionSortValue(secondJob) - completionSortValue(firstJob));
}

export async function getRecentPayouts() {
  const snapshot = await getDocs(
    query(payoutsCollection(), orderBy("paidAt", "desc"), limit(20)),
  );

  return snapshot.docs.map(jobFromSnapshot);
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

  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(
      jobReferences.map((jobReference) => transaction.get(jobReference)),
    );
    const jobs = snapshots.map(jobFromSnapshot);

    for (const job of jobs) {
      if (!isEligibleForLegacyPayout(job) || job.assignedCleanerId !== cleaner.id) {
        // Re-reading every selected Job inside the transaction prevents a completed Job
        // from being included in two payouts when two manager sessions overlap.
        throw payoutError("job-not-payable", "One or more jobs are no longer payable.");
      }
    }

    const amount = jobs.reduce((total, job) => total + job.cleanerPayout, 0);
    recordedAmount = amount;
    const payout = {
      organizationId,
      cleanerId: cleaner.id,
      cleanerNameSnapshot: cleaner.name || "",
      jobIds: uniqueJobIds,
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
    jobReferences.forEach((jobReference) => {
      transaction.update(jobReference, {
        payoutId: payoutReference.id,
        payoutPaidAt: serverTimestamp(),
      });
    });
  });

  return {
    id: payoutReference.id,
    amount: recordedAmount,
    jobIds: uniqueJobIds,
  };
}
