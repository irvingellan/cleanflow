import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const rescheduleJobCall = httpsCallable(functions, "rescheduleJob");
const createManualReplacementOfferCall = httpsCallable(functions, "createManualReplacementOffer");

export async function rescheduleJob({ jobId, scheduledDate, scheduledStart, expectedScheduleRevision }) {
  const result = await rescheduleJobCall({ jobId, scheduledDate, scheduledStart, expectedScheduleRevision });
  return result.data;
}

export async function createManualReplacementOffer({ jobId, cleanerId, scheduleRevision }) {
  const result = await createManualReplacementOfferCall({ jobId, cleanerId, scheduleRevision });
  return result.data;
}
