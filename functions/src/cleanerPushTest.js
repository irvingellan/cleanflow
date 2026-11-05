import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { chooseDevices, cleanerRecipient } from "./cleanerPushDelivery.js";
import { cleanerInbox, cleanerInboxTypes, inboxEventVersion, validInboxSegment } from "./notificationInboxEvents.js";

// A test notice is a PUSH_TEST Inbox record. The regular sender delivers it,
// so a passing test exercises the same path as a real offer or assignment.

export const pushTestLimits = { minIntervalMs: 60_000, perDay: 10 };
const requesterRoles = new Set(["MANAGER", "CLEANER"]);
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

function transportActive(mode) {
  return mode === "pilot" || mode === "enabled";
}

/** Active installations that would receive a notice for this cleaner now. */
async function activeDevices(transaction, database, organization, cleanerId, mode, nowMs, targetSessionId) {
  const recipient = await cleanerRecipient(transaction, organization, cleanerId);
  if (!recipient.activeRecipient) return { recipient, devices: [] };
  const sessions = targetSessionId
    ? recipient.sessions.filter((sessionId) => sessionId === targetSessionId) : recipient.sessions;
  return { recipient, devices: await chooseDevices(transaction, database, recipient.identity, sessions, mode, nowMs) };
}

/** Manager view: whether alerts are on for this cleaner and how many phones would receive them. */
export async function cleanerPushOverview(database, { organizationId, cleanerId, mode, now = Date.now() }) {
  if (!validInboxSegment(cleanerId)) throw new HttpsError("invalid-argument", "Cleaner is invalid.");
  if (!transportActive(mode)) return { state: "unavailable" };
  const organization = database.collection("organizations").doc(organizationId);
  return database.runTransaction(async (transaction) => {
    const { recipient, devices } = await activeDevices(transaction, database, organization, cleanerId, mode, now);
    return {
      state: "ready", alertsEnabled: recipient.profile?.pushAlertsEnabled === true, activeDevices: devices.length,
    };
  }, { readOnly: true });
}

/**
 * Stores one PUSH_TEST record for the cleaner's active phones, or for one
 * session when the cleaner tests her own phone. Rate limited per cleaner.
 */
export async function requestCleanerPushTest(database, {
  organizationId, cleanerId, requester, targetSessionId = null, mode,
  now = Date.now(), randomSource = randomBytes, timestamp = () => FieldValue.serverTimestamp(),
}) {
  if (!validInboxSegment(cleanerId) || !requesterRoles.has(requester?.role) || typeof requester.uid !== "string"
    || (targetSessionId !== null && !validInboxSegment(targetSessionId))) {
    throw new HttpsError("invalid-argument", "Test notice request is invalid.");
  }
  if (!transportActive(mode)) return { state: "unavailable" };
  const organization = database.collection("organizations").doc(organizationId);
  const limitRef = organization.collection("cleanerPushTests").doc(cleanerId);
  const eventId = randomSource(32).toString("hex");
  return database.runTransaction(async (transaction) => {
    const [{ devices }, limit] = await Promise.all([
      activeDevices(transaction, database, organization, cleanerId, mode, now, targetSessionId),
      transaction.get(limitRef),
    ]);
    if (devices.length === 0) return { state: "no-devices" };
    const previous = limit.data() || {};
    const sinceLast = now - (Number.isFinite(previous.lastAtMs) ? previous.lastAtMs : 0);
    if (sinceLast < pushTestLimits.minIntervalMs) {
      return { state: "rate-limited", retryAfterSeconds: Math.ceil((pushTestLimits.minIntervalMs - sinceLast) / 1000) };
    }
    const today = dayKey(now);
    const count = previous.day === today && Number.isSafeInteger(previous.count) ? previous.count : 0;
    if (count >= pushTestLimits.perDay) return { state: "daily-limit" };

    transaction.create(cleanerInbox(organization, cleanerId).doc(eventId), {
      eventId, organizationId, cleanerId, type: cleanerInboxTypes.pilotTest, eventVersion: inboxEventVersion,
      processingState: "STORED", priority: "HIGH",
      transitionKey: requester.role === "MANAGER" ? "manager-test" : "cleaner-self-test",
      requestedByRole: requester.role, requestedByUid: requester.uid,
      ...(targetSessionId ? { targetSessionId } : {}),
      createdAt: timestamp(),
    });
    transaction.set(limitRef, {
      organizationId, cleanerId, lastAtMs: now, day: today, count: count + 1,
      lastRequestedByRole: requester.role, lastRequestedByUid: requester.uid, updatedAt: timestamp(),
    });
    return { state: "stored", eventId, targetDeviceCount: devices.length };
  });
}

/** Waits briefly for the sender's provider result. Acceptance is not proof of display. */
export async function awaitCleanerPushTest(database, { organizationId, eventId, timeoutMs = 12_000, pollMs = 1_000, wait }) {
  const reference = database.collection("organizations").doc(organizationId)
    .collection("cleanerNotificationDeliveries").doc(eventId);
  const pause = wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let waited = 0; waited <= timeoutMs; waited += pollMs) {
    const delivery = (await reference.get()).data();
    if (delivery && delivery.pendingProviderResult !== true && typeof delivery.deliveryStatus === "string") {
      return {
        state: delivery.acceptedByFcmDevices > 0 ? "sent" : "not-delivered",
        acceptedDevices: Number.isSafeInteger(delivery.acceptedByFcmDevices) ? delivery.acceptedByFcmDevices : 0,
        targetDevices: Number.isSafeInteger(delivery.targetDeviceCount) ? delivery.targetDeviceCount : 0,
      };
    }
    if (waited < timeoutMs) await pause(pollMs);
  }
  return { state: "pending" };
}
