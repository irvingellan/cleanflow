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
import { db, liveMessaging, organizationId, organizationReference } from "../runtime/firebase.js";
import { managerReminderProviderParam } from "../runtime/params.js";

async function activeManagerPushDevices(targetOrganizationId = organizationId) {
  return loadEligibleManagerPushDevices(db, targetOrganizationId);
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

async function sendFcmManagerReminderNotification(reminder) {
  return sendFcmManagerReminder({ database: db, reminder, loadManagerDevices: activeManagerPushDevices,
    sendFcm: (messages) => liveMessaging().sendEach(messages) });
}

function configuredManagerReminderProvider() {
  return managerReminderProvider(managerReminderProviderParam.value());
}

async function claimManagerReminderDelivery(reminder, provider) {
  const deliveryReference = organizationReference()
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

async function loadManagerReminderJobs(targetDate) {
  const jobsSnapshot = await organizationReference()
    .collection("jobs")
    .where("scheduledDate", "==", targetDate)
    .get();
  return jobsSnapshot.docs.map((snapshot) => snapshot.data());
}

async function calculateCurrentManagerReminder(type, now = new Date()) {
  return calculateManagerReminder({
    type,
    now,
    loadJobsForScheduledDate: loadManagerReminderJobs,
  });
}

export async function processManagerReminderWindow(type, { now = new Date() } = {}) {
  const reminder = await calculateCurrentManagerReminder(type, now);

  if (reminder.jobCount === 0) {
    logger.info("Manager reminder skipped because no operational Jobs are scheduled.", {
      reminderType: type,
      targetDate: reminder.targetDate,
    });
    return { ...reminder, skipped: "no-jobs" };
  }

  const organization = organizationReference();
  const inboxId = inboxEventId("manager-reminder", reminderDeliveryId(organizationId, reminder));
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(organization.collection(managerInboxCollection).doc(inboxId));
    if (!existing.exists) createManagerReminderInboxItem(transaction, organization, reminder, inboxId);
  });

  const provider = configuredManagerReminderProvider();
  requireAvailablePilotReminderTransport(provider);
  const claim = await claimManagerReminderDelivery(reminder, provider);
  if (!claim.claimed) {
    logger.info("Manager reminder skipped because the window was already claimed.", {
      reminderType: type,
      targetDate: reminder.targetDate,
    });
    return { ...reminder, skipped: "already-claimed" };
  }

  const outcome = await processClaimedManagerReminder({
    ...claim, reminder, logger,
    dispatch: () => dispatchManagerReminder({ provider, reminder, sendFcm: sendFcmManagerReminderNotification }),
  });
  // The outcome line went missing on 2026-11-04; without it the log cannot say whether a reminder was sent.
  logger.info("Manager reminder delivery processed.", notificationOutcomeLog(outcome));
  return outcome;
}

export function sendTomorrowPlanningReminder() {
  return processManagerReminderWindow(managerReminderTypes.TOMORROW_19);
}

export function sendTodayExecutionReminder() {
  return processManagerReminderWindow(managerReminderTypes.TODAY_07);
}

export async function previewManagerReminder(request) {
  requireAuthorizedDeveloper(request, allowedDeveloperUids());

  const type = request.data?.type;
  if (!Object.values(managerReminderTypes).includes(type)) {
    throw new HttpsError("invalid-argument", "Reminder type is invalid.");
  }

  const now = request.data?.now ? new Date(request.data.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new HttpsError("invalid-argument", "Reminder preview time is invalid.");
  }

  const reminder = await calculateCurrentManagerReminder(type, now);
  return { reminder, preview: managerReminderPayload(reminder, request.data?.language) };
}
