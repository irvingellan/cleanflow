import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { resolveDevCenterEnvironment } from "../devCenterSafety.js";
import { requireOrganizationManager } from "../managerAuthorization.js";
import { deactivateCleanerDevice, getCleanerDeviceStatus, registerCleanerDevice } from "../cleanerPushDevices.js";
import { awaitCleanerPushTest, cleanerPushOverview, requestCleanerPushTest } from "../cleanerPushTest.js";
import { processCleanerNotification } from "../cleanerPushDelivery.js";
import { resolveCleanerPushMode } from "../cleanerPushPilot.js";
import { requireActiveCleaner } from "../cleanerHubAccess.js";
import { notificationOutcomeLog } from "../notificationOutcomeLog.js";
import { devCenterEnvironmentOptions } from "../runtime/devCenter.js";
import { db, emulatorPushDisabled, liveMessaging } from "../runtime/firebase.js";
import { organizationIdForRequest } from "../runtime/organization.js";

async function cleanerPushIdentity(request) {
  const organizationId = organizationIdForRequest(request);
  return { organizationId, ...await requireActiveCleaner(db, request, organizationId) };
}

function cleanerPushMode() {
  const options = devCenterEnvironmentOptions();
  const environment = resolveDevCenterEnvironment({
    ...options, functionsEmulator: emulatorPushDisabled() ? "true" : options.functionsEmulator,
  });
  return resolveCleanerPushMode(process.env.CLEANER_PUSH_MODE, environment, process.env.CLEANER_PUSH_PILOT_RELEASE);
}

export async function registerCleanerPushDevice(request) {
  const identity = await cleanerPushIdentity(request);
  return registerCleanerDevice(db, identity, request.data, cleanerPushMode());
}

export async function deactivateCleanerPushDevice(request) {
  return deactivateCleanerDevice(db, await cleanerPushIdentity(request), request.data);
}

export async function getCleanerPushDeviceStatus(request) {
  return getCleanerDeviceStatus(db, await cleanerPushIdentity(request), request.data, cleanerPushMode());
}

/**
 * Test notices. A manager reads the overview or sends a test to all of a
 * cleaner's active phones; a cleaner sends a test to her own phone only.
 */
export async function cleanerPushTest(request) {
  const organizationId = organizationIdForRequest(request);
  const data = request.data;
  if (!data || typeof data !== "object" || Array.isArray(data)
    || !["overview", "send"].includes(data.action)
    || Object.keys(data).some((key) => !["action", "cleanerId"].includes(key))) {
    throw new HttpsError("invalid-argument", "Test notice request is invalid.");
  }
  const mode = cleanerPushMode();
  let requester;
  let target;
  if (request.auth?.token?.cleanerHub) {
    if (data.action !== "send" || data.cleanerId !== undefined) {
      throw new HttpsError("invalid-argument", "A cleaner can only test her own phone.");
    }
    const identity = await cleanerPushIdentity(request);
    requester = { role: "CLEANER", uid: identity.uid };
    target = { cleanerId: identity.cleanerId, targetSessionId: identity.sessionId };
  } else {
    await requireOrganizationManager(db, request, organizationId);
    if (data.action === "overview") {
      return cleanerPushOverview(db, { organizationId, cleanerId: data.cleanerId, mode });
    }
    requester = { role: "MANAGER", uid: request.auth.uid };
    target = { cleanerId: data.cleanerId, targetSessionId: null };
  }
  const stored = await requestCleanerPushTest(db, { organizationId, ...target, requester, mode });
  if (stored.state !== "stored") return stored;
  return awaitCleanerPushTest(db, { organizationId, eventId: stored.eventId });
}

export async function notifyCleanerInboxEvent(event) {
  if (!event.data) return;
  const mode = cleanerPushMode();
  if (mode === "disabled") return;
  const outcome = await processCleanerNotification({
    database: db, organizationId: event.params.orgId, cleanerId: event.params.cleanerId,
    eventId: event.params.eventId, sendFcm: (messages) => liveMessaging().sendEach(messages), logger, mode,
  });
  logger.info("Cleaner notification processed.", notificationOutcomeLog(outcome));
}
