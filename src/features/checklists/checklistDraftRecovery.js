const recoveryStoragePrefix = "cleanflow-checklist-draft-v1:";
const recoveryMaximumAgeMilliseconds = 7 * 24 * 60 * 60 * 1000;
const recoveryMaximumBytes = 32_000;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function currentStorage() {
  try { return window.localStorage; } catch { return null; }
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * Local recovery is keyed by a SHA-256 fingerprint, never the bearer token.
 * This small record intentionally holds only unsent sparse edits, not the
 * frozen Job or Property projection.
 */
export async function checklistDraftRecoveryScope(token) {
  if (typeof token !== "string" || !token || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64Url(new Uint8Array(digest));
}

function recoveryKey(scope) {
  return `${recoveryStoragePrefix}${scope}`;
}

function validMutation(mutation) {
  return isPlainObject(mutation)
    && typeof mutation.mutationId === "string"
    && Number.isInteger(mutation.baseRevision)
    && mutation.baseRevision >= 0
    && isPlainObject(mutation.changes);
}

function validRecovery(value, now) {
  return isPlainObject(value)
    && Number.isFinite(value.updatedAt)
    && value.updatedAt + recoveryMaximumAgeMilliseconds > now
    && (value.pendingMutation === null || validMutation(value.pendingMutation))
    && isPlainObject(value.queuedChanges || {});
}

export function loadChecklistDraftRecovery(scope, { storage = currentStorage(), now = Date.now() } = {}) {
  if (!scope || !storage) return null;
  try {
    const raw = storage.getItem(recoveryKey(scope));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (validRecovery(value, now)) return value;
    storage.removeItem(recoveryKey(scope));
  } catch {
    // Storage is an optional resilience aid. Invalid/private-mode storage must not block a checklist.
  }
  return null;
}

export function saveChecklistDraftRecovery(scope, value, { storage = currentStorage(), now = Date.now() } = {}) {
  if (!scope || !storage) return false;
  try {
    const record = {
      pendingMutation: value?.pendingMutation || null,
      queuedChanges: value?.queuedChanges || {},
      updatedAt: now,
    };
    const serialized = JSON.stringify(record);
    if (serialized.length > recoveryMaximumBytes) return false;
    storage.setItem(recoveryKey(scope), serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearChecklistDraftRecovery(scope, { storage = currentStorage() } = {}) {
  if (!scope || !storage) return;
  try { storage.removeItem(recoveryKey(scope)); } catch { /* optional local recovery */ }
}

export const checklistDraftRecoveryStoragePrefix = recoveryStoragePrefix;
