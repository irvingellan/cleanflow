import { FieldValue } from "firebase-admin/firestore";

export function appendJobCorrection(transaction, jobRef, correction) {
  transaction.create(jobRef.collection("corrections").doc(), {
    ...correction,
    at: FieldValue.serverTimestamp(),
  });
}

export function jobHasPayoutMarker(job) {
  return Boolean(job.payoutId || job.payoutPaidAt || Object.keys(job.payoutIdsByCleaner ?? {}).length);
}

export function jobPayoutRecords(transaction, organization, jobId) {
  return transaction.get(organization.collection("payouts").where("jobIds", "array-contains", jobId));
}

export function cleanerWasPaid(job, cleanerId, records) {
  return Boolean(job.payoutId || job.payoutPaidAt || job.payoutIdsByCleaner?.[cleanerId])
    || records.docs.some(doc => {
      const payout = doc.data();
      return !payout.cleanerId || payout.cleanerId === cleanerId;
    });
}
