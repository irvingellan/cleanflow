import { getServicePeriodJobs } from "../jobs/jobService.js";
import { getAssignedCleanerIds } from "../jobs/jobCompatibility.js";
import { getPayoutEvidenceForJobs, isEligibleForLegacyPayout } from "../payouts/payoutService.js";
import { getClientSummariesById } from "../clients/clientService.js";
import { getPropertySummariesById } from "../properties/propertyService.js";
import { getServerRecordsById } from "../../services/firebase/serverReads.js";
import { buildWeeklyClose, servicePeriod } from "./weeklyCloseModel.js";

const organizationId = "cleanflow-demo";
const contextBatchSize = 30;

async function readContext(values, read, signal) {
  const ids = [...new Set(values.filter((id) => typeof id === "string" && id.length > 0 && !id.includes("/")))];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += contextBatchSize) {
    signal?.throwIfAborted();
    rows.push(...await read(ids.slice(offset, offset + contextBatchSize)));
  }
  return rows;
}

/** Read-only adapter; existing manager rules protect every source collection. */
export async function loadWeeklyClose(period, { signal } = {}) {
  const dates = servicePeriod(period);
  const { jobs, coverage } = await getServicePeriodJobs(dates, { signal });
  signal?.throwIfAborted();
  const completedJobs = jobs.filter((job) => job.operationalStatus === "COMPLETED"
    && (!job.organizationId || job.organizationId === organizationId)
    && !job.archivedAt && job.dataProvenance === "REAL");
  const cleanerIds = completedJobs.flatMap((job) => [
    ...getAssignedCleanerIds(job), job.assignedCleanerId,
  ]).filter(Boolean);
  const [payouts, cleaners, clients, properties] = await Promise.all([
    getPayoutEvidenceForJobs(completedJobs),
    readContext(cleanerIds, (ids) => getServerRecordsById(organizationId, "cleaners", ids), signal),
    readContext(completedJobs.map((job) => job.clientId), getClientSummariesById, signal),
    readContext(completedJobs.map((job) => job.propertyId), getPropertySummariesById, signal),
  ]);
  signal?.throwIfAborted();
  return buildWeeklyClose({
    period: dates, coverage, organizationId,
    jobs: jobs.map((job) => ({ ...job, legacyPayoutEligible: isEligibleForLegacyPayout(job) })),
    payouts, clients, properties,
    cleanerNamesById: Object.fromEntries(cleaners.map((cleaner) => [cleaner.id, cleaner.data().name])),
  });
}
