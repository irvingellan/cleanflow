import { managerReminderPayload } from "./managerReminders.js";

export const managerReminderProviders = Object.freeze({
  FCM: "fcm",
  ONESIGNAL: "onesignal",
});

const oneSignalEndpoint = "https://api.onesignal.com/notifications";
const oneSignalAliasBatchSize = 20_000;
// A bounded request keeps a scheduled invocation from waiting indefinitely. A
// timeout is intentionally ambiguous because OneSignal may have accepted it.
export const oneSignalRequestTimeoutMs = 15_000;

function deviceData(device) {
  return typeof device?.data === "function" ? device.data() : device;
}

function timestampValue(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(value) ? value : 0;
}

function validLanguage(language) {
  return ["en", "pt", "es"].includes(language) ? language : "pt";
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => (
    values.slice(index * size, (index + 1) * size)
  ));
}

/**
 * The migration intentionally keeps the FCM device registry as the recipient
 * policy. OneSignal receives one External ID per Firebase user, so a manager
 * with several registered browsers cannot receive duplicate language batches.
 */
export function oneSignalRecipientsFromManagerDevices(devices) {
  const recipientsByUserId = new Map();

  devices.forEach((device) => {
    const data = deviceData(device);
    if (data?.active !== true || typeof data?.userId !== "string" || !data.userId) return;

    const candidate = {
      userId: data.userId,
      language: validLanguage(data.language),
      updatedAt: timestampValue(data.updatedAt || data.lastSeenAt || data.createdAt),
    };
    const existing = recipientsByUserId.get(candidate.userId);

    if (!existing || candidate.updatedAt > existing.updatedAt) {
      recipientsByUserId.set(candidate.userId, candidate);
    }
  });

  return [...recipientsByUserId.values()].sort((left, right) => left.userId.localeCompare(right.userId));
}

export function oneSignalRecipientGroups(recipients) {
  const recipientsByLanguage = new Map();

  recipients.forEach((recipient) => {
    const language = validLanguage(recipient.language);
    const userIds = recipientsByLanguage.get(language) || [];
    userIds.push(recipient.userId);
    recipientsByLanguage.set(language, userIds);
  });

  return [...recipientsByLanguage.entries()].flatMap(([language, userIds]) => (
    chunks(userIds, oneSignalAliasBatchSize).map((externalIds) => ({ language, externalIds }))
  ));
}

export function managerReminderProvider(value) {
  return String(value || "").trim().toLowerCase() === managerReminderProviders.ONESIGNAL
    ? managerReminderProviders.ONESIGNAL
    : managerReminderProviders.FCM;
}

function oneSignalConfigurationError(message) {
  const error = new Error(message);
  error.code = "failed-precondition";
  return error;
}

/**
 * The launch URL is an explicit server parameter, but it must still target
 * this Firebase project's Hosting origin. This keeps a provider configuration
 * mistake from sending a manager to an unrelated site.
 */
export function validateOneSignalLaunchUrl(launchUrl, projectId) {
  const normalizedProjectId = String(projectId || "").trim();
  const configuredUrl = String(launchUrl || "").trim();

  if (!normalizedProjectId || !configuredUrl) {
    throw oneSignalConfigurationError("OneSignal reminder launch URL is not configured.");
  }

  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw oneSignalConfigurationError("OneSignal reminder launch URL is invalid.");
  }

  const allowedOrigins = new Set([
    `https://${normalizedProjectId}.web.app`,
    `https://${normalizedProjectId}.firebaseapp.com`,
  ]);

  if (
    url.protocol !== "https:"
    || !allowedOrigins.has(url.origin)
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw oneSignalConfigurationError("OneSignal reminder launch URL is not an approved CleanFlow Hosting URL.");
  }

  return `${url.origin}/`;
}

export function validateOneSignalReminderConfiguration({ appId, restApiKey, launchUrl, projectId }) {
  if (!String(appId || "").trim() || !String(restApiKey || "").trim()) {
    throw oneSignalConfigurationError("OneSignal reminder transport is not configured.");
  }

  return {
    appId: appId.trim(),
    restApiKey: restApiKey.trim(),
    launchUrl: validateOneSignalLaunchUrl(launchUrl, projectId),
  };
}

function absoluteHttpsLaunchUrl(launchUrl) {
  try {
    const url = new URL(String(launchUrl || ""));
    if (url.protocol === "https:") return url.toString();
  } catch {
    // The full project-origin allowlist is enforced during configuration.
  }
  throw oneSignalConfigurationError("OneSignal reminder launch URL must be an absolute HTTPS URL.");
}

