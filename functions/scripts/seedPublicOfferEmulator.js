import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = "demo-cleanflow";
const organizationId = "cleanflow-demo";
const managerEmail = "manager@cleanflow.test";
const managerPassword = "CleanFlowEmulatorOnly123!";
const expiredToken = "RGUr6XhV3z9ZZ6_Ap_WmQbYVbS5VT7loTrAp66wdnJw";

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function requireEmulators() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "This seed is emulator-only. Set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.",
    );
  }

  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
    throw new Error(`This seed requires the ${projectId} demo project.`);
  }
}

function jobData({ propertyId, propertyName, scheduledDate }) {
  return {
    organizationId,
    propertyId,
    propertyName,
    clientName: "Emulator Demo Client",
    scheduledDate,
    clientPrice: 275,
    cleanerPayout: 150,
    notes: "EMULATOR FIXTURE - manager-only note",
    operationalStatus: "OFFERED",
    createdAt: Timestamp.now(),
    offeredAt: Timestamp.now(),
  };
}

function offerData({ jobId, cleanerId, cleanerName, expiresAt = null }) {
  const data = {
    jobId,
    cleanerId,
    cleanerName,
    status: "PENDING",
    createdAt: Timestamp.now(),
  };

  if (expiresAt) {
    data.publicOfferTokenHash = hashToken(expiredToken);
    data.publicOfferExpiresAt = expiresAt;
  }

  return data;
}

async function ensureManager(auth) {
  try {
    return await auth.getUserByEmail(managerEmail);
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw error;
    }

    return auth.createUser({
      email: managerEmail,
      password: managerPassword,
      emailVerified: true,
    });
  }
}

async function seedPublicOfferEmulator() {
  requireEmulators();

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ projectId }, "public-offer-emulator-seed");
  const auth = getAuth(app);
  const db = getFirestore(app);
  const jobs = db.collection("organizations").doc(organizationId).collection("jobs");
  const expiredAt = Timestamp.fromMillis(Date.now() - 60_000);
  const fixtures = [
    {
      jobId: "public-offer-emulator-interested",
      propertyId: "emulator-interested-condo",
      propertyName: "Emulator Test Condo — Interested",
      scheduledDate: "2026-08-27",
      cleanerId: "emulator-cleaner-interested",
      cleanerName: "Emulator Cleaner Interested",
    },
    {
      jobId: "public-offer-emulator-declined",
      propertyId: "emulator-declined-condo",
      propertyName: "Emulator Test Condo — Declined",
      scheduledDate: "2026-08-28",
      cleanerId: "emulator-cleaner-declined",
      cleanerName: "Emulator Cleaner Declined",
    },
    {
      jobId: "public-offer-emulator-expired",
      propertyId: "emulator-expired-condo",
      propertyName: "Emulator Test Condo — Expired",
      scheduledDate: "2026-08-29",
      cleanerId: "emulator-cleaner-expired",
      cleanerName: "Emulator Cleaner Expired",
      expiresAt: expiredAt,
    },
  ];

  await ensureManager(auth);

  const batch = db.batch();

  for (const fixture of fixtures) {
    const job = jobs.doc(fixture.jobId);

    batch.set(job, jobData(fixture));
    batch.set(
      job.collection("offers").doc(fixture.cleanerId),
      offerData(fixture),
    );
  }

  await batch.commit();

  console.log(`Seeded ${fixtures.length} public-offer emulator Jobs.`);
  console.log(`Manager email: ${managerEmail}`);
  console.log(`Manager password: ${managerPassword}`);
  console.log(`Expired offer URL: http://127.0.0.1:5000/offer/${expiredToken}`);
}

seedPublicOfferEmulator().catch((error) => {
  console.error("Unable to seed public-offer emulator fixtures:", error.message);
  process.exitCode = 1;
});
