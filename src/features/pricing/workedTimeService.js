import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

export async function approveWorkedTime(jobId, assignmentId, minutes) {
  const { data } = await httpsCallable(functions, "approveWorkedTime", { timeout: 15_000 })({ jobId, assignmentId, minutes });
  return data;
}

export async function removeWorkedTimeApproval(jobId, assignmentId) {
  const { data } = await httpsCallable(functions, "removeWorkedTimeApproval", { timeout: 15_000 })({ jobId, assignmentId });
  return data;
}
