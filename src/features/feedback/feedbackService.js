import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import {
  firebaseApp,
  useFirebaseEmulators,
} from "../../services/firebase/client.js";

const functions = getFunctions(firebaseApp, "us-central1");

if (useFirebaseEmulators) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

const submitFeedbackCall = httpsCallable(functions, "submitFeedback");

export async function submitFeedback(feedback) {
  const result = await submitFeedbackCall(feedback);
  return result.data;
}
