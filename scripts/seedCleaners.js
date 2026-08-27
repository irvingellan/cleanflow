import { deleteApp, initializeApp } from "firebase/app";
import { doc, getFirestore, writeBatch } from "firebase/firestore";
import { loadEnv } from "vite";
import { createFirebaseConfig } from "../src/services/firebase/config.js";

// Public-repository fixtures are intentionally fictional.
const cleaners = [
  { id: "demo-alex", name: "Alex Rivera" },
  { id: "demo-jordan", name: "Jordan Lee" },
  { id: "demo-sam", name: "Sam Morgan" },
  { id: "demo-taylor", name: "Taylor Kim" },
  { id: "demo-casey", name: "Casey Patel" },
  { id: "demo-riley", name: "Riley Chen" },
  { id: "demo-morgan", name: "Morgan Brooks" },
  { id: "demo-jamie", name: "Jamie Santos" },
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
        doc(db, "organizations", "cleanflow-demo", "cleaners", cleaner.id),
        {
          name: cleaner.name,
          active: true,
          organizationId: "cleanflow-demo",
          fixture: true,
        },
      );
    }

    await batch.commit();
    console.log(`Seeded ${cleaners.length} fictional demo cleaners.`);
  } finally {
    await deleteApp(firebaseApp);
  }
}

seedCleaners().catch((error) => {
  console.error("Unable to seed cleaners:", error.message);
  process.exitCode = 1;
});
