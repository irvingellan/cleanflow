import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { cleanerAccountUid, cleanerSessionIds, eligibleCleaner, isActiveCleanerSession } from "./cleanerHubAccess.js";
import {
  cleanerDeviceReference, eligibleCleanerRegistration, hasCurrentCleanerClaims, invalidateCleanerDevice,
} from "./cleanerPushDevices.js";
import {
  boundedManagerFcmSend, invalidManagerFcmToken, managerFcmCleanupTimeoutMs,
  managerFcmFailureCode, normalizeManagerFcmResult,
} from "./managerFcmDelivery.js";
import { notificationDestination } from "./notificationInbox.js";
import { cleanerInbox, cleanerInboxTypes, inboxEventVersion, isInboxId, validInboxSegment } from "./notificationInboxEvents.js";

const eventTypes = new Set(Object.values(cleanerInboxTypes));
const safeSessionId = /^[A-Za-z0-9_-]{1,128}$/;
const notices = {
  en: "Open CleanFlow to check your notifications.",
  pt: "Abra o CleanFlow para ver seus avisos.",
  es: "Abre CleanFlow para ver tus avisos.",
};

function deviceAudit(snapshot, outcome) {
  const { organizationId, userId, deviceId, registrationRevision } = snapshot.data();
  const installationKey = createHash("sha256").update(JSON.stringify([organizationId, userId, deviceId])).digest("hex");
  return { installationKey, registrationRevision, outcome };
}

function cleanerFcmMessage(snapshot, eventId) {
  const { language, token, bindingId } = snapshot.data();
  return {
    token,
    data: {
      title: "CleanFlow",
      body: notices[language] || notices.pt,
      cleanerBindingId: bindingId,
      eventId,
      link: "/agenda",
    },
    webpush: { headers: { TTL: "300" } },
  };
}

async function chooseDevices(transaction, database, identity, sessionIds) {
  const candidates = await Promise.all(sessionIds.map(async (sessionId) => {
    const session = { ...identity, sessionId };
    const snapshot = await transaction.get(cleanerDeviceReference(database, session));
    return eligibleCleanerRegistration(snapshot.data(), session) ? snapshot : null;
  }));
  const bindings = await Promise.all(candidates.filter(Boolean).map(async (snapshot) => {
    return await hasCurrentCleanerClaims(transaction, database, snapshot.data()) ? snapshot : null;
  }));
  return bindings.filter(Boolean);
}

async function claimDelivery(database, { organization, cleanerId, eventId, deliveryReference }) {
  const organizationId = organization.id;
  const uid = cleanerAccountUid(organizationId, cleanerId);
  const identity = { organizationId, cleanerId, uid };
  const eventRef = cleanerInbox(organization, cleanerId).doc(eventId);
  return database.runTransaction(async (transaction) => {
    const [delivery, source, membership, cleaner] = await Promise.all([
      transaction.get(deliveryReference), transaction.get(eventRef),
      transaction.get(organization.collection("members").doc(uid)),
      transaction.get(organization.collection("cleaners").doc(cleanerId)),
    ]);
    if (delivery.exists) return null;

    const event = source.data();
    if (event?.eventId !== eventId || event.organizationId !== organizationId || event.cleanerId !== cleanerId
      || event.eventVersion !== inboxEventVersion || !eventTypes.has(event.type)
      || event.processingState !== "STORED" || !Number.isFinite(event.createdAt?.toMillis?.())) return null;

    const member = membership.data();
    const profile = cleaner.data();
    const sessions = [...new Set(cleanerSessionIds(member))].slice(0, 8).filter((sessionId) => (
      typeof sessionId === "string" && safeSessionId.test(sessionId)
      && isActiveCleanerSession(member, { ...identity, sessionId })
    ));
    const activeRecipient = sessions.length > 0 && eligibleCleaner(profile)
      && (profile.organizationId == null || profile.organizationId === organizationId);
    const destination = activeRecipient && await notificationDestination(transaction, organization, event, identity, { forPush: true });
    const devices = destination ? await chooseDevices(transaction, database, identity, sessions) : [];
    const skipped = !activeRecipient ? "RECIPIENT_INELIGIBLE"
      : !destination ? "STALE_EVENT" : devices.length === 0 ? "NO_ACTIVE_DEVICES" : null;
    const stages = ["EVENT_CREATED", "RECIPIENT_SELECTED", "INBOX_STORED"];
    if (devices.length > 0) stages.push("DEVICE_SELECTED");
    transaction.create(deliveryReference, {
      organizationId, cleanerId, eventId, type: event.type, stages, provider: "fcm",
      deliveryStatus: skipped || "UNKNOWN",
      ...(skipped ? {} : { pendingProviderResult: true, claimedAt: FieldValue.serverTimestamp() }),
      recordedAt: FieldValue.serverTimestamp(),
      targetDeviceCount: devices.length, acceptedByFcmDevices: 0, rejectedDevices: 0,
      unknownDevices: devices.length,
      devices: devices.map((snapshot) => deviceAudit(snapshot, "UNKNOWN")),
    });
    return { devices, stages, skipped };
  });
}

