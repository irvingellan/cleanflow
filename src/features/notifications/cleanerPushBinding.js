export const cleanerMessagingWorkerPath = "/cleaner-messaging-sw.js";
export const cleanerMessagingWorkerScope = "/cleaner-messaging-push/";
export const cleanerPushReceiptEvent = "cleanflow-cleaner-push-received";
// Sent on notification tap to an already open Minha agenda, which iOS does not navigate.
export const cleanerPushOpenInboxEvent = "cleanflow-cleaner-open-inbox";

/** Public VAPID key encoding. The release preflight also verifies the P-256 point. */
export function isCleanerVapidKey(value) {
  return typeof value === "string" && /^B[A-P][A-Za-z0-9_-]{84}[AEIMQUYcgkosw048]$/.test(value);
}

export function cleanerMessagingConfig(firebaseConfig, appId) {
  const sender = firebaseConfig.messagingSenderId;
  if (!sender || !appId || appId === firebaseConfig.appId
    || !appId.startsWith(`1:${sender}:web:`) || !/^1:[0-9]+:web:[a-zA-Z0-9]+$/.test(appId)) return null;
  return { ...firebaseConfig, appId };
}

/** One browser-local binding, distinct from Firebase's token storage. A conditional
 * IDB transaction prevents a stale registration result from replacing a new owner.
 * Self-contained so the same storage protocol runs in the generated worker. */
export async function cleanerPushBinding(action, sessionId, bindingId, language, registrationRevision) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("cleanflow-cleaner-push-binding", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("installation");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("installation", action === "read" ? "readonly" : "readwrite");
      const store = tx.objectStore("installation");
      const read = store.get("active");
      let result = null;
      read.onsuccess = () => {
        const current = read.result;
        if (action === "read") result = current || null;
        if (action === "claim" && current?.sessionId === sessionId) result = current;
        if (action === "claim" && !current?.sessionId && current?.blockedSessionId !== sessionId) {
          result = { sessionId };
          store.put(result, "active");
        }
        if (action === "set" && current?.sessionId === sessionId
          && (registrationRevision > (current.registrationRevision || 0)
            || (registrationRevision === current.registrationRevision && current.bindingId === bindingId))) {
          result = current;
          store.put({ sessionId, bindingId, language, registrationRevision }, "active");
        }
        if (action === "invalidate" && current?.sessionId === sessionId
          && (registrationRevision == null || current.registrationRevision === registrationRevision)) {
          result = current;
          store.put({ sessionId, registrationRevision: current.registrationRevision }, "active");
        }
        if (action === "revokePermission" && current?.sessionId === sessionId) {
          result = current;
          store.put({ sessionId, registrationRevision: current.registrationRevision, permissionRevocationPending: true }, "active");
        }
        if (action === "finishRevocation" && current?.sessionId === sessionId
          && current.permissionRevocationPending && current.registrationRevision === registrationRevision) {
          store.put({ sessionId, registrationRevision }, "active");
        }
        if (action === "clear" && current?.sessionId === sessionId) {
          store.put({ blockedSessionId: sessionId }, "active");
          result = current;
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** One neutral lock-screen message. Never use FCM-provided copy, links or labels. */
export function cleanerPushDisplay(payload, currentBinding) {
  const data = payload?.data;
  if (payload?.notification || !data || !currentBinding?.bindingId
    || data.cleanerBindingId !== currentBinding.bindingId
    || typeof data.eventId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(data.eventId)) return null;
  return {
    title: "CleanFlow",
    options: {
      body: {
        pt: "Abra o CleanFlow para ver seus avisos.",
        es: "Abre CleanFlow para ver tus avisos.",
      }[currentBinding.language] || "Open CleanFlow to see your notifications.",
      tag: `cleanflow-cleaner-${data.eventId}`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { cleanerBindingId: currentBinding.bindingId },
    },
  };
}
