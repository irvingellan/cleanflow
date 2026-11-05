export const cleanerPushPilotCollection = "cleanerPushPilotSessions";
const isReleaseSha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const timestampMillis = (value) => typeof value?.toMillis === "function" ? value.toMillis() : NaN;

export function resolveCleanerPushMode(configuredMode, environment, releaseSha) {
  if (configuredMode === "pilot" && isReleaseSha(releaseSha)
    && ["production", "sandbox", "emulator"].includes(environment)) return "pilot";
  if (configuredMode === "enabled" && ["sandbox", "emulator"].includes(environment)) return "enabled";
  return "disabled";
}

export function cleanerPushPilotApprovalReference(database, { organizationId, sessionId }) {
  return database.doc(`organizations/${organizationId}/${cleanerPushPilotCollection}/${sessionId}`);
}

export function isCleanerPushPilotApproval(approval, identity, { releaseSha, nowMs, eventAtMs } = {}) {
  const approvedAtMs = timestampMillis(approval?.approvedAt);
  const expiresAtMs = timestampMillis(approval?.expiresAt);
  return approval?.active === true && isReleaseSha(releaseSha) && approval.releaseSha === releaseSha
    && ["organizationId", "cleanerId", "uid", "sessionId", "deviceId"].every((key) =>
      typeof identity?.[key] === "string" && identity[key].length > 0)
    && approval.organizationId === identity.organizationId && approval.cleanerId === identity.cleanerId
    && approval.uid === identity.uid && approval.sessionId === identity.sessionId && approval.deviceId === identity.deviceId
    && Number.isFinite(approvedAtMs) && Number.isFinite(expiresAtMs) && Number.isFinite(nowMs)
    && approvedAtMs <= nowMs && nowMs < expiresAtMs
    && (eventAtMs === undefined || (Number.isFinite(eventAtMs) && eventAtMs >= approvedAtMs));
}

/** A manager turned phone alerts on for this cleaner; events before that stay Inbox-only. */
export function isCleanerPushEnabledProfile(profile, identity, eventAtMs) {
  const enabledAtMs = timestampMillis(profile?.pushAlertsEnabledAt);
  return profile?.pushAlertsEnabled === true && profile.active !== false && !profile.archivedAt
    && (profile.organizationId == null || profile.organizationId === identity?.organizationId)
    && Number.isFinite(enabledAtMs) && enabledAtMs <= Date.now()
    && (eventAtMs === undefined || (Number.isFinite(eventAtMs) && eventAtMs >= enabledAtMs));
}

export async function approvedCleanerPushPilotDevice(transaction, database, identity, eventAtMs) {
  const [approval, profile] = await Promise.all([
    transaction.get(cleanerPushPilotApprovalReference(database, identity)),
    transaction.get(database.doc(`organizations/${identity.organizationId}/cleaners/${identity.cleanerId}`)),
  ]);
  return isCleanerPushPilotApproval(approval.data(), identity, {
    releaseSha: process.env.CLEANER_PUSH_PILOT_RELEASE, nowMs: Date.now(), eventAtMs,
  }) || isCleanerPushEnabledProfile(profile.data(), identity, eventAtMs);
}
