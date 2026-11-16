import { HttpsError } from "firebase-functions/v2/https";
import { changeNotificationInboxItemForRequest, listNotificationInboxForRequest } from "../notificationInbox.js";
import { db, organizationId } from "../runtime/firebase.js";

function requireNotificationInboxEnabled() {
  if (process.env.NOTIFICATION_INBOX_MODE === "disabled") {
    throw new HttpsError("failed-precondition", "The notification inbox is temporarily unavailable.");
  }
}

export async function listNotificationInbox(request) {
  requireNotificationInboxEnabled();
  return listNotificationInboxForRequest(db, { organizationId, request });
}

export async function markNotificationRead(request) {
  requireNotificationInboxEnabled();
  return changeNotificationInboxItemForRequest(db, { organizationId, request, open: false });
}

export async function openNotificationInboxItem(request) {
  requireNotificationInboxEnabled();
  return changeNotificationInboxItemForRequest(db, { organizationId, request, open: true });
}