export function oneSignalMessageRequest({ appId, externalIds, payload, launchUrl }) {
  return {
    app_id: appId,
    target_channel: "push",
    include_aliases: { external_id: externalIds },
    headings: { en: payload.title },
    contents: { en: payload.body },
    data: {
      eventId: payload.eventId,
      eventType: payload.eventType,
      link: payload.link,
    },
    url: absoluteHttpsLaunchUrl(launchUrl),
  };
}

function oneSignalHttpFailure(response) {
  return {
    accepted: false,
    noRecipients: false,
    failureCode: `http-${response.status}`,
    failureSummary: "OneSignal rejected the reminder request.",
  };
}

async function oneSignalResponseResult(response) {
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      return {
        ambiguous: true,
        failureCode: `http-${response.status}`,
        failureSummary: "OneSignal did not confirm the reminder request outcome.",
      };
    }
    return oneSignalHttpFailure(response);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return {
      ambiguous: true,
      failureCode: "malformed-success-response",
      failureSummary: "OneSignal did not confirm the reminder request outcome.",
    };
  }

  if (typeof body?.id === "string" && body.id) {
    return { accepted: true, noRecipients: false };
  }

  // The REST API documentation describes a missing message id as only likely
  // to mean no active subscriptions. Do not turn that uncertainty into a
  // terminal no-recipient result that could suppress a manager reminder.
  return {
    ambiguous: true,
    failureCode: "missing-message-id",
    failureSummary: "OneSignal did not confirm the reminder request outcome.",
  };
}

function annotateAmbiguousOneSignalError(error, {
  attemptedRecipients,
  acceptedRecipients,
  failedRecipients,
  noActiveRecipients,
}) {
  error.managerReminderProvider = managerReminderProviders.ONESIGNAL;
  error.managerReminderAttemptedRecipients = attemptedRecipients;
  error.managerReminderAcceptedRecipients = acceptedRecipients;
  error.managerReminderFailedRecipients = failedRecipients;
  error.managerReminderNoActiveRecipients = noActiveRecipients;
  return error;
}

function ambiguousOneSignalError({ code, message }) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * OneSignal's REST API accepts External IDs, which are Firebase Auth UIDs in
 * CleanFlow. A transport error remains ambiguous: the provider may have
 * accepted a prior batch, so callers must not fall back to FCM or retry.
 */
