import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeDataProvenance } from "../src/lib/dataProvenance.js";

const [projectFlag, projectId, acknowledgement] = process.argv.slice(2);

if (projectFlag !== "--project" || !projectId) {
  throw new Error("Usage: node scripts/inventoryData.mjs --project <project-id> [--allow-production-read]");
}

if (projectId === "clean-flow-prototipo" && acknowledgement !== "--allow-production-read") {
  throw new Error("Production inventory requires the explicit --allow-production-read acknowledgement.");
}

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault(), projectId });
}

const db = getFirestore();
const entityNames = ["properties", "jobs", "cleaners", "clients"];

for (const entityName of entityNames) {
  const snapshot = await db.collection("organizations").doc("cleanflow-demo").collection(entityName).get();
  const counts = { REAL: 0, DEMO: 0, UNKNOWN: 0, legacyDemoMarkers: 0 };
  snapshot.docs.forEach((document) => {
    const data = document.data();
    counts[normalizeDataProvenance(data)] += 1;
    if (data.demoSeed === true || data.fixture === true || data.demoSeedBatch || data.demoSeedScenario) counts.legacyDemoMarkers += 1;
  });
  console.log(`${entityName[0].toUpperCase()}${entityName.slice(1)}:`);
  console.log(`  REAL: ${counts.REAL}`);
  console.log(`  DEMO: ${counts.DEMO}`);
  console.log(`  UNKNOWN: ${counts.UNKNOWN}`);
  console.log(`  Legacy demo markers: ${counts.legacyDemoMarkers}`);
}
