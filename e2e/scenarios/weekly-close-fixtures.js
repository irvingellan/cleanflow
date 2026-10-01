import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getE2eFirestore } from "../globalSetup.js";

const organizationId = "cleanflow-demo";

function requireLocalDemoEmulators() {
  if (
    process.env.GCLOUD_PROJECT !== "demo-cleanflow" ||
    !["127.0.0.1:8080", "localhost:8080"].includes(process.env.FIRESTORE_EMULATOR_HOST) ||
    !["127.0.0.1:9099", "localhost:9099"].includes(process.env.FIREBASE_AUTH_EMULATOR_HOST)
  ) {
    throw new Error("Weekly Close fixtures require isolated local demo-cleanflow emulators.");
  }
}

/** Synthetic REAL classification tests import eligibility, not real customer data. */
export async function seedWeeklyCloseFixture(testInfo) {
  requireLocalDemoEmulators();
  const db = getE2eFirestore();
  const orgRef = db.collection("organizations").doc(organizationId);
  const prefix = `weekly-close-${testInfo.repeatEachIndex}-${randomUUID().slice(0, 8)}`;
  const cleanerId = `${prefix}-cleaner`;
  const clients = ["Alpha", "Beta", "Gamma"].map((name) => ({
    id: `${prefix}-client-${name.toLowerCase()}`, name: `Weekly Client ${name}`,
  }));
  const now = Timestamp.fromDate(new Date("2026-09-28T12:00:00Z"));
  const metadata = { organizationId, dataProvenance: "REAL", createdAt: now, updatedAt: now };
  const rows = [
    ["paid", "Weekly paid service", 0, "2026-09-21", 200, 100],
    ["outstanding", "Weekly outstanding service", 0, "2026-09-22", 180, 80],
    ["v2", "Weekly v2 service", 1, "2026-09-23", 240, 120],
    ["grouped", "Weekly grouped service", 1, "2026-09-24", 140, 70],
    ["missing-charge", "Weekly missing charge service", 2, "2026-09-25", undefined, 90],
    ["missing-payout", "Weekly missing payout service", 2, "2026-09-27", 110, undefined],
    ["archive", "Excluded archived service", 0, "2026-09-24", 900, 400],
    ["incomplete", "Excluded unfinished service", 0, "2026-09-24", 800, 350],
    ["unknown", "Excluded unknown provenance", 0, "2026-09-24", 700, 300],
    ["demo", "Excluded demo provenance", 0, "2026-09-24", 600, 250],
    ["before", "Outside previous Sunday", 1, "2026-09-20", 90, 40],
    ["after", "Outside following Monday", 1, "2026-09-28", 100, 50],
  ];
  const jobRefs = [];
  const propertyRefs = [];
  const batch = db.batch();
  for (const client of clients) {
    batch.set(orgRef.collection("clients").doc(client.id), { ...metadata, ...client, active: true });
  }
  batch.set(orgRef.collection("cleaners").doc(cleanerId), {
    ...metadata, name: "Weekly Scenario Cleaner", active: true, preferredLanguage: "en",
  });
  for (const [key, name, clientIndex, scheduledDate, clientPrice, cleanerPayout] of rows) {
    const client = clients[clientIndex];
    const propertyRef = orgRef.collection("properties").doc(`${prefix}-property-${key}`);
    const jobRef = orgRef.collection("jobs").doc(`${prefix}-job-${key}`);
    propertyRefs.push(propertyRef);
    jobRefs.push(jobRef);
    batch.set(propertyRef, {
      ...metadata, name, clientId: client.id, clientName: client.name, active: true,
    });
    const job = {
      ...metadata,
      propertyId: propertyRef.id, propertyName: name,
      clientId: client.id, clientName: client.name,
      scheduledDate, scheduledStart: "11:00", operationalStatus: "COMPLETED",
      completedAt: now, assignedCleanerId: cleanerId, assignedCleanerName: "Weekly Scenario Cleaner",
      ...(clientPrice === undefined ? {} : { clientPrice }),
      ...(cleanerPayout === undefined ? {} : { cleanerPayout }),
    };
    if (key === "paid") {
      job.payoutId = `${prefix}-payout-paid`;
      job.payoutPaidAt = now;
    }
    if (key === "grouped" || key === "before") {
      job.payoutId = `${prefix}-payout-grouped`;
      job.payoutPaidAt = now;
    }
    if (key === "v2") {
      job.schemaVersion = 2;
      job.assignedCleanerIds = [cleanerId];
      delete job.assignedCleanerId;
      delete job.assignedCleanerName;
    }
    if (key === "archive") job.archivedAt = now;
    if (key === "incomplete") job.operationalStatus = "ASSIGNED";
    if (key === "unknown") job.dataProvenance = "UNKNOWN";
    if (key === "demo") job.dataProvenance = "DEMO";
    batch.set(jobRef, job);
  }
  const payouts = [
    { id: `${prefix}-payout-paid`, jobIds: [`${prefix}-job-paid`], amount: 100 },
    { id: `${prefix}-payout-grouped`, jobIds: [`${prefix}-job-grouped`, `${prefix}-job-before`], amount: 110 },
  ];
  const payoutRefs = payouts.map(({ id }) => orgRef.collection("payouts").doc(id));
  payouts.forEach((payout, index) => batch.set(payoutRefs[index], {
    ...metadata, ...payout, cleanerId, cleanerNameSnapshot: "Weekly Scenario Cleaner",
    status: "PAID", paymentMethod: "CASH", paidAt: now,
  }));
  await batch.commit();
  return { db, orgRef, prefix, clients, cleanerId, jobRefs, propertyRefs, payoutRefs };
}

export async function weeklyCloseDomainSnapshot(fixture) {
  requireLocalDemoEmulators();
  const snapshots = await fixture.db.getAll(...fixture.jobRefs, ...fixture.payoutRefs);
  return snapshots.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
}

export async function cleanupWeeklyCloseFixture(fixture) {
  if (!fixture) return;
  requireLocalDemoEmulators();
  const refs = [
    ...fixture.jobRefs, ...fixture.propertyRefs, ...fixture.payoutRefs,
    ...fixture.clients.map(({ id }) => fixture.orgRef.collection("clients").doc(id)),
    fixture.orgRef.collection("cleaners").doc(fixture.cleanerId),
  ];
  const batch = fixture.db.batch();
  refs.forEach((ref) => batch.delete(ref));
  await batch.commit();
}
