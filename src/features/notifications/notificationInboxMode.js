export function notificationInboxEnabled() {
  return import.meta.env.VITE_NOTIFICATION_INBOX_MODE !== "disabled";
}
