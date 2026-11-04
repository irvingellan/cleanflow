import { useCallback, useEffect, useRef, useState } from "react";
import { cleanerMessagingWorkerPath, cleanerPushReceiptEvent } from "./cleanerPushBinding.js";
import { Icon } from "../../components/Icon.jsx";
import { inboxMessage } from "./notificationInboxMessages.js";
import { notificationInboxEnabled } from "./notificationInboxMode.js";
import { notificationInboxService } from "./notificationInboxService.js";

const pageSize = 25;
const empty = { items: [], loadedUnreadCount: 0, hasOlder: false, nextCursor: null, loadingOlder: false };

function unreadCount(items) {
  return items.filter((item) => item.read === false).length;
}

export function useNotificationInbox({ role, sessionKey, service = notificationInboxService }) {
  const enabled = notificationInboxEnabled();
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
            sessionKey, state: "ready", items, loadedUnreadCount: unreadCount(items),
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
    if (!enabled || !sessionKey) return undefined;
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
  }, [enabled, refresh, role, sessionKey]);

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
        return { ...previous, items, loadedUnreadCount: unreadCount(items) };
      });
    }
    return result;
  }

  const data = enabled && snapshot.sessionKey === sessionKey ? snapshot : { state: "loading", ...empty };
  return {
    ...data, refresh,
    loadOlder: () => data.nextCursor && load(data.nextCursor),
    mark: (id) => action("mark", id), open: (id) => action("open", id),
  };
}

function unreadLabel(language, { loadedUnreadCount, hasOlder }) {
  return inboxMessage(language, hasOlder ? "inbox.loadedUnreadCount" : "inbox.unreadCount", { count: loadedUnreadCount });
}

