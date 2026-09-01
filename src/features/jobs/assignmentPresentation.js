import { currentCleanerName } from "../cleaners/cleanerIdentity.js";
import { getAssignedCleanerIds, isAssignmentAwareJob } from "./jobCompatibility.js";

/** Uses the v2 Job projection outside Job Detail to avoid per-row Assignment reads. */
export function assignedCleanerSummary(job, cleanerNamesById, translate, fallback) {
  if (isAssignmentAwareJob(job)) {
    const count = getAssignedCleanerIds(job).length;

    if (count === 1) {
      return translate("jobs.cleanerAssignedOne", { count });
    }

    if (count > 1) {
      return translate("jobs.cleanersAssignedMany", { count });
    }
  }

  return currentCleanerName(
    job?.assignedCleanerId,
    job?.assignedCleanerName,
    cleanerNamesById,
    fallback,
  );
}