export async function sendOneSignalManagerReminder({
  reminder,
  managerDevices,
  appId,
  restApiKey,
  launchUrl,
  fetchImplementation = fetch,
  requestTimeoutMs = oneSignalRequestTimeoutMs,
}) {
  const recipients = oneSignalRecipientsFromManagerDevices(managerDevices);
  const groups = oneSignalRecipientGroups(recipients);

  if (groups.length === 0) {
    return {
      provider: managerReminderProviders.ONESIGNAL,
      attemptedRecipients: 0,
      acceptedRecipients: 0,
      failedRecipients: 0,
      noActiveRecipients: 0,
    };
  }

  let acceptedRecipients = 0;
  let failedRecipients = 0;
  let noActiveRecipients = 0;
  let failureSummary = null;

  for (const group of groups) {
    const payload = {
      ...managerReminderPayload(reminder, group.language),
      eventId: `manager-reminder-${reminder.targetDate}-${reminder.type}`,
    };
    const requestController = new AbortController();
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = ambiguousOneSignalError({
          code: "onesignal-timeout",
          message: "OneSignal did not confirm the reminder request outcome.",
        });
        reject(error);
        requestController.abort();
      }, requestTimeoutMs);
    });
    let result;

    try {
      result = await Promise.race([
        (async () => {
          const response = await fetchImplementation(oneSignalEndpoint, {
            method: "POST",
            headers: {
              Authorization: `Key ${restApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(oneSignalMessageRequest({
              appId,
              externalIds: group.externalIds,
              payload,
              launchUrl,
            })),
            signal: requestController.signal,
          });
          return oneSignalResponseResult(response);
        })(),
        timeout,
      ]);
    } catch (error) {
      const ambiguousError = ambiguousOneSignalError({
        code: error?.code || "onesignal-request-unknown",
        message: "OneSignal did not confirm the reminder request outcome.",
      });
      throw annotateAmbiguousOneSignalError(ambiguousError, {
        attemptedRecipients: recipients.length,
        acceptedRecipients,
        failedRecipients,
        noActiveRecipients,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (result.ambiguous) {
      throw annotateAmbiguousOneSignalError(ambiguousOneSignalError({
        code: result.failureCode,
        message: result.failureSummary,
      }), {
        attemptedRecipients: recipients.length,
        acceptedRecipients,
        failedRecipients,
        noActiveRecipients,
      });
    }

    if (result.accepted) {
      acceptedRecipients += group.externalIds.length;
    } else if (result.noRecipients) {
      noActiveRecipients += group.externalIds.length;
      failureSummary ||= result.failureSummary;
    } else {
      failedRecipients += group.externalIds.length;
      failureSummary ||= result.failureSummary;
    }
  }

  return {
    provider: managerReminderProviders.ONESIGNAL,
    attemptedRecipients: recipients.length,
    acceptedRecipients,
    failedRecipients,
    noActiveRecipients,
    failureSummary,
  };
}

export function summarizeOneSignalReminderDelivery({
  attemptedRecipients = 0,
  acceptedRecipients = 0,
  failedRecipients = 0,
  noActiveRecipients = 0,
  failureSummary = null,
}) {
  if (attemptedRecipients === 0 || noActiveRecipients === attemptedRecipients) {
    return {
      deliveryStatus: "NO_ACTIVE_RECIPIENTS",
      hasConfirmedDelivery: false,
      ...(failureSummary ? { failureSummary } : {}),
    };
  }

  if (acceptedRecipients === attemptedRecipients) {
    return { deliveryStatus: "SENT", hasConfirmedDelivery: true };
  }

  if (acceptedRecipients > 0) {
    return {
      deliveryStatus: "PARTIAL",
      hasConfirmedDelivery: true,
      failureSummary: failureSummary || "Some manager recipients were not included in accepted OneSignal message batches.",
    };
  }

  if (failedRecipients > 0) {
    return {
      deliveryStatus: "FAILED",
      hasConfirmedDelivery: false,
      failureSummary: failureSummary || "OneSignal did not accept the manager reminder.",
    };
  }

  return { deliveryStatus: "NO_ACTIVE_RECIPIENTS", hasConfirmedDelivery: false };
}

export async function dispatchManagerReminder({ provider, reminder, sendFcm, sendOneSignal }) {
  if (provider === managerReminderProviders.ONESIGNAL) return sendOneSignal(reminder);
  return sendFcm(reminder);
}

export function managerReminderDeliveryAuditFields(delivery, outcome) {
  if (delivery.provider === managerReminderProviders.ONESIGNAL) {
    return {
      deliveryProvider: managerReminderProviders.ONESIGNAL,
      attemptedRecipients: delivery.attemptedRecipients,
      // OneSignal accepts message batches, not physical device delivery.
      acceptedRecipients: delivery.acceptedRecipients,
      failedRecipients: delivery.failedRecipients,
      noActiveRecipients: delivery.noActiveRecipients,
      ...(outcome.failureSummary ? { failureSummary: outcome.failureSummary } : {}),
    };
  }

  return {
    deliveryProvider: managerReminderProviders.FCM,
    attemptedDevices: delivery.attempted,
    deliveredDevices: delivery.delivered,
    failedDevices: delivery.failed,
    invalidatedDevices: delivery.invalidated,
    invalidDeviceCleanupFailed: delivery.invalidDeviceCleanupFailed,
    ...(outcome.failureSummary ? { failureSummary: outcome.failureSummary } : {}),
  };
}

export function unknownManagerReminderDeliveryAuditFields(error) {
  if (error?.managerReminderProvider === managerReminderProviders.ONESIGNAL) {
    return {
      deliveryProvider: managerReminderProviders.ONESIGNAL,
      attemptedRecipients: error.managerReminderAttemptedRecipients || 0,
      acceptedRecipients: error.managerReminderAcceptedRecipients || 0,
      failedRecipients: error.managerReminderFailedRecipients || 0,
      noActiveRecipients: error.managerReminderNoActiveRecipients || 0,
      failureCode: error?.code || "unknown",
      failureSummary: "OneSignal request outcome was not confirmed.",
    };
  }

  return {
    deliveryProvider: managerReminderProviders.FCM,
    attemptedDevices: error?.managerReminderAttemptedDevices || 0,
    failureCode: error?.code || "unknown",
    failureSummary: "FCM request outcome was not confirmed.",
  };
}
