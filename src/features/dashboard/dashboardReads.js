import {
  collection,
  connectFirestoreEmulator,
  documentId,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setLogLevel,
  Timestamp,
  where,
} from "firebase/firestore/lite";
import { emulatorPorts, firebaseApp, useFirebaseEmulators } from "../../services/firebase/client.js";
import { cleanerLookupBatches } from "../cleaners/cleanerLookupBatches.js";
import { managerDecisionOf } from "../jobs/offerSlots.js";

// Dashboard queries are one-shot server reads. Lite shares the Firebase
// app and its Auth provider, without starting queries on the realtime Watch.
// The Lite logger includes request paths and query bodies on some failures.
// App diagnostics capture only the phase, elapsed time and allowlisted code.
setLogLevel("silent");
const db = getFirestore(firebaseApp);
if (useFirebaseEmulators) connectFirestoreEmulator(db, "127.0.0.1", emulatorPorts.firestore);

const organizationId = "cleanflow-demo";
const activeOperationalStatuses = ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS"];

function jobsCollection() {
  return collection(db, "organizations", organizationId, "jobs");
}

function propertiesCollection() {
  return collection(db, "organizations", organizationId, "properties");
}

export function getDashboardCore({ today, endDate, weekStartDate, weekEndDate, weekStart, nextWeekStart }) {
  const jobs = jobsCollection();
  return Promise.all([
    getDocs(propertiesCollection()),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "in", ["UNASSIGNED", "OFFERED"]),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "==", "IN_PROGRESS"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "in", activeOperationalStatuses),
        where("scheduledDate", ">=", today),
        where("scheduledDate", "<=", endDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "==", "COMPLETED"),
        orderBy("completedAt", "desc"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("scheduledDate", ">=", weekStartDate),
        where("scheduledDate", "<=", weekEndDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "==", "COMPLETED"),
        where("completedAt", ">=", Timestamp.fromDate(weekStart)),
        where("completedAt", "<", Timestamp.fromDate(nextWeekStart)),
        orderBy("completedAt", "desc"),
      ),
    ),
  ]);
}

async function readJobRecords(jobId, subcollection, status, max) {
  const records = collection(db, "organizations", organizationId, "jobs", jobId, subcollection);
  const snapshot = await getDocs(query(records, where("status", "==", status), limit(max)));
  return snapshot.docs.map((record) => ({ ...record.data(), id: record.id }));
}

export function getInterestedJobOffers(jobId) {
  return readJobRecords(jobId, "offers", "INTERESTED", 5);
}

export async function getPendingJobOffers(jobId) {
  const pending = await readJobRecords(jobId, "offers", "PENDING", 10);
  // A withdrawn invite is no longer awaiting a reply (FB09).
  return pending.filter((offer) => !managerDecisionOf(offer)).slice(0, 1);
}

export function getOpenJobIssues(jobId) {
  return readJobRecords(jobId, "issues", "OPEN", 3);
}

export async function getCleanerNamesById(cleanerIds) {
  const batches = cleanerLookupBatches(cleanerIds);
  const cleaners = collection(db, "organizations", organizationId, "cleaners");
  const snapshots = await Promise.all(batches.map((batch) => (
    getDocs(query(cleaners, where(documentId(), "in", batch)))
  )));
  return Object.fromEntries(snapshots.flatMap(({ docs }) => (
    docs.map((cleaner) => [cleaner.id, cleaner.data().name])
  )));
}
