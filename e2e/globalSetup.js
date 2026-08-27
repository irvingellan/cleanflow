import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = "demo-cleanflow";
const organizationId = "cleanflow-demo";

export const e2eManager = {
  email: "manager@cleanflow.e2e",
  password: "CleanFlowE2EOnly123!",
};

function requireLocalEmulators() {
  const allowedFirestoreHosts = new Set(["127.0.0.1:8080", "localhost:8080"]);
  const allowedAuthHosts = new Set(["127.0.0.1:9099", "localhost:9099"]);

  if (
    !allowedFirestoreHosts.has(process.env.FIRESTORE_EMULATOR_HOST) ||
    !allowedAuthHosts.has(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    process.env.GCLOUD_PROJECT !== projectId
  ) {
    throw new Error(
      "CleanFlow E2E fixtures require local demo-cleanflow Auth and Firestore emulators.",
    );
  }
}

function localDateKey(daysFromToday) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

async function ensureManager(auth) {
  try {
    return await auth.getUserByEmail(e2eManager.email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw error;
    }

    return auth.createUser({
      email: e2eManager.email,
      password: e2eManager.password,
      emailVerified: true,
    });
  }
}

export default async function seedE2eFixtures() {
  requireLocalEmulators();

  const app = getApps()[0] || initializeApp({ projectId }, "cleanflow-e2e");
  const auth = getAuth(app);
  const db = getFirestore(app);
  await ensureManager(auth);

  const organization = db.collection("organizations").doc(organizationId);
  const now = Timestamp.now();
  const cleaner = {
    name: "E2E Cleaner",
    active: true,
    organizationId,
    createdAt: now,
    updatedAt: now,
  };
  const properties = [
    ["e2e-needs-assignment-property", "E2E Needs Assignment Property"],
    ["e2e-assigned-property", "E2E Assigned Property"],
    ["e2e-in-progress-property", "E2E In Progress Property"],
    ["e2e-completed-property", "E2E Completed Property"],
  ].map(([id, name]) => [id, {
    name,
    clientName: "E2E Test Client",
    active: true,
    organizationId,
    defaultClientPrice: 250,
    defaultCleanerPrice: 150,
    createdAt: now,
    updatedAt: now,
  }]);
  const sharedJobData = {
    organizationId,
    clientName: "E2E Test Client",
    clientPrice: 250,
    cleanerPayout: 150,
    notes: "E2E fixture only",
    createdAt: now,
  };
  const jobs = [
    [
      "e2e-needs-assignment",
      {
        ...sharedJobData,
        propertyId: "e2e-needs-assignment-property",
        propertyName: "E2E Needs Assignment Property",
        scheduledDate: localDateKey(1),
        operationalStatus: "UNASSIGNED",
      },
    ],
    [
      "e2e-assigned",
      {
        ...sharedJobData,
        propertyId: "e2e-assigned-property",
        propertyName: "E2E Assigned Property",
        scheduledDate: localDateKey(2),
        assignedCleanerId: "e2e-cleaner",
        assignedCleanerName: cleaner.name,
        assignedAt: now,
        operationalStatus: "ASSIGNED",
      },
    ],
    [
      "e2e-in-progress",
      {
        ...sharedJobData,
        propertyId: "e2e-in-progress-property",
        propertyName: "E2E In Progress Property",
        scheduledDate: localDateKey(0),
        assignedCleanerId: "e2e-cleaner",
        assignedCleanerName: cleaner.name,
        assignedAt: now,
        startedAt: now,
        operationalStatus: "IN_PROGRESS",
      },
    ],
    [
      "e2e-completed",
      {
        ...sharedJobData,
        propertyId: "e2e-completed-property",
        propertyName: "E2E Completed Property",
        scheduledDate: localDateKey(-1),
        assignedCleanerId: "e2e-cleaner",
        assignedCleanerName: cleaner.name,
        assignedAt: now,
        startedAt: now,
        completedAt: now,
        operationalStatus: "COMPLETED",
      },
    ],
  ];
  const batch = db.batch();

  batch.set(organization.collection("cleaners").doc("e2e-cleaner"), cleaner);
  properties.forEach(([propertyId, property]) => {
    batch.set(organization.collection("properties").doc(propertyId), property);
  });
  jobs.forEach(([jobId, job]) => {
    batch.set(organization.collection("jobs").doc(jobId), job);
  });
  await batch.commit();
}
