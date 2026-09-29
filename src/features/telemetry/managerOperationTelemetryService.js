import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../services/firebase/client.js";
import { managerPageClientMetadata } from "./managerPageLoadService.js";

const organizationId = "cleanflow-demo";
const allowedOperations = new Set([
  "offers", "issues", "assignments", "checklist-run", "checklist-capability", "cleaners",
]);
const allowedPhases = new Set(["initial", "refresh"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One local page-visit correlation key; it contains no Job or customer data. */
export function createManagerPageVisitId() {
  const generated = globalThis.crypto?.randomUUID?.();
  if (typeof generated === "string" && uuidPattern.test(generated)) return generated;

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function boundedDuration(value) {
  return Math.max(0, Math.min(600_000, Math.round(value)));
}

function recordOperationEvent({ operation, phase, startedAtMs, result, uid, pageVisitId }) {
  const event = {
    page: "job-detail",
    operation,
    phase,
    startedAtMs,
    durationMs: boundedDuration(Date.now() - startedAtMs),
    result,
    uid,
    pageVisitId,
    ...managerPageClientMetadata(),
    createdAt: serverTimestamp(),
  };
  void Promise.resolve(addDoc(
    collection(db, "organizations", organizationId, "managerOperationEvents"),
    event,
  )).catch(() => undefined);
}

function scheduleOperationEvent(input) {
  // Neither a slow write nor a diagnostic failure may change the operation result.
  void Promise.resolve().then(() => recordOperationEvent(input)).catch(() => undefined);
}

/** Wraps a data operation while recording only allowlisted, coarse timing fields. */
export function createManagerOperationTracker({ uid, pageVisitId } = {}) {
  const seenOperations = new Set();
  const validActor = typeof uid === "string" && uid.length > 0 && uid.length <= 128;
  const validVisit = typeof pageVisitId === "string" && uuidPattern.test(pageVisitId);

  return {
    track(operation, task, options = {}) {
      const allowedOperation = allowedOperations.has(operation);
      const requestedPhase = options?.phase;
      const phase = requestedPhase === undefined
        ? (seenOperations.has(operation) ? "refresh" : "initial")
        : requestedPhase === "manual" ? "refresh" : requestedPhase;
      const mayRecord = validActor && validVisit && allowedOperation && allowedPhases.has(phase);
      if (mayRecord) seenOperations.add(operation);
      const startedAtMs = Date.now();
      const finish = (result) => {
        if (mayRecord) scheduleOperationEvent({ operation, phase, startedAtMs, result, uid, pageVisitId });
      };

      try {
        const outcome = task();
        if (outcome && typeof outcome.then === "function") {
          return Promise.resolve(outcome).then(
            (value) => { finish("success"); return value; },
            (error) => { finish("error"); throw error; },
          );
        }
        finish("success");
        return outcome;
      } catch (error) {
        finish("error");
        throw error;
      }
    },
  };
}
