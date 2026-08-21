import { deleteApp, initializeApp } from "firebase/app";
import { doc, getFirestore, writeBatch } from "firebase/firestore";
import { loadEnv } from "vite";
import { createFirebaseConfig } from "../src/services/firebase/config.js";

const properties = [
  {
    id: "2031-second-ave",
    data: {
      name: "2031 Second Ave",
      clientName: "Carl",
      defaultClientPrice: 350,
      defaultCleanerPrice: 200,
      active: true,
      organizationId: "cleanflow-demo",
    },
  },
  {
    id: "1964-oliver-ave",
    data: {
      name: "1964 Oliver Ave",
      clientName: "Carl",
      defaultClientPrice: 200,
      defaultCleanerPrice: 100,
      active: true,
      organizationId: "cleanflow-demo",
    },
  },
  {
    id: "6816-newbold-ct",
    data: {
      name: "6816 Newbold Ct",
      clientName: "Carl",
      active: true,
      organizationId: "cleanflow-demo",
    },
  },
  {
    id: "8845-echo-drive",
    data: {
      name: "8845 Echo Drive",
      clientName: "Sara",
      active: true,
      organizationId: "cleanflow-demo",
    },
  },
  {
    id: "5548-rylei-st",
    data: {
      name: "5548 Rylei St",
      clientName: "Rafael",
      active: true,
      organizationId: "cleanflow-demo",
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
        doc(
          db,
          "organizations",
          "cleanflow-demo",
          "properties",
          property.id,
        ),
        property.data,
      );
    }

    await batch.commit();
    console.log(`Seeded ${properties.length} properties.`);
  } finally {
    await deleteApp(firebaseApp);
  }
}

seedProperties().catch((error) => {
  console.error("Unable to seed properties:", error.message);
  process.exitCode = 1;
});
