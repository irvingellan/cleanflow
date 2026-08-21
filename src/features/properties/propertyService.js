import { collection, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

export async function getProperties() {
  const snapshot = await getDocs(
    collection(db, "organizations", "cleanflow-demo", "properties"),
  );

  return snapshot.docs.map((propertyDocument) => ({
    ...propertyDocument.data(),
    id: propertyDocument.id,
  }));
}
