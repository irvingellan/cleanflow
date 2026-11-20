import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAuthorizedDeveloper } from "../devCenterAuthorization.js";
import { processChecklistReviewNotification } from "../checklistReviewNotifications.js";
import { createManagerReminderInboxItem, inboxEventId, managerInboxCollection } from "../notificationInboxEvents.js";
import { loadEligibleManagerPushDevices } from "../managerFcmDelivery.js";
import { sendFcmManagerReminder, processClaimedManagerReminder } from "../managerReminderDelivery.js";
import { processManagerOperationalNotification } from "../managerOperationalNotifications.js";
import { notificationOutcomeLog } from "../notificationOutcomeLog.js";
import {
  calculateManagerReminder,
  claimReminderDelivery,
  managerReminderPayload,
  managerReminderTypes,
  reminderDeliveryId,
} from "../managerReminders.js";
import {
  dispatchManagerReminder,
  managerReminderProvider,
  requireAvailablePilotReminderTransport,
} from "../managerReminderTransport.js";
import { allowedDeveloperUids } from "../runtime/devCenter.js";
import { db, liveMessaging, organizationReference } from "../runtime/firebase.js";
import { defaultOrganizationId, organizationIdForRequest } from "../runtime/organization.js";
import { managerReminderProviderParam } from "../runtime/params.js";

async function activeManagerPushDevices(organizationId) {
  return loadEligibleManagerPushDevices(db, organizationId);
}

export async function notifyManagersOperationalEvent(event) {
  if (!event.data) return;
  const outcome = await processManagerOperationalNotification({
    database: db, deliveryReference: event.data.ref,
    organizationId: event.params.orgId, jobId: event.params.jobId, eventId: event.params.eventId,
    sendFcm: (messages) => liveMessaging().sendEach(messages), logger,
  });
  logger.info("Manager operational notification processed.", notificationOutcomeLog(outcome));
}

export async function notifyManagersChecklistReadyForReview(event) {
  if (!event.data) return;
  const { orgId, jobId, runId, eventId } = event.params;
  await processChecklistReviewNotification({
    database: db,
    deliveryReference: event.data.ref,
    deliveryData: event.data.data(),
    organizationId: orgId,
    jobId,
    runId,
    eventId,
    loadManagerDevices: activeManagerPushDevices,
    sendFcm: (messages) => liveMessaging().sendEach(messages),
    logger,
  });
}

async function sendFcmManagerReminderNotification(organizationId, reminder) {
  return sendFcmManagerReminder({ database: db, reminder,
    loadManagerDevices: () => activeManagerPushDevices(organizationId),
    sendFcm: (messages) => liveMessaging().sendEach(messages) });
}

function configuredManagerReminderProvider() {
  return managerReminderProvider(managerReminderProviderParam.value());
}

async function claimManagerReminderDelivery(organizationId, reminder, provider) {
  const deliveryReference = organizationReference(organizationId)
    .collection("managerReminderDeliveries")
    .doc(reminderDeliveryId(organizationId, reminder));

  // FCM has no idempotency key. Claiming before delivery intentionally favors
  // at-most-once pilot pushes over an automatic retry that could spam managers.
  const claimed = await claimReminderDelivery({
    database: db,
    deliveryReference,
    deliveryData: {
      organizationId,
      reminderType: reminder.type,
      targetDate: reminder.targetDate,
      timezone: reminder.timezone,
      jobCount: reminder.jobCount,
      attentionCount: reminder.attentionCount,
      deliveryProvider: provider,
      deliveryStatus: "SENDING",
      attemptedAt: FieldValue.serverTimestamp(),
    },
  });
  return { claimed, deliveryReference };
}

async function loadManagerReminderJobs(organizationId, targetDate) {
  const jobsSnapshot = await organizationReference(organizationId)
    .collection("jobs")
    .where("scheduledDate", "==", targetDate)
    .get();
  return jobsSnapshot.docs.map((snapshot) => snapshot.data());
}

async function calculateCurrentManagerReminder(organizationId, type, now = new Date()) {
  return calculateManagerReminder({
    type,
    now,
    loadJobsForScheduledDate: (targetDate) => loadManagerReminderJobs(organizationId, targetDate),
  });
}

export async function processManagerReminderWindow(
  type,
  { now = new Date(), organizationId = defaultOrganizationId } = {},
) {
  const reminder = await calculateCurrentManagerReminder(organizationId, type, now);

  if (reminder.jobCount === 0) {
    logger.info("Manager reminder skipped because no operational Jobs are scheduled.", {
      organizationId,
      reminderType: type,
      targetDate: reminder.targetDate,
    });
    return { ...reminder, skipped: "no-jobs" };
  }

  const organization = organizationReference(organizationId);
  const inboxId = inboxEventId("manager-reminder", reminderDeliveryId(organizationId, reminder));
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(organization.collection(managerInboxCollection).doc(inboxId));
    if (!existing.exists) createManagerReminderInboxItem(transaction, organization, reminder, inboxId);
  });

  const provider = configuredManagerReminderProvider();
  requireAvailablePilotReminderTransport(provider);
  const claim = await claimManagerReminderDelivery(organizationId, reminder, provider);
  if (!claim.claimed) {
    logger.info("Manager reminder skipped because the window was already claimed.", {
      organizationId,
      reminderType: type,
      targetDate: reminder.targetDate,
    });
    return { ...reminder, skipped: "already-claimed" };
  }

  const outcome = await processClaimedManagerReminder({
    ...claim, reminder, logger,
    dispatch: () => dispatchManagerReminder({
      provider, reminder, sendFcm: (value) => sendFcmManagerReminderNotification(organizationId, value),
    }),
  });
  // The outcome line went missing on 2026-11-04; without it the log cannot say whether a reminder was sent.
  logger.info("Manager reminder delivery processed.", { organizationId, ...notificationOutcomeLog(outcome) });
  return outcome;
}

// One reminder window per organization. listDocuments() also returns organizations
// whose parent document was never written. One organization's failure never blocks
// another's reminder; the first failure is rethrown after every organization has
// been processed, so the scheduled run still reports it.
export async function processManagerReminderWindowForEveryOrganization(type, { now = new Date() } = {}) {
  const organizations = await db.collection("organizations").listDocuments();
  const outcomes = [];
  const failures = [];
  for (const organization of organizations) {
    try {
      outcomes.push(await processManagerReminderWindow(type, { now, organizationId: organization.id }));
    } catch (error) {
      failures.push(error);
      logger.error("Manager reminder failed for one organization.", {
        organizationId: organization.id,
        reminderType: type,
        errorCode: typeof error?.code === "string" ? error.code : null,
      });
    }
  }
  if (failures.length > 0) throw failures[0];
  return outcomes;
}

export function sendTomorrowPlanningReminder() {
  return processManagerReminderWindowForEveryOrganization(managerReminderTypes.TOMORROW_19);
}

export function sendTodayExecutionReminder() {
  return processManagerReminderWindowForEveryOrganization(managerReminderTypes.TODAY_07);
}

export async function previewManagerReminder(request) {
  const organizationId = organizationIdForRequest(request);
  requireAuthorizedDeveloper(request, allowedDeveloperUids());

  const type = request.data?.type;
  if (!Object.values(managerReminderTypes).includes(type)) {
    throw new HttpsError("invalid-argument", "Reminder type is invalid.");
  }

  const now = request.data?.now ? new Date(request.data.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new HttpsError("invalid-argument", "Reminder preview time is invalid.");
  }

  const reminder = await calculateCurrentManagerReminder(organizationId, type, now);
  return { reminder, preview: managerReminderPayload(reminder, request.data?.language) };
}
