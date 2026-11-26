import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../services/firebase/client.js";
import { managerOrganizationId } from "../../services/firebase/config.js";

export async function correctJobPrices(jobId, { clientPricing, reason }) {
  const result = await httpsCallable(functions, "correctJobPrices")({ jobId, clientPricing, reason });
  return result.data;
}

export function subscribeToJobPriceCorrections(jobId, onChange, onError) {
  const reference = collection(db, "organizations", managerOrganizationId, "jobs", jobId, "corrections");
  return onSnapshot(query(reference, orderBy("at", "desc")), { includeMetadataChanges: true }, (snapshot) => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
      onChange(snapshot.docs.map((record) => ({ ...record.data(), id: record.id })));
    }
  }, onError);
}
