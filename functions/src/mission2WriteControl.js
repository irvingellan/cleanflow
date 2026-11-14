import { HttpsError } from "firebase-functions/v2/https";

const controlPath = "cleanflowReleaseControl/mission2Writers";

/** Read in the same transaction as the operational mutation. */
export async function requireMission2Writes(transaction, database) {
  const control = await transaction.get(database.doc(controlPath));
  if (control.exists && control.data()?.mode !== "active") {
    throw new HttpsError("failed-precondition", "Offer and schedule changes are temporarily paused.", {
      reason: "mission2-paused",
    });
  }
}

export function hasMission2JobState(job) {
  return ["automaticOfferBatch", "scheduleConfirmation", "manualReplacementOffer"]
    .some(field => Object.hasOwn(job, field));
}
