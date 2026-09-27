import { normalizeDataProvenance } from "../src/lib/dataProvenance.js";

function timestampDateKey(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : new Date(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function dateOnlyKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function validatePilotPeriod(from, to) {
  if (!dateOnlyKey(from) || !dateOnlyKey(to) || from > to) {
    throw new Error("A valid inclusive YYYY-MM-DD date range is required.");
  }
  return { from, to };
}

function withinRange(value, from, to) {
  const key = timestampDateKey(value);
  return key !== null && key >= from && key <= to;
}

function withinScheduledRange(value, from, to) {
  const key = dateOnlyKey(value);
  return key !== null && key >= from && key <= to;
}

function hasMoney(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasLegacyCleanerPayoutMeaning(job) {
  return (job.schemaVersion === undefined || job.schemaVersion === null
    || (Number.isInteger(job.schemaVersion) && job.schemaVersion < 2))
    && hasMoney(job.cleanerPayout);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function buildPilotScorecard({ jobs = [], from, to, expectedJobs }) {
  validatePilotPeriod(from, to);
  if (expectedJobs !== undefined && (!Number.isSafeInteger(expectedJobs) || expectedJobs < 0)) {
    throw new Error("Expected Jobs must be a non-negative integer.");
  }

  const realJobs = jobs.filter((job) => normalizeDataProvenance(job) === "REAL");
  const scheduledJobs = realJobs.filter((job) => withinScheduledRange(job.scheduledDate, from, to));
  const createdOffers = realJobs.flatMap((job) => asArray(job.offers))
    .filter((offer) => withinRange(offer.createdAt, from, to));
  const respondedOffers = realJobs.flatMap((job) => asArray(job.offers))
    .filter((offer) => withinRange(offer.respondedAt, from, to));
  const scheduledRuns = scheduledJobs.flatMap((job) => asArray(job.checklistRuns));
  const latestReportCapabilityRecords = realJobs.flatMap((job) => asArray(job.checklistRuns))
    .flatMap((run) => asArray(run.clientReportCapabilities))
    .filter((capability) => withinRange(capability.createdAt, from, to));
  const actualScheduledJobs = scheduledJobs.length;

  return {
    period: { from, to },
    provenance: "Only Jobs with explicit dataProvenance REAL are included; DEMO and UNKNOWN are excluded.",
    jobs: {
      created: realJobs.filter((job) => withinRange(job.createdAt, from, to)).length,
      scheduled: actualScheduledJobs,
      completed: realJobs.filter((job) => withinRange(job.completedAt, from, to)).length,
      scheduledWithOffers: scheduledJobs.filter((job) => asArray(job.offers).length > 0).length,
      scheduledWithActiveAssignments: scheduledJobs.filter((job) =>
        asArray(job.assignments).some((assignment) => assignment.isActive === true)).length,
      scheduledWithClientPrice: scheduledJobs.filter((job) => hasMoney(job.clientPrice)).length,
      scheduledWithLegacyCleanerPayout: scheduledJobs.filter(hasLegacyCleanerPayoutMeaning).length,
    },
    offers: {
      created: createdOffers.length,
      interestedResponses: respondedOffers.filter((offer) => offer.status === "INTERESTED").length,
      declinedResponses: respondedOffers.filter((offer) => offer.status === "DECLINED").length,
      scheduledJobOffersWithIndividualCompensation: scheduledJobs
        .flatMap((job) => asArray(job.offers))
        .filter((offer) => hasMoney(offer.offeredCompensation)).length,
    },
    checklists: {
      draftRuns: scheduledRuns.filter((run) => run.status === "DRAFT").length,
      readyForReviewRuns: scheduledRuns.filter((run) => run.status === "READY_FOR_REVIEW").length,
      runsWithSavedEvidencePhoto: scheduledRuns.filter((run) =>
        asArray(run.evidence).some((evidence) => evidence.status === "SAVED"
          && typeof evidence.contentType === "string" && evidence.contentType.startsWith("image/"))).length,
    },
    clientReports: {
      latestCapabilityRecordsCreated: latestReportCapabilityRecords.length,
      opened: null,
    },
    expectedJobs: expectedJobs === undefined
      ? { supplied: false, actualScheduledJobs }
      : {
        supplied: true,
        expected: expectedJobs,
        actualScheduledJobs,
        coveragePercent: expectedJobs === 0 ? null : (actualScheduledJobs / expectedJobs) * 100,
      },
  };
}
