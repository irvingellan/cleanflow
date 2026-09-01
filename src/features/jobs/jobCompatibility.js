export const LEGACY_JOB_SCHEMA_VERSION = 0;
export const SINGULAR_JOB_SCHEMA_VERSION = 1;
export const ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION = 2;
export const CURRENT_JOB_SCHEMA_VERSION = ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION;
export const maximumGuestNameLength = 120;

function optionalText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
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
  const job = {
    ...source,
    id,
    schemaVersion: getJobSchemaVersion(source),
  };
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
  notes,
  guestName,
}) {
  const normalizedGuestName = optionalText(guestName);
  const normalizedScheduledStart = optionalText(scheduledStart);

  if (normalizedGuestName.length > maximumGuestNameLength) {
    throw new Error("Guest name is too long.");
  }

  const job = {
    organizationId,
    propertyId,
    propertyName,
    clientName,
    scheduledDate,
    clientPrice,
    cleanerPayout,
    notes,
    operationalStatus: "UNASSIGNED",
    schemaVersion: CURRENT_JOB_SCHEMA_VERSION,
    assignedCleanerIds: [],
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

  return job;
}
