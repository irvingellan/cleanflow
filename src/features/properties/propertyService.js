import { addDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

function propertiesCollection() {
  return collection(db, "organizations", organizationId, "properties");
}

export async function getProperties() {
  const snapshot = await getDocs(propertiesCollection());

  return snapshot.docs.map((propertyDocument) => ({
    ...propertyDocument.data(),
    id: propertyDocument.id,
  }));
}

export async function createProperty({
  name,
  clientName,
  defaultClientPrice,
  defaultCleanerPrice,
  active,
}) {
  const property = {
    name,
    clientName,
    active,
    organizationId,
  };

  if (defaultClientPrice !== undefined) {
    property.defaultClientPrice = defaultClientPrice;
  }

  if (defaultCleanerPrice !== undefined) {
    property.defaultCleanerPrice = defaultCleanerPrice;
  }

  const reference = await addDoc(propertiesCollection(), property);

  return { id: reference.id, ...property };
}
