import { useCallback, useEffect, useRef, useState } from "react";
import { cleanerMessagingWorkerPath, cleanerPushReceiptEvent } from "./cleanerPushBinding.js";
import { inboxMessage } from "./notificationInboxMessages.js";
import { notificationInboxService } from "./notificationInboxService.js";

const pageSize = 25;
const empty = { items: [], unreadCount: 0, hasOlder: false, nextCursor: null, loadingOlder: false };

function unreadCount(items) {
  return items.filter((item) => item.read === false).length;
}

export function useNotificationInbox({ role, sessionKey, service = notificationInboxService }) {
  const [snapshot, setSnapshot] = useState({ sessionKey: null, state: "loading", ...empty });
  const current = useRef(null);
  const load = useCallback(async (cursor = null) => {
    const request = current.current;
    if (!request || request.sessionKey !== sessionKey) return;
    if (request.loading) {
      // A resume during pagination must still reread the current first page.
      if (cursor === null && request.loadingOlder) request.refreshAfterPage = true;
      return;
    }
    request.loading = true;
    request.loadingOlder = Boolean(cursor);
    if (cursor) setSnapshot((previous) => ({ ...previous, loadingOlder: true }));
    const version = request.version;
    try {
      const data = await service.list(role, { pageSize, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(data?.items) || !Number.isSafeInteger(data.unreadCount)) throw new Error("Inbox response missing.");
      if (request === current.current && version === request.version) {
        setSnapshot((previous) => {
          const prior = cursor && previous.sessionKey === sessionKey ? previous.items : [];
          const loaded = new Map(prior.map((item) => [item.id, item]));
          data.items.forEach((item) => loaded.set(item.id, item));
          const items = [...loaded.values()];
          return {
            sessionKey, state: "ready", items, unreadCount: unreadCount(items),
            hasOlder: data.hasOlder === true, nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
            loadingOlder: false,
          };
        });
      }
    } catch {
      // Drop stale details on a failed refresh or page request, including revoked access.
      if (request === current.current && version === request.version) setSnapshot({ sessionKey, state: "error", ...empty });
    } finally {
      request.loading = false;
      request.loadingOlder = false;
      if (request === current.current) {
        setSnapshot((previous) => previous.loadingOlder ? { ...previous, loadingOlder: false } : previous);
        if (request.refreshAfterPage) {
          request.refreshAfterPage = false;
          void load();
        }
      }
    }
  }, [role, sessionKey, service]);
  const refresh = useCallback(() => load(), [load]);

  useEffect(() => {
    if (!sessionKey) return undefined;
    const request = { sessionKey, version: 0, loading: false };
    current.current = request;
    void refresh();
    let lastResume = Date.now();
    const resume = () => {
      if (document.visibilityState === "hidden" || navigator.onLine === false || Date.now() - lastResume < 1000) return;
      lastResume = Date.now();
      void refresh();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    const worker = role === "CLEANER" ? navigator.serviceWorker : null;
    const onPush = (event) => {
      if (event.data?.type === cleanerPushReceiptEvent
        && event.source?.scriptURL === new URL(cleanerMessagingWorkerPath, window.location.origin).href) void refresh();
    };
    worker?.addEventListener?.("message", onPush);
    return () => {
      if (request === current.current) current.current = null;
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      worker?.removeEventListener?.("message", onPush);
    };
  }, [refresh, role, sessionKey]);

  async function action(method, id) {
    const request = current.current;
    if (!request || request.sessionKey !== sessionKey) return { state: "superseded" };
    let result;
    try {
      result = await service[method](role, id);
    } catch (error) {
      if (request === current.current && ["functions/permission-denied", "functions/unauthenticated"].includes(error?.code)) {
        request.version += 1;
        setSnapshot({ sessionKey, state: "error", ...empty });
      }
      throw error;
    }
    if (request !== current.current) return { state: "superseded" };
    if (["read", "opened", "unavailable"].includes(result?.state)) {
      request.version += 1;
      setSnapshot((previous) => {
        const items = previous.items.map((item) => item.id !== id ? item : result.state === "unavailable"
          ? { ...item, serviceLabel: null, openable: false } : { ...item, read: true });
        return { ...previous, items, unreadCount: unreadCount(items) };
      });
    }
    return result;
  }

  const data = snapshot.sessionKey === sessionKey ? snapshot : { state: "loading", ...empty };
  return {
    ...data, refresh,
    loadOlder: () => data.nextCursor && load(data.nextCursor),
    mark: (id) => action("mark", id), open: (id) => action("open", id),
  };
}

export function NotificationInbox({ inbox, language, onOpen, onBack }) {
  const t = (key, params) => inboxMessage(language, key, params);
  const locale = { pt: "pt-BR", en: "en-US", es: "es-US" }[language];
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const mounted = useRef(false);
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });
  const items = inbox.items.filter(({ read }) => filter === "all" || (filter === "read") === read);
  useEffect(() => { void inbox.refresh(); }, [inbox.refresh]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function act(method, id) {
    setError(null);
    setBusyId(id);
    try {
      const result = await inbox[method](id);
      if (!mounted.current || result?.state === "superseded") return;
      if (method === "open") {
        if (result?.state !== "opened" || await onOpen(result.destination) === false) setError("inbox.targetUnavailable");
      } else if (result?.state !== "read") {
        setError("inbox.actionError");
      }
    } catch {
      if (mounted.current) setError("inbox.actionError");
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="notification-inbox-title">
      <h2 className="panel__title" id="notification-inbox-title">{t("inbox.title")}</h2>
      {onBack && <button type="button" className="button" onClick={onBack}>{t("inbox.back")}</button>}
      <p role="status">{t("inbox.unreadCount", { count: inbox.unreadCount })}</p>
      <div className="cfv2-segmented" role="group" aria-label={t("inbox.filter")}>
        {["all", "unread", "read"].map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{t(`inbox.filter.${key}`)}</button>)}
      </div>
      {inbox.hasOlder && <p>{t("inbox.window")}</p>}
      {inbox.state === "loading" && <p role="status">{t("inbox.loading")}</p>}
      {inbox.state === "error" && <p role="alert">{t("inbox.loadError")}</p>}
      {error && <p role="alert">{t(error)}</p>}
      <button type="button" className="button button--small" onClick={inbox.refresh}>{t("inbox.refresh")}</button>
      {inbox.state === "ready" && !items.length && <p>{t("inbox.empty")}</p>}
      {items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <h3>{t(`inbox.event.${item.type}`)}</h3>
              {item.serviceLabel && <p>{item.serviceLabel}</p>}
              {Number.isFinite(item.createdAtMs) && <time dateTime={new Date(item.createdAtMs).toISOString()}>{time.format(item.createdAtMs)}</time>}
              <p>{t(item.read ? "inbox.read" : "inbox.unread")}</p>
              {!item.openable && <p>{t("inbox.targetUnavailable")}</p>}
              {item.openable && <button type="button" className="button button--small" disabled={busyId !== null} onClick={() => act("open", item.id)}>{t("inbox.open")}</button>}
              {!item.read && <button type="button" className="button button--small" disabled={busyId !== null} onClick={() => act("mark", item.id)}>{t("inbox.markRead")}</button>}
            </li>
          ))}
        </ul>
      )}
      {inbox.nextCursor && <button type="button" className="button button--small" disabled={inbox.loadingOlder}
        onClick={inbox.loadOlder}>{t(inbox.loadingOlder ? "inbox.loading" : "inbox.loadOlder")}</button>}
    </section>
  );
}
