import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const createChecklistRunCall = httpsCallable(functions, "createChecklistRun");
const getChecklistRunCall = httpsCallable(functions, "getChecklistRun");

export async function getChecklistRun(jobId) {
  const result = await getChecklistRunCall({ jobId });
  return result.data?.run || null;
}

export async function createChecklistRun(jobId) {
  const result = await createChecklistRunCall({ jobId });
  return result.data?.run || null;
}
