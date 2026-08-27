import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const submitFeedbackCall = httpsCallable(functions, "submitFeedback");

export async function submitFeedback(feedback) {
  const result = await submitFeedbackCall(feedback);
  return result.data;
}
