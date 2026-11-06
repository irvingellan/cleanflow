import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../../services/firebase/client.js";
import { rosterCleanerIds } from "./offerSlots.js";

// Section 12: the manager records that she sent a cleaner reminder herself
// (WhatsApp or copy). Copying or opening WhatsApp is never treated as proof.
// A record belongs to one schedule revision: after a time change the reminder
// is pending again.

const organizationId = "cleanflow-demo";

function scheduleRevision(job) {
  return Number.isInteger(job?.scheduleRevision) && job.scheduleRevision >= 0 ? job.scheduleRevision : 0;
}

/** "sent" only when the record matches the Job's current schedule. */
export function cleanerReminderState(job, cleanerId) {
  const record = job?.cleanerReminders?.[cleanerId];
  if (!record || typeof record !== "object") return { state: "pending" };
  if (record.scheduleRevision !== scheduleRevision(job)) return { state: "pending", stale: true };
  return { state: "sent", sentAt: record.sentAt || null, byUid: record.byUid || null };
}

/** Summary for one Job: null when no cleaner is on it yet. */
export function jobReminderState(job) {
  const cleaners = rosterCleanerIds(job);
  if (!cleaners.length || !["ASSIGNED", "IN_PROGRESS"].includes(job?.operationalStatus)) return null;
  return cleaners.every((cleanerId) => cleanerReminderState(job, cleanerId).state === "sent") ? "sent" : "pending";
}

export async function markCleanerReminderSent(jobId, cleanerId, actorUid) {
  if (typeof cleanerId !== "string" || !cleanerId || typeof actorUid !== "string" || !actorUid) {
    throw new Error("A cleaner and the signed-in manager are required.");
  }
  const reference = doc(db, "organizations", organizationId, "jobs", jobId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("Job not found.");
    const job = snapshot.data();
    if (!rosterCleanerIds(job).includes(cleanerId)) throw new Error("This cleaner is no longer on the job.");
    transaction.update(reference, {
      [`cleanerReminders.${cleanerId}`]: {
        sentAt: serverTimestamp(), byUid: actorUid, scheduleRevision: scheduleRevision(job),
      },
    });
  });
}
