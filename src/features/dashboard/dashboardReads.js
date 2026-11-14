import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore/lite";
import { getServerRecordsById, serverFirestore } from "../../services/firebase/serverReads.js";
import { cleanerLookupBatches } from "../cleaners/cleanerLookupBatches.js";
import { managerDecisionOf } from "../jobs/offerSlots.js";

const organizationId = "cleanflow-demo";
const activeOperationalStatuses = ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS"];
const maxConcurrentDashboardReads = 4;

export function createDashboardRead(isActive) {
  const pending = new Set();
  let failure;

  // The same budget applies to core queries and later waves. Once an attempt
  // fails or expires, let current reads settle without launching queued reads.
  return async (target) => {
    while (pending.size >= maxConcurrentDashboardReads) await Promise.race(pending);
    if (failure) throw failure.error;
    if (isActive?.() === false) throw new Error("Dashboard load is no longer active");

    const request = Promise.resolve().then(() => getDocs(target));
    const settled = request.then(
      () => pending.delete(settled),
      (error) => {
        failure ??= { error };
        pending.delete(settled);
      },
    );
    pending.add(settled);
    return request;
  };
}

function jobsCollection() {
  return collection(serverFirestore(), "organizations", organizationId, "jobs");
}

function propertiesCollection() {
  return collection(serverFirestore(), "organizations", organizationId, "properties");
}

export function getDashboardCore({ today, endDate, weekStartDate, weekEndDate, weekStart, nextWeekStart }, read) {
  const jobs = jobsCollection();
  return Promise.all([
    read(propertiesCollection()),
    read(
      query(
        jobs,
        where("operationalStatus", "in", ["UNASSIGNED", "OFFERED"]),
      ),
    ),
    read(
      query(
        jobs,
        where("operationalStatus", "==", "IN_PROGRESS"),
      ),
    ),
    read(
      query(
        jobs,
        where("operationalStatus", "in", activeOperationalStatuses),
        where("scheduledDate", ">=", today),
        where("scheduledDate", "<=", endDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    read(
      query(
        jobs,
        where("operationalStatus", "==", "COMPLETED"),
        orderBy("completedAt", "desc"),
      ),
    ),
    read(
      query(
        jobs,
        where("scheduledDate", ">=", weekStartDate),
        where("scheduledDate", "<=", weekEndDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    read(
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

async function readJobRecords(jobId, subcollection, status, max, read) {
  const records = collection(serverFirestore(), "organizations", organizationId, "jobs", jobId, subcollection);
  const snapshot = await read(query(records, where("status", "==", status), limit(max)));
  return snapshot.docs.map((record) => ({ ...record.data(), id: record.id }));
}

export function getInterestedJobOffers(jobId, read = getDocs) {
  return readJobRecords(jobId, "offers", "INTERESTED", 5, read);
}

export async function getPendingJobOffers(jobId, read = getDocs) {
  const pending = await readJobRecords(jobId, "offers", "PENDING", 10, read);
  // A withdrawn invite is no longer awaiting a reply (FB09).
  return pending.filter((offer) => !managerDecisionOf(offer)).slice(0, 1);
}

export function getOpenJobIssues(jobId, read = getDocs) {
  return readJobRecords(jobId, "issues", "OPEN", 3, read);
}

export async function getCleanerNamesById(cleanerIds, read = getDocs) {
  const batches = cleanerLookupBatches(cleanerIds);
  const records = await Promise.all(batches.map((batch) => getServerRecordsById(organizationId, "cleaners", batch, read)));
  return Object.fromEntries(records.flatMap((docs) => (
    docs.map((cleaner) => [cleaner.id, cleaner.data().name])
  )));
}
