import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { cleanerInstallationKey } from "./cleanerPushDelivery.js";
import { cleanerDeviceReference } from "./cleanerPushDevices.js";
import { cleanerInboxTypes, isInboxId } from "./notificationInboxEvents.js";

const outcomes = new Set(["shown", "suppressed", "error"]);
const errorNames = new Set([
  "Error", "AbortError", "ConstraintError", "DataCloneError", "DataError", "EncodingError",
  "InUseAttributeError", "IndexSizeError", "InvalidAccessError", "InvalidCharacterError",
  "InvalidModificationError", "InvalidNodeTypeError", "InvalidStateError", "NamespaceError", "NetworkError",
  "NotAllowedError", "NotFoundError", "NotReadableError", "NotSupportedError", "OperationError",
  "QuotaExceededError", "ReadOnlyError", "SecurityError", "SyntaxError", "TimeoutError",
  "TransactionInactiveError", "UnknownError", "VersionError", "WrongDocumentError",
]);
const validTime = (value) => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;

function recordWithKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.includes(key));
}

function validReceipt(receipt) {
  return recordWithKeys(receipt, ["eventId", "receivedAtMs", "clientVisible", "outcome", "errorName"])
    && typeof receipt.eventId === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(receipt.eventId)
    && validTime(receipt.receivedAtMs) && typeof receipt.clientVisible === "boolean"
    && outcomes.has(receipt.outcome)
    && (receipt.outcome === "error" ? typeof receipt.errorName === "string" && /^[A-Za-z]{1,50}$/.test(receipt.errorName)
      : receipt.errorName === null);
}

export function projectCleanerPhoneReceipt(receipt) {
  const receivedAt = receipt?.receivedAt?.toDate?.();
  if (!receivedAt || !outcomes.has(receipt.outcome) || typeof receipt.clientVisible !== "boolean"
    || !Number.isSafeInteger(receipt.delayMs) || receipt.delayMs < 0) return null;
  return {
    receivedAt: receivedAt.toISOString(), delayMs: receipt.delayMs, clientVisible: receipt.clientVisible,
    outcome: receipt.outcome, errorName: receipt.outcome === "error" ? safeErrorName(receipt.errorName) : null,
  };
}

function safeErrorName(name) {
  return errorNames.has(name) ? name : "Error";
}

export function cleanerPushTestStatus(delivery, installationKey) {
  const test = delivery?.type === cleanerInboxTypes.pilotTest ? delivery : null;
  const receipts = installationKey ? [test?.phoneReceipts?.[installationKey]] : Object.values(test?.phoneReceipts || {});
  const receipt = receipts.map(projectCleanerPhoneReceipt).filter(Boolean)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))[0] ?? null;
  return { attemptedAt: test?.attemptedAt?.toDate?.().toISOString() ?? null, receipt };
}

/** One first receipt per targeted installation, even when uploads retry or overlap. */
export async function recordCleanerPushReceipts(database, identity, input, now = Date.now()) {
  if (!recordWithKeys(input, ["deviceId", "clientNowMs", "receipts"])
    || typeof input.deviceId !== "string" || !/^[A-Za-z0-9-]{16,80}$/.test(input.deviceId)
    || !validTime(input.clientNowMs) || !Array.isArray(input.receipts) || input.receipts.length > 20
    || !input.receipts.every(validReceipt)) {
    throw new HttpsError("invalid-argument", "Cleaner push receipts are invalid.");
  }
  const { organizationId, cleanerId, uid, sessionId } = identity;
  const reference = cleanerDeviceReference(database, identity);
  const deliveries = database.collection("organizations").doc(organizationId).collection("cleanerNotificationDeliveries");
  const installationKey = cleanerInstallationKey({ organizationId, userId: uid, deviceId: input.deviceId });
  const byEvent = new Map();
  for (const receipt of input.receipts) {
    if (!byEvent.has(receipt.eventId)) byEvent.set(receipt.eventId, receipt);
  }
  const acknowledgedEventIds = [...byEvent.keys()];
  const latestEventId = await database.runTransaction(async (transaction) => {
    const device = (await transaction.get(reference)).data();
    if (device?.deviceId !== input.deviceId || device.organizationId !== organizationId
      || device.cleanerId !== cleanerId || device.userId !== uid || device.sessionId !== sessionId) return null;

    const snapshots = await Promise.all([...byEvent.keys()].filter(isInboxId).map((id) => transaction.get(deliveries.doc(id))));
    for (const snapshot of snapshots) {
      const delivery = snapshot.data();
      const attemptedAt = delivery?.attemptedAt?.toMillis?.();
      if (delivery?.cleanerId !== cleanerId || delivery.organizationId !== organizationId || delivery.eventId !== snapshot.id
        || !delivery.devices?.some((target) => target.installationKey === installationKey)
        || !validTime(attemptedAt) || delivery.phoneReceipts?.[installationKey]) continue;
      const receipt = byEvent.get(snapshot.id);
      const receivedAt = Math.max(attemptedAt, Math.min(now, receipt.receivedAtMs + (now - input.clientNowMs)));
      transaction.update(snapshot.ref, { phoneReceipts: { ...delivery.phoneReceipts, [installationKey]: {
        receivedAt: Timestamp.fromMillis(receivedAt), delayMs: receivedAt - attemptedAt,
        clientVisible: receipt.clientVisible, outcome: receipt.outcome,
        errorName: receipt.outcome === "error" ? safeErrorName(receipt.errorName) : null,
      } } });
    }
    return device.latestPushTest?.deviceId === input.deviceId ? device.latestPushTest.eventId : null;
  });
  let latestTest = null;
  if (isInboxId(latestEventId)) {
    const delivery = (await deliveries.doc(latestEventId).get()).data();
    latestTest = cleanerPushTestStatus(delivery?.cleanerId === cleanerId ? delivery : null, installationKey);
  }
  return { acknowledgedEventIds, latestTest };
}
