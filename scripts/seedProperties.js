import { deleteApp, initializeApp } from "firebase/app";
import { doc, getFirestore, writeBatch } from "firebase/firestore";
import { loadEnv } from "vite";
import { createFirebaseConfig } from "../src/services/firebase/config.js";

// Fictional portfolio/demo data only. These names are not real customer properties.
const properties = [
  {
    id: "harbor-loft",
    data: {
      name: "Harbor Loft",
      clientName: "Northstar Stays",
      defaultClientPrice: 350,
      defaultCleanerPrice: 200,
      active: true,
      organizationId: "cleanflow-demo",
      fixture: true,
    },
  },
  {
    id: "cedar-house",
    data: {
      name: "Cedar House",
      clientName: "Northstar Stays",
      defaultClientPrice: 200,
      defaultCleanerPrice: 100,
      active: true,
      organizationId: "cleanflow-demo",
      fixture: true,
    },
  },
  {
    id: "sunset-bungalow",
    data: {
      name: "Sunset Bungalow",
      clientName: "Northstar Stays",
      defaultClientPrice: 275,
      defaultCleanerPrice: 150,
      active: true,
      organizationId: "cleanflow-demo",
      fixture: true,
    },
  },
  {
    id: "canyon-retreat",
    data: {
      name: "Canyon Retreat",
      clientName: "Bluebird Rentals",
      defaultClientPrice: 400,
      defaultCleanerPrice: 220,
      active: true,
      organizationId: "cleanflow-demo",
      fixture: true,
    },
  },
  {
    id: "palm-cottage",
    data: {
      name: "Palm Cottage",
      clientName: "Coastal Key Management",
      defaultClientPrice: 325,
      defaultCleanerPrice: 180,
      active: true,
      organizationId: "cleanflow-demo",
      fixture: true,
    },
  },
];

async function seedProperties() {
  const environment = loadEnv("development", process.cwd());
  const firebaseConfig = createFirebaseConfig(environment);
  const missingConfigValues = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingConfigValues.length > 0) {
    throw new Error(
      `Missing Firebase configuration values: ${missingConfigValues.join(", ")}`,
    );
  }

  const firebaseApp = initializeApp(firebaseConfig, "properties-seed");
  const db = getFirestore(firebaseApp);

  try {
    const batch = writeBatch(db);

    for (const property of properties) {
      batch.set(
        doc(db, "organizations", "cleanflow-demo", "properties", property.id),
        property.data,
      );
    }

    await batch.commit();
    console.log(`Seeded ${properties.length} fictional demo properties.`);
  } finally {
    await deleteApp(firebaseApp);
  }
}

seedProperties().catch((error) => {
  console.error("Unable to seed properties:", error.message);
  process.exitCode = 1;
});
