import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const rescheduleJobCall = httpsCallable(functions, "rescheduleJob");

export async function rescheduleJob({ jobId, scheduledDate, scheduledStart }) {
  const result = await rescheduleJobCall({ jobId, scheduledDate, scheduledStart });
  return result.data;
}
