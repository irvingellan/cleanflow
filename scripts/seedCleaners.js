import { deleteApp, initializeApp } from "firebase/app";
import { doc, getFirestore, writeBatch } from "firebase/firestore";
import { loadEnv } from "vite";
import { createFirebaseConfig } from "../src/services/firebase/config.js";

const cleaners = [
  { id: "agnes", name: "Agnes" },
  { id: "eloisa", name: "Eloisa" },
  { id: "carla", name: "Carla" },
  { id: "erika", name: "Erika" },
  { id: "mary", name: "Mary" },
  { id: "mayara", name: "Mayara" },
  { id: "douglas", name: "Douglas" },
  { id: "ingrid", name: "Ingrid" },
];

async function seedCleaners() {
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

  const firebaseApp = initializeApp(firebaseConfig, "cleaners-seed");
  const db = getFirestore(firebaseApp);

  try {
    const batch = writeBatch(db);

    for (const cleaner of cleaners) {
      batch.set(
        doc(
          db,
          "organizations",
          "cleanflow-demo",
          "cleaners",
          cleaner.id,
        ),
        {
          name: cleaner.name,
          active: true,
          organizationId: "cleanflow-demo",
        },
      );
    }

    await batch.commit();
    console.log(`Seeded ${cleaners.length} cleaners.`);
  } finally {
    await deleteApp(firebaseApp);
  }
}

seedCleaners().catch((error) => {
  console.error("Unable to seed cleaners:", error.message);
  process.exitCode = 1;
});
