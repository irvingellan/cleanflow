import { assertShadowTarget, shadowProjectId, shadowOrigin, providers } from "./reservationCandidateModel.js";
const displayed = ["id", "sourceProvider", "sourcePropertyName", "guestName", "checkIn", "checkOut", "sourceReservationStatus", "observedAt", "identityStrategy", "confidence", "reviewState", "changeType", "propertyMappingState", "sourceSemantics", "sourceEvidenceType"];
export function sanitizeInboxSnapshot(value) {
  if (!value || !Array.isArray(value.candidates) || value.candidates.length > 1000) throw new Error("INVALID_SHADOW_SNAPSHOT");
  return value.candidates.map(row => {
    if (row.environment !== "sandbox" || !/^[a-f0-9]{64}$/.test(row.id || "") || !providers.includes(row.sourceProvider)) throw new Error("INVALID_SHADOW_SNAPSHOT");
    if (!["NEW", "UNCHANGED", "DATES_CHANGED", "STATUS_CHANGED", "PROPERTY_MAPPING_CHANGED", "SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED", "CONFLICT", "UNKNOWN"].includes(row.changeType)
      || !["MATCHED", "UNKNOWN", "AMBIGUOUS"].includes(row.propertyMappingState)
      || !["HIGH", "MEDIUM", "LOW"].includes(row.confidence)) throw new Error("INVALID_SHADOW_SNAPSHOT");
    const clean = {};
    for (const key of displayed) {
      const entry = row[key];
      if (entry != null && (typeof entry !== "string" || entry.length > 256 || /[\u0000-\u001f]/.test(entry))) throw new Error("INVALID_SHADOW_SNAPSHOT");
      clean[key] = entry ?? null;
    }
    clean.changeSet = {};
    for (const key of ["checkIn", "checkOut", "sourceReservationStatus", "propertyMappingState"]) {
      const diff = row.changeSet?.[key];
      if (diff) {
        if ([diff.before, diff.after].some(v => v != null && (typeof v !== "string" || v.length > 256))) throw new Error("INVALID_SHADOW_SNAPSHOT");
        clean.changeSet[key] = { before: diff.before ?? null, after: diff.after ?? null };
      }
    }
    if (row.previousObservation) clean.previousObservation = Object.fromEntries(["checkIn", "checkOut", "sourceReservationStatus", "observedAt"].map(key => {
      const entry = row.previousObservation[key];
      if (entry != null && (typeof entry !== "string" || entry.length > 256)) throw new Error("INVALID_SHADOW_SNAPSHOT");
      return [key, entry ?? null];
    }));
    if (row.conflict) {
      if (!["OLDER_OBSERVATION", "ORDER_UNPROVEN"].includes(row.conflict.reason)) throw new Error("INVALID_SHADOW_SNAPSHOT");
      clean.conflict = { reason: row.conflict.reason, observation: {} };
      for (const key of ["checkIn", "checkOut", "sourceReservationStatus", "observedAt"]) {
        const entry = row.conflict.observation?.[key];
        if (entry != null && (typeof entry !== "string" || entry.length > 256 || /[<>\u0000-\u001f]/.test(entry))) throw new Error("INVALID_SHADOW_SNAPSHOT");
        clean.conflict.observation[key] = entry ?? null;
      }
    }
    return clean;
  });
}
export async function readLocalInbox({ port, pairingKey, projectId = shadowProjectId, origin = shadowOrigin, fetchImpl = fetch, timeoutMs = 10000 }) {
  assertShadowTarget({ projectId, origin });
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[a-f0-9]{64}$/.test(pairingKey || "")) throw new Error("INVALID_PAIRING");
  const controller = new AbortController(); let timer;
  const operation = (async () => {
    const response = await fetchImpl(`http://127.0.0.1:${port}/candidates`, { method: "GET", credentials: "omit", redirect: "error",
      headers: { "X-Observer-Pairing": pairingKey }, signal: controller.signal });
    if (!response.ok) throw new Error("LOCAL_OBSERVER_UNAVAILABLE");
    const text = await response.text(); if (text.length > 2 * 1024 * 1024) throw new Error("SHADOW_SNAPSHOT_TOO_LARGE");
    return sanitizeInboxSnapshot(JSON.parse(text));
  })();
  return Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("LOCAL_OBSERVER_TIMEOUT")); }, timeoutMs);
  })]).finally(() => clearTimeout(timer));
}
