import { useEffect, useMemo, useState } from "react";
import { acceptedNotDisplayed, cleanerAgenda, type CleanerOfferView, inboxItems, lockScreenPushes, managerPending, unreadCount } from "../engine/selectors.ts";
import type { Command, Device, Locale, World } from "../engine/types.ts";
import { formatClock, formatDateKey, formatDay, notificationCopy, ui, type MessageKey } from "../i18n/messages.ts";
import { Icon } from "./icons.tsx";

type Screen = "lock" | "inbox" | "app";

interface PhoneProps {
  world: World;
  deviceId: string;
  locale: Locale;
  apply: (cmd: Command) => void;
  onExpand?: () => void;
  simple?: boolean;
}

function readiness(d: Device): { key: MessageKey; tone: string } | null {
  if (d.platform === "ios" && !d.standalone) return { key: "installGuideTitle", tone: "tone-attn" };
  if (d.permission === "denied") return { key: "pushOff", tone: "tone-warn" };
  if (d.permission === "default") return { key: "pushOff", tone: "tone-info" };
  if (d.subscription !== "active") return { key: "pushNotRegistered", tone: "tone-info" };
  return null;
}

export function PhoneChips({ world, device, locale }: { world: World; device: Device; locale: Locale }) {
  const t = (k: MessageKey) => ui(locale, k);
  const account = device.signedInUserId ? world.users[device.signedInUserId] : undefined;
  const permTone = device.permission === "granted" ? "tone-ok" : device.permission === "denied" ? "tone-risk" : "tone-attn";
  const subTone = device.subscription === "active" ? "tone-ok" : device.subscription === "stale" ? "tone-warn" : "tone-neutral";
  return (
    <div className="phone-chips" aria-label={t("devices")}>
      <span className="chip tone-neutral">{device.browser}</span>
      <span className={`chip ${device.standalone ? "tone-ok" : "tone-attn"}`}>{device.standalone ? t("standalone") : t("tab")}</span>
      <span className={`chip ${permTone}`}>{t("permission")}: {device.permission}</span>
      <span className={`chip ${subTone}`}>{t("subscription")}: {device.subscription}</span>
      <span className={`chip ${device.online ? "tone-ok" : "tone-risk"}`}>
        <Icon name={device.online ? "wifi" : "wifiOff"} size={12} /> {device.online ? t("online") : t("offline")}
      </span>
      <span className={`chip ${account && account.id !== device.userId ? "tone-warn" : "tone-neutral"}`}>
        <Icon name="user" size={12} /> {account ? `${account.displayName} · ${account.orgId}` : t("noAccount")}
        {account && !account.active ? " · ✕" : ""}
      </span>
    </div>
  );
}

