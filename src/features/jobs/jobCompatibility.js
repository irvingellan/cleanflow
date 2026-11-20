export const LEGACY_JOB_SCHEMA_VERSION = 0;
export const SINGULAR_JOB_SCHEMA_VERSION = 1;
export const ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION = 2;
export const CURRENT_JOB_SCHEMA_VERSION = ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION;
export const maximumGuestNameLength = 120;

import { withNormalizedDataProvenance } from "../../lib/dataProvenance.js";
import { defaultServiceType, isServiceType, normalizeServiceType } from "../../../functions/src/serviceTypes.js";
import { jobPriceSnapshot } from "./jobPricingForm.js";
import { resolveJobPricing } from "../pricing/pricingModel.js";
import { getChecklistContextRevision } from "./checklistContextRevision.js";

function optionalText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

// Job prices are optional snapshots. They deliberately do not fall back to a
// Property after creation, so a later Property default change cannot rewrite
// a historical Job.
export function optionalJobPrice(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function getJobGrossMargin(job) {
  const { client, cleaner } = resolveJobPricing(job ?? {});
  if (client.amountCents == null || cleaner.amountCents == null) return null;
  return (client.amountCents - cleaner.amountCents) / 100;
}

function validateServiceType(serviceType) {
  if (!isServiceType(serviceType)) {
    const error = new Error("Unknown Job service type.");
    error.code = "invalid-service-type";
    throw error;
  }
  return serviceType;
}

export function buildJobDetailsUpdate({ guestName, notes, serviceType }) {
  const normalizedGuestName = optionalText(guestName);
  if (normalizedGuestName.length > maximumGuestNameLength) {
    throw new Error("Guest name is too long.");
  }

  return {
    guestName: normalizedGuestName || undefined,
    notes: optionalText(notes) || undefined,
    ...(serviceType === undefined ? {} : { serviceType: validateServiceType(serviceType) }),
  };
}

export function canEditJobDetails(job) {
  return job?.operationalStatus !== "COMPLETED" && !job?.archivedAt;
}

export function getJobSchemaVersion(job) {
  return Number.isInteger(job?.schemaVersion) && job.schemaVersion > 0
    ? job.schemaVersion
    : LEGACY_JOB_SCHEMA_VERSION;
}

export function isLegacyJob(job) {
  return getJobSchemaVersion(job) === LEGACY_JOB_SCHEMA_VERSION;
}

export function isAssignmentAwareJob(job) {
  return getJobSchemaVersion(job) >= ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION;
}

/**
 * Assignment-aware Jobs may continue building a roster until work starts.
 * Legacy offer behavior remains on its existing singular-cleaner path.
 */
export function canManageAssignmentAwareOffers(job) {
  return (
    isAssignmentAwareJob(job) &&
    ["UNASSIGNED", "OFFERED", "ASSIGNED"].includes(job?.operationalStatus)
  );
}

export function getAssignedCleanerIds(job) {
  if (!isAssignmentAwareJob(job) || !Array.isArray(job?.assignedCleanerIds)) {
    return [];
  }

  return [...new Set(job.assignedCleanerIds.filter((cleanerId) =>
    typeof cleanerId === "string" && cleanerId.trim(),
  ).map((cleanerId) => cleanerId.trim()))];
}

/**
 * Reads stay additive: versionless documents remain legacy records in memory and
 * are never written back merely because they were opened.
 */
export function normalizeJobRecord(data = {}, id) {
  const source = data && typeof data === "object" ? data : {};
  const job = withNormalizedDataProvenance({
    ...source,
    id,
    schemaVersion: getJobSchemaVersion(source),
    checklistContextRevision: getChecklistContextRevision(source),
    serviceType: normalizeServiceType(source.serviceType),
  });
  const clientId = optionalText(source.clientId);
  const guestName = optionalText(source.guestName);

  if (clientId) {
    job.clientId = clientId;
  } else {
    delete job.clientId;
  }

  if (guestName) {
    job.guestName = guestName;
  } else {
    delete job.guestName;
  }

  return job;
}

export function buildCurrentJobCreateData({
  organizationId,
  propertyId,
  propertyName,
  clientId,
  clientName,
  scheduledDate,
  scheduledStart,
  clientPrice,
  cleanerPayout,
  billing,
  pay,
  notes,
  guestName,
  serviceType = defaultServiceType,
  requiredCleanerCount = 1,
}) {
  const normalizedGuestName = optionalText(guestName);
  const normalizedScheduledStart = optionalText(scheduledStart);
  const normalizedClientPrice = optionalJobPrice(clientPrice);
  const normalizedCleanerPayout = optionalJobPrice(cleanerPayout);

  if (normalizedGuestName.length > maximumGuestNameLength) {
    throw new Error("Guest name is too long.");
  }

  if (normalizedClientPrice === null || normalizedCleanerPayout === null) {
    throw new Error("Job prices must be non-negative numbers.");
  }

  const job = {
    ...jobPriceSnapshot({ clientPrice: normalizedClientPrice, cleanerPayout: normalizedCleanerPayout, billing, pay }),
    organizationId,
    propertyId,
    propertyName,
    clientName,
    scheduledDate,
    notes,
    serviceType: validateServiceType(serviceType),
    operationalStatus: "UNASSIGNED",
    schemaVersion: CURRENT_JOB_SCHEMA_VERSION,
    checklistContextRevision: 0,
    assignedCleanerIds: [],
    dataProvenance: "REAL",
  };

  const normalizedClientId = optionalText(clientId);

  if (normalizedClientId) {
    job.clientId = normalizedClientId;
  }

  if (normalizedScheduledStart) {
    job.scheduledStart = normalizedScheduledStart;
  }

  if (normalizedGuestName) {
    job.guestName = normalizedGuestName;
  }

  if (requiredCleanerCount !== 1) {
    if (!Number.isInteger(requiredCleanerCount) || requiredCleanerCount < 1 || requiredCleanerCount > 10) {
      throw new Error("The number of cleaners must be between 1 and 10.");
    }
    job.requiredCleanerCount = requiredCleanerCount;
  }

  return job;
}
