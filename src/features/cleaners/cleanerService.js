import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

export async function getCleaners() {
  const cleanersQuery = query(
    collection(db, "organizations", organizationId, "cleaners"),
    where("active", "==", true),
  );
  const snapshot = await getDocs(cleanersQuery);

  return snapshot.docs.map((cleanerDocument) => ({
    ...cleanerDocument.data(),
    id: cleanerDocument.id,
  }));
}
