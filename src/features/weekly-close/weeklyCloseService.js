import { getServiceWeekJobs } from "../jobs/jobService.js";
import { getAssignedCleanerIds } from "../jobs/jobCompatibility.js";
import { getPayoutEvidenceForJobs, isEligibleForLegacyPayout } from "../payouts/payoutService.js";
import { getClients } from "../clients/clientService.js";
import { getProperties } from "../properties/propertyService.js";
import { getCleanerNamesById } from "../cleaners/cleanerService.js";
import { buildWeeklyClose, serviceWeekForDate } from "./weeklyCloseModel.js";

/** Read-only adapter; existing manager rules protect every source collection. */
export async function loadWeeklyClose(weekStart) {
  const week = serviceWeekForDate(weekStart);
  const [jobs, clients, properties] = await Promise.all([
    getServiceWeekJobs(week),
    getClients({ includeArchived: true }),
    getProperties({ includeArchived: true }),
  ]);
  const completedJobs = jobs.filter((job) => job.operationalStatus === "COMPLETED"
    && !job.archivedAt && job.dataProvenance === "REAL");
  const cleanerIds = completedJobs.flatMap((job) => [
    ...getAssignedCleanerIds(job), job.assignedCleanerId,
  ]).filter(Boolean);
  const [payouts, cleanerNamesById] = await Promise.all([
    getPayoutEvidenceForJobs(completedJobs),
    getCleanerNamesById(cleanerIds),
  ]);
  return buildWeeklyClose({
    weekStart: week.start,
    organizationId: "cleanflow-demo",
    jobs: jobs.map((job) => ({ ...job, legacyPayoutEligible: isEligibleForLegacyPayout(job) })),
    payouts,
    clients: clients.map(({ id, name }) => ({ id, name })),
    properties: properties.map(({ id, name, clientId }) => ({ id, name, clientId })),
    cleanerNamesById,
  });
}
