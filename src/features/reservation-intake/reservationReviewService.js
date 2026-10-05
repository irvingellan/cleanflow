import { validateObservation } from "./reservationCandidateModel.js";
import { functions } from "../../services/firebase/client.js";
import { httpsCallable } from "firebase/functions";

export function reviewRequest(row, operation, extra = {}) {
  const observation = Object.fromEntries(["sourceProvider", "sourceType", "sourceId", "sourceAccountExternalId", "sourceListingExternalId",
    "externalReservationId", "sourceEventUid", "sourcePropertyName", "checkIn", "checkOut", "guestName", "timezone",
    "sourceReservationStatus", "observedAt", "sourceUpdatedAt", "sourceSequence"].map(key => [key, row[key] ?? null]));
  validateObservation(observation);
  return { operation, candidateId: row.id, observation, signal: row.conflict ? "CONFLICT" : row.changeType, ...extra };
}

export async function reviewCandidate(row, operation, extra) {
  if (!["sandbox", "emulator"].includes(import.meta.env.MODE)) throw new Error("REVIEW_ENVIRONMENT_DENIED");
  // No client persistence fallback. The server independently checks project and membership.
  const response = await httpsCallable(functions, "reviewReservationIntake", { timeout: 15000 })(reviewRequest(row, operation, extra));
  return response.data;
}
