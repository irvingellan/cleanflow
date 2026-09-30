import { checklistCapabilityState } from "../functions/src/checklistCapabilityService.js";
import { normalizeDataProvenance } from "../src/lib/dataProvenance.js";
import { getJobSchemaVersion, isAssignmentAwareJob } from "../src/features/jobs/jobCompatibility.js";

// Read-only compatibility classes for Job record generations. Every output is
// an aggregate count: no document IDs, names, tokens, hashes, or free text.
const openStatuses = new Set(["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS"]);
const openOfferStatuses = new Set(["PENDING", "INTERESTED"]);

function dateOnlyKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function validateAuditDate(today) {
  if (!dateOnlyKey(today)) throw new Error("A valid YYYY-MM-DD audit date is required.");
  return today;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function millis(value) {
  return value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : null);
}

function hasOwn(record, field) {
  return Boolean(record) && Object.prototype.hasOwnProperty.call(record, field);
}

function revisionShape(job) {
  if (!hasOwn(job, "checklistContextRevision")) return "missing";
  return Number.isSafeInteger(job.checklistContextRevision) && job.checklistContextRevision >= 0
    ? "valid"
    : "invalid";
}

function activeAssignments(job) {
  return asArray(job.assignments).filter((assignment) => assignment?.isActive === true);
}

function rosterMatchesActiveAssignments(job) {
  const roster = asArray(job.assignedCleanerIds);
  const active = new Set(activeAssignments(job).map((assignment) => assignment.cleanerId));
  return roster.length === active.size && roster.every((cleanerId) => active.has(cleanerId));
}

function hasSavedEvidence(run) {
  return asArray(run.evidence).some((evidence) => evidence?.status === "SAVED"
    && typeof evidence.contentType === "string" && evidence.contentType.startsWith("image/"));
}

function hasSavedDraft(run) {
  return asArray(run.drafts).some((draft) => Number.isInteger(draft?.revision) && draft.revision > 0);
}

/** Mirrors the deployed server capability state, then names the stale cause. */
function draftLinkState(job, run, now) {
  const capabilities = asArray(run.capabilities);
  const capability = capabilities.find((record) => record?.id === "active") || capabilities[0] || null;
  const state = checklistCapabilityState(capability, job, run, now);
  if (state !== "STALE") return state;
  const revision = revisionShape(job) === "valid" ? job.checklistContextRevision : 0;
  return capability.contextRevision !== revision ? "STALE_REVISION" : "STALE_OTHER";
}

function pastDueRunClass(run) {
  if (!run) return "noRun";
  if (run.status === "READY_FOR_REVIEW") return "readyForReview";
  if (run.status !== "DRAFT") return "otherRun";
  if (hasSavedEvidence(run)) return "draftWithEvidence";
  return hasSavedDraft(run) ? "draftSavedWithoutEvidence" : "draftUntouched";
}

function hasOpenOfferLink(offer, now) {
  const expiresAt = millis(offer?.publicOfferExpiresAt);
  return openOfferStatuses.has(offer?.status) && expiresAt !== null && expiresAt > now.getTime();
}

