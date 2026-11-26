export const cleanerMessagingWorkerPath = "/cleaner-messaging-sw.js";
export const cleanerMessagingWorkerScope = "/agenda/push/";
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
export function openCleanerPushDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("cleanflow-cleaner-push-binding", 2);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion === 0) request.result.createObjectStore("installation");
      request.result.createObjectStore("receipts", { autoIncrement: true });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export async function cleanerPushBinding(action, sessionId, bindingId, language, registrationRevision) {
  const db = await openCleanerPushDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const clearsReceipts = ["clear", "invalidate", "revokePermission"].includes(action);
      const tx = db.transaction(clearsReceipts ? ["installation", "receipts"] : "installation",
        action === "read" ? "readonly" : "readwrite");
      const store = tx.objectStore("installation");
      const read = store.get("active");
      let result = null;
      read.onsuccess = () => {
        const current = read.result;
        if (action === "read") result = current || null;
        if (action === "claim" && current?.sessionId === sessionId) {
          result = current;
          // Upgrade an existing owner's display format when they next open the Hub.
          if (current.noticeVersion !== 2) {
            result = { ...current, noticeVersion: 2 };
            store.put(result, "active");
          }
        }
        if (action === "claim" && !current?.sessionId && current?.blockedSessionId !== sessionId) {
          result = { sessionId, noticeVersion: 2 };
          store.put(result, "active");
        }
        if (action === "set" && current?.sessionId === sessionId
          && (registrationRevision > (current.registrationRevision || 0)
            || (registrationRevision === current.registrationRevision && current.bindingId === bindingId))) {
          result = current;
          store.put({ sessionId, bindingId, language, registrationRevision, noticeVersion: 2 }, "active");
        }
        if (action === "startMigration" && current?.sessionId === sessionId) {
          result = current;
          store.put({ ...current, scopeMigrationPending: true }, "active");
        }
        if (action === "invalidate" && current?.sessionId === sessionId
          && (registrationRevision == null || current.registrationRevision === registrationRevision)) {
          result = current;
          store.put({ sessionId, registrationRevision: current.registrationRevision,
            ...(current.scopeMigrationPending && { scopeMigrationPending: true }) }, "active");
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
        if (clearsReceipts && result) tx.objectStore("receipts").clear();
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Queue entries carry only receipt fields. Check ownership in the same
 * transaction so a late worker or upload cannot cross an account switch. */
export async function cleanerPushReceipts(action, sessionId, value) {
  const db = await openCleanerPushDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["installation", "receipts"], action === "read" ? "readonly" : "readwrite");
      const store = tx.objectStore("receipts");
      const owner = tx.objectStore("installation").get("active");
      let result = [];
      owner.onsuccess = () => {
        if (!sessionId || owner.result?.sessionId !== sessionId) return;
        if (action === "append") {
          if (!owner.result.bindingId) return;
          store.add(value);
          const keys = store.getAllKeys();
          keys.onsuccess = () => {
            for (const key of keys.result.slice(0, Math.max(0, keys.result.length - 30))) store.delete(key);
          };
        }
        if (action === "read") {
          const keys = store.getAllKeys(undefined, 20);
          const entries = store.getAll(undefined, 20);
          entries.onsuccess = () => { result = entries.result.map((receipt, index) => ({ key: keys.result[index], receipt })); };
        }
        if (action === "acknowledge") {
          for (const key of value) store.delete(key);
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Build lock-screen copy locally from an installation-bound event. */
export function cleanerPushDisplay(payload, currentBinding) {
  const data = payload?.data;
  if (payload?.notification || !data || !currentBinding?.bindingId
    || data.cleanerBindingId !== currentBinding.bindingId
    || typeof data.eventId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(data.eventId)) return null;
  const language = currentBinding.language;
  let body = {
    pt: "Abra o CleanFlow para ver seus avisos.",
    es: "Abre CleanFlow para ver tus avisos.",
  }[language] || "Open CleanFlow to see your notifications.";
  if (currentBinding.noticeVersion === 2 && data.noticeType === "RESCHEDULED") {
    body = {
      pt: "Um serviço mudou de horário. Abra Minha agenda para confirmar.",
      es: "Cambió el horario de un servicio. Abre Mi agenda para confirmar.",
    }[language] || "A service changed. Open My Schedule to confirm.";
  } else if (typeof data.rescheduleDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.rescheduleDate)
    && typeof data.rescheduleStart === "string" && /^(?:(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(data.rescheduleStart)) {
    const date = new Date(data.rescheduleDate + "T00:00:00Z");
    if (date.toJSON()?.slice(0, 10) === data.rescheduleDate) {
      const locale = { pt: "pt-BR", es: "es-ES" }[language] || "en-US";
      const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
      const time = [day, data.rescheduleStart].filter(Boolean).join(" · ");
      body = language === "pt" ? "A data mudou para " + time + ". Você pode?"
        : language === "es" ? "El servicio cambió a " + time + ". ¿Puedes?"
          : "The service moved to " + time + ". Can you make it?";
    }
  }
  return {
    title: "CleanFlow",
    options: {
      body,
      tag: `cleanflow-cleaner-${data.eventId}`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { cleanerBindingId: currentBinding.bindingId },
    },
  };
}