export function Phone({ world, deviceId, locale, apply, onExpand, simple }: PhoneProps) {
  const device = world.devices[deviceId]!;
  const t = (k: MessageKey, p: Record<string, string | number> = {}) => ui(locale, k, p);
  const tz = world.settings.timeZone;
  const [screen, setScreen] = useState<Screen>("lock");
  const [inboxTab, setInboxTab] = useState<"unread" | "all" | "archived">("all");
  const [hideContext, setHideContext] = useState(false);
  const [requestAnswer, setRequestAnswer] = useState<string | null>(null);

  const account = device.signedInUserId ? world.users[device.signedInUserId] : undefined;
  const ended = !account || !account.active;
  const pushes = lockScreenPushes(world, deviceId);
  const pendingDisplay = acceptedNotDisplayed(world, deviceId);
  const items = inboxItems(world, deviceId);
  const unread = unreadCount(world, deviceId);
  const context = world.openContext[deviceId] ?? null;
  const contextKey = JSON.stringify(context) + world.timeline.filter((r) => r.step === "OPENED" && r.deviceId === deviceId).length;

  // Follow what the simulation does: a displayed push shows the lock screen,
  // an opened push/notice shows the app at the resolved context.
  useEffect(() => {
    if (pushes.length) setScreen("lock");
  }, [pushes.length]);
  useEffect(() => {
    setHideContext(false);
    setRequestAnswer(null);
    if (context) setScreen(context.kind === "inbox" ? "inbox" : "app");
  }, [contextKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = readiness(device);
  const syncTime = formatClock(locale, device.online ? world.clock : device.lastSyncAt, tz).slice(0, 5);

  const visibleItems = useMemo(
    () =>
      items.filter(({ entry }) =>
        inboxTab === "archived" ? entry.archivedAt !== null : entry.archivedAt === null && (inboxTab === "all" || entry.unread),
      ),
    [items, inboxTab],
  );

  const agenda = cleanerAgenda(world, deviceId);
  const offline = !device.online;

  const freshness = (
    <div className={`note ${offline ? "tone-attn" : "tone-ok"}`} role="status">
      {offline ? t("staleOffline", { time: syncTime }) : t("syncedAt", { time: syncTime })}
    </div>
  );

  const endedScreen = (
    <div className="ended" data-testid={`ended-${deviceId}`}>
      <Icon name="lock" size={28} />
      <h3>{t("accessEnded")}</h3>
      <p className="sec">{t("accessEndedBody")}</p>
    </div>
  );

  function renderLock() {
    const parts = formatClock(locale, world.clock, tz).slice(0, 5);
    return (
      <div className="lock" data-testid={`lock-${deviceId}`}>
        <div className="lock-time tnum">{parts}</div>
        <div className="lock-date">{formatDay(locale, world.clock, tz)}</div>
        {pushes.length === 0 && <div className="lock-empty">{t("lockEmpty")}</div>}
        {pushes.map(({ attempt, event }) => {
          const copy = notificationCopy(locale, event);
          return (
            <div key={attempt.id} className="push" data-testid="push-card">
              <div className="push-head">
                <span className="app-dot" aria-hidden="true" />
                <span>CleanFlow</span>
                <span className="sim-badge" style={{ marginLeft: "auto" }}>{t("simulated")}</span>
              </div>
              <div className="push-title">{copy.title}</div>
              <div className="push-body">{copy.body}</div>
              <div className="push-actions">
                <button className="btn btn-small btn-primary" onClick={() => apply({ type: "OPEN_PUSH", attemptId: attempt.id })}>
                  {t("tapToOpen")}
                </button>
                <button className="btn btn-small" onClick={() => apply({ type: "DISMISS_PUSH", deviceId })}>
                  {t("dismiss")}
                </button>
              </div>
            </div>
          );
        })}
        {pendingDisplay.length > 0 && (
          <div className="lock-note" title={t("acceptedTooltip")}>
            <p>{t("acceptedHint", { n: pendingDisplay.length })}</p>
            <p style={{ opacity: 0.85, marginTop: 4 }}>{t("acceptedTooltip")}</p>
            <button className="btn btn-small" style={{ marginTop: 8 }} onClick={() => apply({ type: "SIMULATE_DISPLAY", deviceId })} disabled={offline}>
              <Icon name="eye" size={14} /> {t("simulateDisplay")}
            </button>
          </div>
        )}
        <p className="lock-note">{t("simulatedPushNote")}</p>
      </div>
    );
  }

  function renderOfferCard(offer: CleanerOfferView) {
    if (!account) return null;
    return (
          <div key={offer.jobId} className="job-card" data-offer={offer.jobId}>
            <strong>{offer.propertyName}</strong>
            <span className="sec">{formatDateKey(locale, offer.date)} · {offer.start} · {t("yourAmount")}: ${offer.amount}</span>
            {offer.status === "UNAVAILABLE" && <span className="chip tone-neutral" style={{ justifySelf: "start" }}>{t("unavailableOffer")}</span>}
            {offer.status === "INTERESTED" && <span className="chip tone-info" style={{ justifySelf: "start" }}>{t("interested")}</span>}
            {offer.status === "PENDING" && (
              <div className="job-card-actions">
                {offer.mode === "AUTO" ? (
                  <button className="btn btn-small btn-primary" disabled={offline} onClick={() => apply({ type: "RESPOND_OFFER", jobId: offer.jobId, cleanerId: account.id, response: "ACCEPT" })}>
                    {t("acceptJob")}
                  </button>
                ) : (
                  <button className="btn btn-small btn-primary" disabled={offline} onClick={() => apply({ type: "RESPOND_OFFER", jobId: offer.jobId, cleanerId: account.id, response: "INTERESTED" })}>
                    {t("imInterested")}
                  </button>
                )}
                <button className="btn btn-small" disabled={offline} onClick={() => apply({ type: "RESPOND_OFFER", jobId: offer.jobId, cleanerId: account.id, response: "DECLINED" })}>
                  {t("cantDo")}
                </button>
              </div>
            )}
          </div>
    );
  }

  function renderInbox() {
    if (ended) return endedScreen;
    return (
      <div className="screen" data-testid={`inbox-${deviceId}`}>
        <div className="screen-head">
          <h3>
            <Icon name="bell" size={16} /> {t("inbox")} {unread > 0 && <span className="chip tone-risk">{unread}</span>}
          </h3>
          <button className="btn btn-small btn-ghost" onClick={() => apply({ type: "MARK_ALL_READ", deviceId })} disabled={unread === 0 || offline}>
            {t("markAllRead")}
          </button>
        </div>
        {freshness}
        {ready && !simple && (
          <div className={`note ${ready.tone}`}>
            <strong>{t(ready.key)}</strong>
            {ready.key === "installGuideTitle" && <span>{t("installGuideBody")}</span>}
            {ready.key === "pushOff" && <span>{t("pushOffBody")}</span>}
          </div>
        )}
        <div className="inbox-tabs" role="tablist" aria-label={t("inbox")}>
          {(["unread", "all", "archived"] as const).map((tab) => (
            <button key={tab} role="tab" aria-selected={inboxTab === tab} onClick={() => setInboxTab(tab)}>
              {t(tab === "unread" ? "inboxUnread" : tab === "all" ? "inboxAll" : "inboxArchived")}
            </button>
          ))}
        </div>
        {visibleItems.length === 0 && <p className="empty">{t("inboxEmpty")}</p>}
        <ul style={{ display: "grid", gap: 8 }}>
          {visibleItems.map(({ entry, event }) => {
            const copy = notificationCopy(locale, event);
            return (
              <li key={entry.id} className={`inbox-item ${entry.unread ? "is-unread" : ""}`} data-testid="inbox-item">
                <div className="inbox-item-top">
                  {entry.unread && <span className="dot" aria-label={t("inboxUnread")} />}
                  <strong>{copy.title}</strong>
                  <span className="sec tnum" style={{ fontSize: 12 }}>{formatClock(locale, entry.createdAt, tz).slice(0, 5)}</span>
                </div>
                <p>{copy.body}</p>
                {event.proposal && <span className="chip tone-attn" style={{ justifySelf: "start" }}>{t("proposalBanner")}</span>}
                <div className="inbox-item-actions">
                  <button className="btn btn-small" onClick={() => apply({ type: "OPEN_INBOX_ENTRY", deviceId, entryId: entry.id })} disabled={offline}>
                    {t("open")}
                  </button>
                  {entry.unread && (
                    <button className="btn btn-small btn-ghost" onClick={() => apply({ type: "MARK_READ", deviceId, entryId: entry.id })} disabled={offline}>
                      {t("markRead")}
                    </button>
                  )}
                  {entry.archivedAt === null && (
                    <button className="btn btn-small btn-ghost" onClick={() => apply({ type: "ARCHIVE", deviceId, entryId: entry.id })} disabled={offline}>
                      {t("archive")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  function renderContext() {
    if (!context || hideContext || context.kind === "inbox") return null;
    const back = (
      <button className="btn btn-small btn-ghost" onClick={() => setHideContext(true)} style={{ justifySelf: "start" }}>
        ← {t("back")}
      </button>
    );
    if (context.kind === "accessEnded") return endedScreen;
    if (context.kind === "unavailable") {
      const key: MessageKey = context.reason === "job_cancelled" ? "unavailableJob" : context.reason === "offer_taken" ? "unavailableOffer" : "unavailableAssigned";
      return (
        <div className="screen" data-testid={`context-${deviceId}`} data-context="unavailable">
          {back}
          <div className="note tone-neutral">
            <strong>{t("unavailable")}</strong>
            <span>{t(key)}</span>
          </div>
        </div>
      );
    }
    const job = world.jobs[context.jobId];
    if (!job) return null;
    if (context.kind === "checklist") {
      return (
        <div className="screen" data-testid={`context-${deviceId}`} data-context="checklist">
          {back}
          <h3 className="panel-title">{t("checklistScreen")}</h3>
          <div className="job-card">
            <strong>{job.propertyName}</strong>
            <span className="sec">{formatDateKey(locale, job.date)} · {job.start}</span>
          </div>
          <p className="sec">{t("checklistBody")}</p>
        </div>
      );
    }
    if (context.kind === "request") {
      return (
        <div className="screen" data-testid={`context-${deviceId}`} data-context="request">
          {back}
          <h3 className="panel-title">{t("requestScreen")}</h3>
          <div className="job-card">
            <strong>{job.propertyName}</strong>
            <span className="sec">{formatDateKey(locale, job.date)} · {job.start}</span>
          </div>
          <p className="sec">{t("requestBody")}</p>
          {requestAnswer ? (
            <div className="note tone-ok">{requestAnswer}</div>
          ) : (
            <div className="job-card-actions">
              <button className="btn btn-primary" onClick={() => setRequestAnswer(t("requestYes"))}>{t("requestYes")}</button>
              <button className="btn" onClick={() => setRequestAnswer(t("requestNo"))}>{t("requestNo")}</button>
            </div>
          )}
        </div>
      );
    }
    if (context.kind === "offer") {
      const offer = agenda.offers.find((o) => o.jobId === context.jobId);
      return (
        <div className="screen" data-testid={`context-${deviceId}`} data-context="offer">
          {back}
          <h3 className="panel-title">{t("pendingOffer")}</h3>
          {offer ? renderOfferCard(offer) : <div className="note tone-neutral">{t("unavailableOffer")}</div>}
        </div>
      );
    }
    const mine = account?.role === "CLEANER" && job.assignedCleanerId === account.id && !job.archived;
    return (
      <div className="screen" data-testid={`context-${deviceId}`} data-context={context.kind}>
        {back}
        <h3 className="panel-title">{t("jobView")}</h3>
        <div className="job-card">
          <strong>{job.propertyName}</strong>
          <span className="sec">{formatDateKey(locale, job.date)} · {job.start}</span>
          <span className={`chip ${mine ? "tone-ok" : "tone-neutral"}`} style={{ justifySelf: "start" }}>{mine ? t("confirmedForYou") : job.status}</span>
        </div>
      </div>
    );
  }

  function renderApp() {
    if (ended) return endedScreen;
    const ctx = renderContext();
    if (ctx) return ctx;
    if (account.role === "MANAGER") {
      const pending = managerPending(world, account.orgId);
      return (
        <div className="screen" data-testid={`app-${deviceId}`}>
          <div className="screen-head"><h3>{t("managerHome")}</h3></div>
          {freshness}
          <span className="micro">{t("pending")}</span>
          {pending.length === 0 && <p className="empty">{t("noJobs")}</p>}
          {pending.map((job) => (
            <div key={job.id} className="job-card">
              <strong>{job.propertyName}</strong>
              <span className="sec">{formatDateKey(locale, job.date)} · {job.start}</span>
              <span className={`chip ${job.checklist === "READY_FOR_REVIEW" ? "tone-attn" : "tone-warn"}`} style={{ justifySelf: "start" }}>
                {job.checklist === "READY_FOR_REVIEW" ? t("reviewChecklist") : t("noCleaner")}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="screen" data-testid={`app-${deviceId}`}>
        <div className="screen-head"><h3>{t("myAgenda")}</h3></div>
        {freshness}
        {agenda.jobs.length === 0 && <p className="empty">{t("noJobs")}</p>}
        {agenda.jobs.map((job) => (
          <div key={job.id} className="job-card" data-job={job.id}>
            <strong>{job.propertyName}</strong>
            <span className="sec">{formatDateKey(locale, job.date)} · {job.start}</span>
            <span className="chip tone-ok" style={{ justifySelf: "start" }}>{t("confirmedForYou")}</span>
            {!simple && (
              <div className="job-card-actions">
                <button className="btn btn-small" onClick={() => apply({ type: "CONFIRM_ATTENDANCE", jobId: job.id, cleanerId: account.id })} disabled={offline}>
                  {t("illBeThere")}
                </button>
              </div>
            )}
          </div>
        ))}
        <span className="micro" style={{ marginTop: 6 }}>{t("offers")}</span>
        {agenda.offers.length === 0 && <p className="empty">{t("noOffers")}</p>}
        {agenda.offers.map((offer) => renderOfferCard(offer))}
      </div>
    );
  }

  return (
    <div className="phone-wrap" data-testid={`phone-${deviceId}`}>
      <div className="phone-meta">
        <div className="phone-meta-top">
          <Icon name="phone" />
          <strong>{device.label}</strong>
          {onExpand && (
            <button className="btn btn-small btn-ghost" style={{ marginLeft: "auto" }} onClick={onExpand}>
              <Icon name="expand" size={14} /> {t("expand")}
            </button>
          )}
        </div>
        {!simple && <PhoneChips world={world} device={device} locale={locale} />}
      </div>
      <div className={`phone ${device.platform === "android" ? "is-android" : ""}`}>
        <div className="phone-screen">
          <div className="phone-status">
            <span className="tnum">{formatClock(locale, world.clock, tz).slice(0, 5)}</span>
            <span className="sim-badge">{t("simulated")}</span>
            <span aria-label={device.online ? t("online") : t("offline")}>
              <Icon name={device.online ? "wifi" : "wifiOff"} size={14} />
            </span>
          </div>
          <div className="phone-body">{screen === "lock" ? renderLock() : screen === "inbox" ? renderInbox() : renderApp()}</div>
          <div className="phone-tabs" role="tablist" aria-label={device.label}>
            {(["lock", "inbox", "app"] as const).map((sc) => (
              <button key={sc} role="tab" aria-selected={screen === sc} onClick={() => setScreen(sc)}>
                <Icon name={sc === "lock" ? "lock" : sc === "inbox" ? "bell" : "calendar"} size={18} />
                {t(sc)}
                {sc === "inbox" && unread > 0 && !ended && <span className="count">{unread}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