export function NotificationInboxBadge({ inbox, language, className }) {
  if (inbox.state !== "ready" || (!inbox.loadedUnreadCount && !inbox.hasOlder)) return null;
  return (
    <>
      <span className={className} aria-hidden="true">{inbox.loadedUnreadCount}{inbox.hasOlder && "+"}</span>
      <span className="visually-hidden">{unreadLabel(language, inbox)}</span>
    </>
  );
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
        if (result?.state !== "opened") {
          setError("inbox.targetUnavailable");
        } else {
          // This is a presentation hint only: the authorized server response
          // remains the sole source of the destination and current Job id.
          const interested = inbox.items.find((item) => item.id === id)?.type === "CLEANER_INTERESTED";
          const opened = interested && result.destination?.kind === "JOB"
            ? await onOpen(result.destination, { initialFocus: "interest" })
            : await onOpen(result.destination);
          if (opened === false) setError("inbox.targetUnavailable");
        }
      } else if (result?.state !== "read") {
        setError("inbox.actionError");
      }
    } catch {
      if (mounted.current) setError("inbox.actionError");
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  const counts = {
    all: inbox.items.length,
    unread: inbox.items.filter(({ read }) => !read).length,
    read: inbox.items.filter(({ read }) => read).length,
  };

  return (
    <section className="panel cf-inbox" aria-labelledby="notification-inbox-title">
      {onBack && <button type="button" className="back-button" onClick={onBack}><Icon name="arrowL" size={16} />{t("inbox.back")}</button>}
      <header className="cf-page-header cf-inbox__header">
        <div className="cf-page-header__text">
          <h2 className="panel__title" id="notification-inbox-title">{t("inbox.title")}</h2>
          {inbox.state === "ready" && <p className="cf-page-context" role="status">{unreadLabel(language, inbox)}</p>}
        </div>
        <button type="button" className="button button--small" onClick={inbox.refresh}>
          <Icon name="refresh" size={16} />{t("inbox.refresh")}
        </button>
      </header>
      <div className="cf-segmented" role="group" aria-label={t("inbox.filter")}>
        {["all", "unread", "read"].map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
          <span>{t(`inbox.filter.${key}`)}</span>
          {inbox.state === "ready" && <span className="cf-segmented__count" aria-hidden="true">{counts[key]}</span>}
        </button>)}
      </div>
      {inbox.hasOlder && <p className="cf-inbox__note"><Icon name="info" size={16} />{t("inbox.window")}</p>}
      {inbox.state === "loading" && <div className="cf-inbox__loading" role="status">
        <span className="visually-hidden">{t("inbox.loading")}</span>
        {[0, 1, 2].map((key) => <span key={key} className="cf-skeleton-row" aria-hidden="true"><span /><span /></span>)}
        <p aria-hidden="true">{t("inbox.loading")}</p>
      </div>}
      {inbox.state === "error" && <div className="cf-banner cf-banner--risk" role="alert">
        <Icon name="alert" size={18} /><p>{t("inbox.loadError")}</p>
      </div>}
      {error && <div className="cf-banner cf-banner--risk" role="alert"><Icon name="alert" size={18} /><p>{t(error)}</p></div>}
      {inbox.state === "ready" && !items.length && <p className="cf-empty cf-inbox__empty"><Icon name="inbox" size={20} />{t("inbox.empty")}</p>}
      {items.length > 0 && (
        <ul className="cf-inbox__list">
          {items.map((item) => {
            const look = noticeLook(item.type);
            return (
              <li key={item.id} className={`cf-notice cf-tone--${look.tone}${item.read ? "" : " is-unread"}`}>
                <span className="cf-notice__icon" aria-hidden="true"><Icon name={look.icon} size={20} /></span>
                <div className="cf-notice__body">
                  <div className="cf-notice__meta">
                    {!item.read && <span className="cf-notice__dot" aria-hidden="true" />}
                    <span className="cf-notice__state">{t(item.read ? "inbox.read" : "inbox.unread")}</span>
                    {Number.isFinite(item.createdAtMs) && <time dateTime={new Date(item.createdAtMs).toISOString()}>{time.format(item.createdAtMs)}</time>}
                  </div>
                  <h3>{t(`inbox.event.${item.type}`)}</h3>
                  {item.serviceLabel && <p className="cf-notice__service">{item.serviceLabel}</p>}
                  {!item.openable && <p className="cf-notice__unavailable">{t("inbox.targetUnavailable")}</p>}
                </div>
                <div className="cf-notice__actions">
                  {item.openable && <button type="button" className={`button${item.read ? "" : " button--primary"}`} disabled={busyId !== null} onClick={() => act("open", item.id)}>
                    {t(look.action)}
                  </button>}
                  {!item.read && <button type="button" className="button button--text" disabled={busyId !== null} onClick={() => act("mark", item.id)}>{t("inbox.markRead")}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {inbox.nextCursor && <button type="button" className="button cf-inbox__older" disabled={inbox.loadingOlder}
        onClick={inbox.loadOlder}>{t(inbox.loadingOlder ? "inbox.loading" : "inbox.loadOlder")}</button>}
    </section>
  );
}

const noticeLooks = {
  CLEANER_INTERESTED: { icon: "userCheck", tone: "attention", action: "inbox.action.reviewInterested" },
  CHECKLIST_READY_FOR_REVIEW: { icon: "clipCheck", tone: "attention", action: "inbox.action.reviewChecklist" },
  ASSIGNMENT_CONFIRMED: { icon: "checkCircle", tone: "success", action: "inbox.action.openJob" },
  AUTO_ASSIGNMENT_CONFIRMED: { icon: "checkCircle", tone: "success", action: "inbox.action.openJob" },
  TOMORROW_19: { icon: "calendar", tone: "info", action: "inbox.action.openDashboard" },
  TODAY_07: { icon: "calendar", tone: "info", action: "inbox.action.openDashboard" },
  NEW_OFFER: { icon: "send", tone: "attention", action: "inbox.action.openOffer" },
  AUTO_ASSIGNED: { icon: "checkCircle", tone: "success", action: "inbox.action.openJob" },
  ASSIGNED: { icon: "checkCircle", tone: "success", action: "inbox.action.openJob" },
  RESCHEDULED: { icon: "clock", tone: "warning", action: "inbox.action.openJob" },
  CANCELLED: { icon: "x", tone: "risk", action: "inbox.open" },
  UNASSIGNED: { icon: "userX", tone: "risk", action: "inbox.open" },
};

function noticeLook(type) {
  return noticeLooks[type] || { icon: "bell", tone: "neutral", action: "inbox.open" };
}
