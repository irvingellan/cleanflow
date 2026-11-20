import { getJobById, getServicePeriodJobs } from "../jobs/jobService.js";
import { getAssignedCleanerIds } from "../jobs/jobCompatibility.js";
import { getPayoutEvidenceForJobs, isEligibleForLegacyPayout } from "../payouts/payoutService.js";
import { getClientSummariesById } from "../clients/clientService.js";
import { getPropertySummariesById } from "../properties/propertyService.js";
import { getServerRecordsById, withReadDeadline } from "../../services/firebase/serverReads.js";
import { buildWeeklyClose, servicePeriod } from "./weeklyCloseModel.js";
import { currentOrganizationId } from "../../services/organization/currentOrganization.js";

const contextBatchSize = 30;

// A reload can drop a Firestore Lite request before it receives an HTTP
// response. Retry an unavailable server read once within the caller's deadline.
async function readWeeklySource(read, signal) {
  signal?.throwIfAborted();
  try {
    return await read();
  } catch (error) {
    signal?.throwIfAborted();
    // Firebase Lite maps a rejected browser fetch without HTTP status to this
    // specific "unknown" error. Other unknown server failures still surface.
    const noHttpResponse = error?.code === "unknown" && error.message === "Request failed with error: undefined";
    if (error?.code !== "unavailable" && !noHttpResponse) throw error;
    return read();
  }
}

async function readContext(values, read, signal) {
  const ids = [...new Set(values.filter((id) => typeof id === "string" && id.length > 0 && !id.includes("/")))];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += contextBatchSize) {
    const batch = ids.slice(offset, offset + contextBatchSize);
    rows.push(...await readWeeklySource(() => read(batch), signal));
  }
  return rows;
}

// Job Detail requires the current manager record, not the reconciliation projection.
export function loadWeeklyCloseJob(id) {
  return withReadDeadline(getJobById(id, { serverOnly: true }));
}

/** Read-only adapter; existing manager rules protect every source collection. */
export async function loadWeeklyClose(period, { signal } = {}) {
  const dates = servicePeriod(period);
  const { jobs, coverage } = await readWeeklySource(() => getServicePeriodJobs(dates, { signal }), signal);
  signal?.throwIfAborted();
  const completedJobs = jobs.filter((job) => job.operationalStatus === "COMPLETED"
    && (!job.organizationId || job.organizationId === currentOrganizationId())
    && !job.archivedAt && job.dataProvenance === "REAL");
  const cleanerIds = completedJobs.flatMap((job) => [
    ...getAssignedCleanerIds(job), job.assignedCleanerId,
  ]).filter(Boolean);
  const [payouts, cleaners, clients, properties] = await Promise.all([
    readWeeklySource(() => getPayoutEvidenceForJobs(completedJobs), signal),
    readContext(cleanerIds, (ids) => getServerRecordsById(currentOrganizationId(), "cleaners", ids), signal),
    readContext(completedJobs.map((job) => job.clientId), getClientSummariesById, signal),
    readContext(completedJobs.map((job) => job.propertyId), getPropertySummariesById, signal),
  ]);
  signal?.throwIfAborted();
  return buildWeeklyClose({
    period: dates, coverage, organizationId: currentOrganizationId(),
    jobs: jobs.map((job) => ({ ...job, legacyPayoutEligible: isEligibleForLegacyPayout(job) })),
    payouts, clients, properties,
    cleanerNamesById: Object.fromEntries(cleaners.map((cleaner) => [cleaner.id, cleaner.data().name])),
  });
}