function increment(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

export function buildCompatibilityAudit({ jobs = [], today, now = new Date() }) {
  validateAuditDate(today);
  const report = {
    today,
    inventory: {
      jobs: jobs.length,
      provenance: { REAL: 0, DEMO: 0, UNKNOWN: 0 },
      realBySchema: { legacyVersionless: 0, singularV1: 0, assignmentAwareV2: 0 },
      realArchived: 0,
      nonRealArchived: 0,
      nonRealOperational: 0,
      nonRealLegacySchema: 0,
    },
    realOperational: {
      jobs: 0,
      byStatus: {},
      completedWithCompletedAt: 0,
      completedWithoutCompletedAt: 0,
      pastDueOpen: 0,
      pastDueByChecklist: {},
      upcomingOpenWithoutRun: 0,
      upcomingOpenScheduleLockedByRun: 0,
      draftRunLinkState: {},
      legacySingularCleaner: 0,
      rosterMismatch: 0,
      assignedWithoutActiveAssignment: 0,
      legacyCleanerFieldOnV2: 0,
      directAssignmentWithOpenSameCleanerOffer: 0,
      missingChecklistContextRevision: 0,
      invalidChecklistContextRevision: 0,
      missingOrArchivedProperty: 0,
    },
    childRecords: {
      realOffers: 0,
      realOffersWithoutCompensationSnapshotV2: 0,
      realOffersWithoutCompensationSnapshotLegacyFallback: 0,
      realActiveAssignments: 0,
      realOfferAssignmentsWithoutSourceField: 0,
      realOfferAssignmentsWithSourceField: 0,
      realManagerDirectAssignments: 0,
      realAssignmentsWithoutSourceOrOffer: 0,
    },
    archived: {
      realWithSubmittedChecklistEvidence: 0,
      realWithOpenOfferLink: 0,
      nonRealOperationalOnArchivedProperty: 0,
    },
    financial: {
      legacyPayoutLinkedJobs: 0,
      realCompletedAssignmentAwareWithoutPayoutPath: 0,
    },
    managerReview: 0,
  };

  for (const job of jobs) {
    const provenance = normalizeDataProvenance(job);
    const schemaVersion = getJobSchemaVersion(job);
    const archived = Boolean(job.archivedAt);
    const runs = asArray(job.checklistRuns);
    const initialRun = runs.find((run) => run?.id === "initial") || runs[0] || null;
    increment(report.inventory.provenance, provenance);
    if (typeof job.payoutId === "string" && job.payoutId) report.financial.legacyPayoutLinkedJobs += 1;

    if (provenance !== "REAL") {
      if (archived) report.inventory.nonRealArchived += 1;
      else {
        report.inventory.nonRealOperational += 1;
        if (job.property?.archived === true) report.archived.nonRealOperationalOnArchivedProperty += 1;
      }
      if (schemaVersion < 2) report.inventory.nonRealLegacySchema += 1;
      continue;
    }

    if (schemaVersion === 0) report.inventory.realBySchema.legacyVersionless += 1;
    else if (schemaVersion === 1) report.inventory.realBySchema.singularV1 += 1;
    else report.inventory.realBySchema.assignmentAwareV2 += 1;

    const offers = asArray(job.offers);
    const assignments = asArray(job.assignments);
    const assignmentAware = isAssignmentAwareJob(job);
    report.childRecords.realOffers += offers.length;
    for (const offer of offers) {
      if (hasOwn(offer, "offeredCompensation")) continue;
      if (assignmentAware) report.childRecords.realOffersWithoutCompensationSnapshotV2 += 1;
      else report.childRecords.realOffersWithoutCompensationSnapshotLegacyFallback += 1;
    }
    for (const assignment of assignments) {
      if (assignment?.isActive === true) report.childRecords.realActiveAssignments += 1;
      if (assignment?.source === "MANAGER_DIRECT") report.childRecords.realManagerDirectAssignments += 1;
      else if (typeof assignment?.sourceOfferId === "string" && assignment.sourceOfferId) {
        if (assignment.source === "OFFER") report.childRecords.realOfferAssignmentsWithSourceField += 1;
        else report.childRecords.realOfferAssignmentsWithoutSourceField += 1;
      } else report.childRecords.realAssignmentsWithoutSourceOrOffer += 1;
    }

    if (archived) {
      report.inventory.realArchived += 1;
      if (runs.some((run) => run.status === "READY_FOR_REVIEW" || hasSavedEvidence(run))) {
        report.archived.realWithSubmittedChecklistEvidence += 1;
        report.managerReview += 1;
      }
      if (offers.some((offer) => hasOpenOfferLink(offer, now))) report.archived.realWithOpenOfferLink += 1;
      continue;
    }

    const operational = report.realOperational;
    let needsReview = false;
    operational.jobs += 1;
    increment(operational.byStatus, job.operationalStatus || "MISSING");

    if (!assignmentAware) {
      operational.legacySingularCleaner += 1;
      needsReview = true;
    }
    const revision = revisionShape(job);
    if (revision === "missing") operational.missingChecklistContextRevision += 1;
    if (revision === "invalid") {
      operational.invalidChecklistContextRevision += 1;
      needsReview = true;
    }
    if (!job.property || job.property.archived === true) {
      operational.missingOrArchivedProperty += 1;
      needsReview = true;
    }
    if (assignmentAware) {
      if (!rosterMatchesActiveAssignments(job)) {
        operational.rosterMismatch += 1;
        needsReview = true;
      }
      if (typeof job.assignedCleanerId === "string" && job.assignedCleanerId) {
        operational.legacyCleanerFieldOnV2 += 1;
      }
      if (["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus) && activeAssignments(job).length === 0) {
        operational.assignedWithoutActiveAssignment += 1;
        needsReview = true;
      }
      const directCleaners = new Set(activeAssignments(job)
        .filter((assignment) => assignment.source === "MANAGER_DIRECT")
        .map((assignment) => assignment.cleanerId));
      if (offers.some((offer) => directCleaners.has(offer.cleanerId) && openOfferStatuses.has(offer.status))) {
        operational.directAssignmentWithOpenSameCleanerOffer += 1;
      }
    }

    if (job.operationalStatus === "COMPLETED") {
      if (millis(job.completedAt) === null) {
        operational.completedWithoutCompletedAt += 1;
        needsReview = true;
      } else operational.completedWithCompletedAt += 1;
      if (assignmentAware) report.financial.realCompletedAssignmentAwareWithoutPayoutPath += 1;
    } else if (openStatuses.has(job.operationalStatus)) {
      const scheduledDate = dateOnlyKey(job.scheduledDate);
      if (scheduledDate !== null && scheduledDate < today) {
        operational.pastDueOpen += 1;
        increment(operational.pastDueByChecklist, pastDueRunClass(initialRun));
        needsReview = true;
      } else if (initialRun) {
        operational.upcomingOpenScheduleLockedByRun += 1;
      } else {
        operational.upcomingOpenWithoutRun += 1;
      }
      if (initialRun?.status === "DRAFT") increment(operational.draftRunLinkState, draftLinkState(job, initialRun, now));
    }

    if (needsReview) report.managerReview += 1;
  }

  return report;
}
