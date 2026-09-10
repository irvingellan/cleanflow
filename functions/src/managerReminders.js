import { createHash } from "node:crypto";

export const pilotReminderTimezone = "America/Los_Angeles";
export const managerReminderTypes = {
  TOMORROW_19: "TOMORROW_19",
  TODAY_07: "TODAY_07",
};

const activeReminderStatuses = new Set([
  "UNASSIGNED",
  "OFFERED",
  "ASSIGNED",
  "IN_PROGRESS",
]);

const reminderCopy = {
  en: {
    [managerReminderTypes.TOMORROW_19]: (count) => `🔔 Tomorrow: ${count} cleanings`,
    [managerReminderTypes.TODAY_07]: (count) => `☀️ Today: ${count} cleanings`,
    attention: (count) => `${count} ${count === 1 ? "needs" : "need"} attention. Tap to review in CleanFlow.`,
    organized: "Everything is organized. Tap to review.",
  },
  pt: {
    [managerReminderTypes.TOMORROW_19]: (count) => `🔔 Amanhã: ${count} limpezas`,
    [managerReminderTypes.TODAY_07]: (count) => `☀️ Hoje: ${count} limpezas`,
    attention: (count) => `${count} ${count === 1 ? "precisa" : "precisam"} de atenção. Toque para revisar no CleanFlow.`,
    organized: "Todas estão organizadas. Toque para revisar.",
  },
  es: {
    [managerReminderTypes.TOMORROW_19]: (count) => `🔔 Mañana: ${count} limpiezas`,
    [managerReminderTypes.TODAY_07]: (count) => `☀️ Hoy: ${count} limpiezas`,
    attention: (count) => `${count} ${count === 1 ? "requiere" : "requieren"} atención. Toca para revisar en CleanFlow.`,
    organized: "Todo está organizado. Toca para revisar.",
  },
};

function localDateParts(date, timeZone = pilotReminderTimezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day };
}

export function localDateKey(date, timeZone = pilotReminderTimezone) {
  const { year, month, day } = localDateParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(dateKey, days) {
  const value = new Date(`${dateKey}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function targetDateForReminder(type, now = new Date(), timeZone = pilotReminderTimezone) {
  const currentDate = localDateKey(now, timeZone);
  return type === managerReminderTypes.TOMORROW_19
    ? addCalendarDays(currentDate, 1)
    : currentDate;
}

export function isReminderJob(job, targetDate) {
  return (
    job?.scheduledDate === targetDate &&
    !job?.archivedAt &&
    activeReminderStatuses.has(job?.operationalStatus)
  );
}

export function hasAssignedCleaner(job) {
  if (Array.isArray(job?.assignedCleanerIds)) {
    return job.assignedCleanerIds.some((cleanerId) => typeof cleanerId === "string" && cleanerId);
  }
  return typeof job?.assignedCleanerId === "string" && Boolean(job.assignedCleanerId);
}

export function buildManagerReminder({ type, jobs, now = new Date(), timeZone = pilotReminderTimezone }) {
  const targetDate = targetDateForReminder(type, now, timeZone);
  const scheduledJobs = jobs.filter((job) => isReminderJob(job, targetDate));
  const attentionCount = scheduledJobs.filter((job) => !hasAssignedCleaner(job)).length;

  return { type, targetDate, timezone: timeZone, jobCount: scheduledJobs.length, attentionCount };
}

/**
 * Shared reminder calculation boundary for scheduled delivery and developer
 * preview. The loader is read-only; delivery and idempotency stay outside it.
 */
export async function calculateManagerReminder({
  type,
  now = new Date(),
  timeZone = pilotReminderTimezone,
  loadJobsForScheduledDate,
}) {
  const targetDate = targetDateForReminder(type, now, timeZone);
  const jobs = await loadJobsForScheduledDate(targetDate);
  return buildManagerReminder({ type, jobs, now, timeZone });
}

export function managerReminderPayload(reminder, language = "pt") {
  const copy = reminderCopy[language] || reminderCopy.pt;
  return {
    title: copy[reminder.type](reminder.jobCount),
    body: reminder.attentionCount ? copy.attention(reminder.attentionCount) : copy.organized,
    eventType: "MANAGER_REMINDER",
    link: "/",
  };
}

export function reminderDeliveryId(organizationId, reminder) {
  return createHash("sha256")
    .update(`${organizationId}:${reminder.targetDate}:${reminder.type}`)
    .digest("hex");
}

/**
 * Separates confirmed provider results from an unknown provider outcome. The
 * caller still sends at most once because FCM cannot supply an idempotency key.
 */
export function summarizeManagerReminderDelivery({ attempted = 0, delivered = 0, failed = 0 }) {
  if (attempted === 0) {
    return { deliveryStatus: "NO_ACTIVE_DEVICES", hasConfirmedDelivery: false };
  }

  if (delivered === attempted) {
    return { deliveryStatus: "SENT", hasConfirmedDelivery: true };
  }

  if (delivered > 0) {
    return {
      deliveryStatus: "PARTIAL",
      hasConfirmedDelivery: true,
      failureSummary: "Some manager devices did not confirm FCM delivery.",
    };
  }

  return {
    deliveryStatus: "FAILED",
    hasConfirmedDelivery: false,
    failureSummary: "No manager device confirmed FCM delivery.",
  };
}

/**
 * Atomically claims one logical delivery window. A caller only sends after a
 * successful claim, so scheduler retries cannot create duplicate manager pushes.
 */
export async function claimReminderDelivery({ database, deliveryReference, deliveryData }) {
  return database.runTransaction(async (transaction) => {
    const existing = await transaction.get(deliveryReference);
    if (existing.exists) return false;

    transaction.create(deliveryReference, deliveryData);
    return true;
  });
}