async function cleanInvalidDevices(database, devices, results) {
  let invalidated = 0;
  let invalidDeviceCleanupFailed = false;
  let timer;
  const cleanup = Promise.all(results.map(async (item, index) => {
    if (item.success || !invalidManagerFcmToken(item.error)) return;
    try {
      if (await invalidateCleanerDevice(database, devices[index])) invalidated += 1;
    } catch {
      invalidDeviceCleanupFailed = true;
    }
  }));
  try {
    await Promise.race([
      cleanup,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Device cleanup deadline exceeded.")), managerFcmCleanupTimeoutMs); }),
    ]);
  } catch {
    invalidDeviceCleanupFailed = true;
  } finally {
    clearTimeout(timer);
  }
  return { invalidated, invalidDeviceCleanupFailed };
}

function perDeviceOutcome(result) {
  const successCount = Number(result.success);
  const { deliveryStatus } = normalizeManagerFcmResult({
    responses: [result], successCount, failureCount: 1 - successCount,
  }, 1);
  return deliveryStatus === "FCM_ACCEPTED" ? "PROVIDER_ACCEPTED" : deliveryStatus === "FAILED" ? "REJECTED" : "UNKNOWN";
}

async function recordOutcome(reference, patch, logger) {
  try {
    await reference.update(patch);
  } catch {
    // The claim persists as UNKNOWN even if the final audit write fails.
    logger?.error?.("Cleaner notification outcome could not be recorded.");
  }
}

/** One claimed FCM attempt for an already committed Inbox event. */
export async function processCleanerNotification({ database, organizationId, cleanerId, eventId, sendFcm, logger }) {
  if (!validInboxSegment(organizationId) || !validInboxSegment(cleanerId) || !isInboxId(eventId)) {
    return { skipped: "invalid-event" };
  }
  const organization = database.collection("organizations").doc(organizationId);
  const reference = organization.collection("cleanerNotificationDeliveries").doc(eventId);
  const claim = await claimDelivery(database, { organization, cleanerId, eventId, deliveryReference: reference });
  if (!claim || claim.skipped) return { skipped: claim?.skipped || "already-claimed-or-invalid" };
  const { devices, stages } = claim;

  const attemptedAt = FieldValue.serverTimestamp();
  await recordOutcome(reference, { stages: [...stages, "PUSH_ATTEMPTED"], attemptedAt }, logger);
  let outcome;
  try {
    const response = await boundedManagerFcmSend(sendFcm, devices.map((device) => cleanerFcmMessage(device, eventId)));
    const { deliveryStatus, acceptedByFcmDevices, failedDevices, unknownDevices } = normalizeManagerFcmResult(response, devices.length);
    const rejectedDevices = failedDevices - unknownDevices;
    const cleanup = await cleanInvalidDevices(database, devices, response.responses);
    outcome = {
      deliveryStatus, acceptedByFcmDevices, rejectedDevices, unknownDevices, ...cleanup,
      devices: devices.map((device, index) => deviceAudit(device, perDeviceOutcome(response.responses[index]))),
      stages: [...stages, "PUSH_ATTEMPTED", ...(acceptedByFcmDevices ? ["PROVIDER_ACCEPTED"] : []),
        ...(rejectedDevices ? ["REJECTED"] : []), ...(unknownDevices ? ["UNKNOWN"] : [])],
    };
  } catch (error) {
    outcome = {
      deliveryStatus: "UNKNOWN", unknownDevices: devices.length, failureCode: managerFcmFailureCode(error),
      stages: [...stages, "PUSH_ATTEMPTED", "UNKNOWN"],
    };
  }
  await recordOutcome(reference, { ...outcome, pendingProviderResult: false, completedAt: FieldValue.serverTimestamp() }, logger);
  return { deliveryStatus: outcome.deliveryStatus };
}
