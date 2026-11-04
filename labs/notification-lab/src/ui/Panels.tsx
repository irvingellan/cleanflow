import { useMemo, useState } from "react";
import { attemptLevel, personaTable, recipientCounts, sanitizedPayload } from "../engine/selectors.ts";
import { isTerminal, fingerprint } from "../engine/session.ts";
import type { Command, Device, Locale, ProviderMode, TimelineRecord, World } from "../engine/types.ts";
import { describeCommand, formatClock, reasonText, ui, LOCALES, type MessageKey } from "../i18n/messages.ts";
import { SCENARIOS } from "../scenarios/registry.ts";
import type { ProductStatus, Scenario, ScenarioLabel } from "../scenarios/types.ts";
import { Icon } from "./icons.tsx";
import type { Lab, Speed } from "./useLab.ts";

type T = (k: MessageKey, p?: Record<string, string | number>) => string;
export const useT = (locale: Locale): T => (k, p) => ui(locale, k, p);

const STATUS_TONE: Record<ProductStatus, string> = {
  PUBLISHED: "tone-ok",
  IN_APP: "tone-info",
  PENDING: "tone-attn",
  DISCUSS: "tone-warn",
  NO_PUSH: "tone-neutral",
  LAB: "tone-sim",
};

export function StatusChips({ scenario, t }: { scenario: Scenario; t: T }) {
  return (
    <span className="cat-chips">
      {scenario.realProductStatus.map((st) => (
        <span key={st} className={`chip ${STATUS_TONE[st]}`}>{t(`st${st}` as MessageKey)}</span>
      ))}
      <span className="chip tone-sim">{t("labRunsSimulated")}</span>
    </span>
  );
}

// ---------------------------------------------------------------- Catalog
const FILTERS: Array<{ id: ScenarioLabel | "all"; key: MessageKey }> = [
  { id: "all", key: "allFilters" },
  { id: "manager", key: "fManager" },
  { id: "cleaner", key: "fCleaner" },
  { id: "offer", key: "fOffer" },
  { id: "checklist", key: "fChecklist" },
  { id: "access", key: "fAccess" },
  { id: "push", key: "fPush" },
  { id: "offline", key: "fOffline" },
  { id: "reminder", key: "fReminder" },
];

export function Catalog({ lab, locale }: { lab: Lab; locale: Locale }) {
  const t = useT(locale);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScenarioLabel | "all">("all");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SCENARIOS.filter((s) => (filter === "all" || s.labels.includes(filter)) && (!q || `${s.id} ${s.name[locale]} ${s.event[locale]}`.toLowerCase().includes(q)));
  }, [query, filter, locale]);
  const groups: Array<{ id: Scenario["group"]; key: MessageKey }> = [
    { id: "manager", key: "groupManager" },
    { id: "cleaner", key: "groupCleaner" },
    { id: "failure", key: "groupFailure" },
  ];
  return (
    <nav className="catalog" aria-label={t("tabScenarios")}>
      <label className="field">
        <span>{t("search")}</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="M01, oferta, offline…" />
      </label>
      <div className="catalog-filters" role="group" aria-label="Filtros">
        {FILTERS.map((f) => (
          <button key={f.id} className="filter" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {t(f.key)}
          </button>
        ))}
      </div>
      <p className="sec">{t("scenarioCount", { n: list.length })}</p>
      {groups.map((g) => {
        const items = list.filter((s) => s.group === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id} className="cat-group" aria-label={t(g.key)}>
            <h2 className="micro">{t(g.key)}</h2>
            {items.map((s) => (
              <button
                key={s.id}
                className="cat-item"
                aria-current={lab.session.scenario.id === s.id}
                onClick={() => lab.selectScenario(s.id)}
                data-scenario={s.id}
              >
                <span className="cat-item-head">
                  <span className="cat-id">{s.id}</span>
                  <span className="cat-name">{s.name[locale]}</span>
                </span>
                <span className="cat-desc">{s.event[locale]}</span>
                <span className="cat-desc"><b>{t("expected")}:</b> {s.expectedResult[locale]}</span>
                <StatusChips scenario={s} t={t} />
              </button>
            ))}
          </section>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- Scenario header
export function ScenarioHeader({ lab, locale }: { lab: Lab; locale: Locale }) {
  const t = useT(locale);
  const { session } = lab;
  const sc = session.scenario;
  const terminal = isTerminal(session);
  return (
    <section className="card scenario-head" aria-labelledby="scenario-title">
      <div className="scenario-title">
        <span className="cat-id" style={{ fontSize: 16 }}>{sc.id}</span>
        <h2 id="scenario-title">{sc.name[locale]}</h2>
        <StatusChips scenario={sc} t={t} />
      </div>
      {sc.proposal ? (
        <div className="banner tone-attn" role="note"><Icon name="alert" /> {t("proposalBanner")}</div>
      ) : (
        <div className="banner tone-info" role="note"><Icon name="check" /> {t("publishedBanner")}</div>
      )}
      <div className="facts">
        <div className="fact"><span className="micro">{t("event")}</span><p>{sc.event[locale]}</p></div>
        <div className="fact"><span className="micro">{t("expected")}</span><p>{sc.expectedResult[locale]}</p></div>
        <div className="fact"><span className="micro">{t("reality")}</span><p>{sc.reality[locale]}</p></div>
      </div>
      <div className="scenario-detail">
        <div className="section">
          <h3>{t("script")}</h3>
          <ol className="script-list">
            {sc.script.map((st, i) => {
              const state = i < session.cursor ? "done" : i === session.cursor && !terminal ? "current" : "todo";
              return (
                <li key={i} data-state={state}>
                  <span>
                    {describeCommand(locale, st.command, session.world)}
                    {st.explicit && <span className="chip tone-sim" style={{ marginLeft: 6 }}>{t("explicitStep")}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <span className="micro">{t("preconditions")}</span>
          <ul className="sec" style={{ display: "grid", gap: 2 }}>
            {sc.preconditionText.map((p, i) => <li key={i}>• {p[locale]}</li>)}
          </ul>
        </div>
        <div className="section">
          <h3>{t("checks")}</h3>
          <ul className="checks" data-testid="checks">
            {sc.checks.map((c) => {
              const ok = c.test(session.world);
              const label = !terminal ? t("notYet") : ok ? t("pass") : t("fail");
              const tone = !terminal ? "tone-neutral" : ok ? "tone-ok" : "tone-risk";
              return (
                <li key={c.id} data-check={c.id} data-result={terminal ? (ok ? "pass" : "fail") : "waiting"}>
                  <span className={`chip ${tone}`}>{label}</span>
                  <span>{c.text[locale]}</span>
                </li>
              );
            })}
          </ul>
          <p className="sec">{t("securityNote")}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Trail
const LEVELS = ["CREATED", "TARGETED", "ACCEPTED", "UNKNOWN", "DISPLAYED", "OPENED"] as const;

function EventDetails({ world, record, locale }: { world: World; record: TimelineRecord; locale: Locale }) {
  const t = useT(locale);
  const tz = world.settings.timeZone;
  const event = record.eventId ? world.events.find((e) => e.eventId === record.eventId) : undefined;
  const attempts = event ? world.attempts.filter((a) => a.eventId === event.eventId) : [];
  const time = (ms: number | null) => (ms === null ? "—" : formatClock(locale, ms, tz));
  const reached = new Set<string>();
  if (event) reached.add("CREATED");
  if (world.inbox.some((e) => e.eventId === event?.eventId)) reached.add("TARGETED");
  for (const a of attempts) {
    const lvl = attemptLevel(a);
    if (lvl === "ACCEPTED" || lvl === "DISPLAYED" || lvl === "OPENED") reached.add("ACCEPTED");
    if (lvl === "UNKNOWN") reached.add("UNKNOWN");
    if (a.displayedAt !== null) reached.add("DISPLAYED");
    if (a.openedAt !== null) reached.add("OPENED");
  }
  return (
    <div className="details" data-testid="event-details">
      <h3 className="panel-title" style={{ fontSize: 15 }}>{t("details")} · <code>{record.step}</code></h3>
      <div className="levels" aria-label={t("levels")}>
        {LEVELS.map((l) => (
          <span key={l} className={`chip ${reached.has(l) ? (l === "UNKNOWN" ? "tone-attn" : "tone-ok") : "tone-neutral"}`} title={l === "ACCEPTED" ? t("acceptedTooltip") : undefined}>
            {reached.has(l) ? "●" : "○"} {l}
          </span>
        ))}
      </div>
      <dl className="kv">
        <dt>{t("why")}</dt><dd>{reasonText(locale, record.reason) || record.detail || "—"}</dd>
        {event && (
          <>
            <dt>eventId</dt><dd className="mono">{event.eventId}</dd>
            <dt>idempotencyKey</dt><dd className="mono">{event.idempotencyKey}</dd>
            <dt>type</dt><dd className="mono">{event.type}</dd>
            <dt>{t("org")}</dt><dd className="mono">{event.orgId} (fictícia)</dd>
            <dt>{t("recipients")}</dt><dd>{event.recipients.join(", ")}</dd>
            <dt>{t("createdAt")}</dt><dd className="tnum">{time(event.createdAt)}</dd>
          </>
        )}
      </dl>
      {attempts.length > 0 && (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr><th>{t("device")}</th><th>{t("providerResult")}</th><th>{t("enqueuedAt")}</th><th>{t("displayedAt")}</th><th>{t("openedAt")}</th><th>{t("blockReasons")}</th></tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.deviceId}</td>
                  <td title={a.providerResult === "ACCEPTED" ? t("acceptedTooltip") : undefined}>
                    <span className={`chip ${a.providerResult === "ACCEPTED" ? "tone-ok" : a.providerResult === "UNKNOWN" ? "tone-attn" : a.providerResult === "REJECTED" ? "tone-risk" : "tone-neutral"}`}>{a.providerResult}</span>
                  </td>
                  <td className="tnum">{time(a.enqueuedAt)}</td>
                  <td className="tnum">{time(a.displayedAt)}</td>
                  <td className="tnum">{time(a.openedAt)}</td>
                  <td>{reasonText(locale, a.blockedReason ?? a.unknownReason ?? a.suppressedReason) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {event && (
        <>
          <span className="micro">{t("payload")}</span>
          <pre className="payload" data-testid="payload">{JSON.stringify(sanitizedPayload(event), null, 2)}</pre>
        </>
      )}
    </div>
  );
}

export function Trail({ lab, locale }: { lab: Lab; locale: Locale }) {
  const t = useT(locale);
  const w = lab.session.world;
  const [selected, setSelected] = useState<number | null>(null);
  const counts = recipientCounts(w);
  const steps = {
    created: w.events.length,
    inbox: w.inbox.length,
    attempted: w.attempts.filter((a) => a.providerResult !== "NOT_ATTEMPTED").length,
    displayed: w.attempts.filter((a) => a.displayedAt !== null).length,
  };
  const record = selected !== null ? w.timeline[selected] : undefined;
  return (
    <div className="rbody">
      <div className="pipeline" aria-label={t("levels")}>
        <div className="pipe-step"><b>{steps.created}</b><span>EVENT_CREATED</span></div>
        <div className="pipe-step"><b>{steps.inbox}</b><span>INBOX_STORED</span></div>
        <div className="pipe-step" title={t("acceptedTooltip")}><b>{steps.attempted}</b><span>PUSH_ATTEMPTED</span></div>
        <div className="pipe-step"><b>{steps.displayed}</b><span>DISPLAYED</span></div>
      </div>
      {counts.length > 0 && (
        <div className="section">
          <h3>{t("perRecipient")}</h3>
          <div className="table-wrap">
            <table className="grid" data-testid="recipient-counts">
              <thead><tr><th>user</th><th>inbox</th><th>accepted</th><th>rejected</th><th>unknown</th><th>blocked</th><th>displayed</th><th>opened</th></tr></thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.userId}><td>{w.users[c.userId]?.displayName}</td><td>{c.inbox}</td><td>{c.accepted}</td><td>{c.rejected}</td><td>{c.unknown}</td><td>{c.blocked}</td><td>{c.displayed}</td><td>{c.opened}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {record && <EventDetails world={w} record={record} locale={locale} />}
      <div className="section">
        <h3>{t("trail")}</h3>
        {w.timeline.length === 0 && <p className="sec">{t("trailEmpty")}</p>}
        <ol className="trail" data-testid="trail">
          {w.timeline.map((r, i) => (
            <li key={i}>
              <button className="trail-row" aria-pressed={selected === i} onClick={() => setSelected(selected === i ? null : i)} data-step={r.step} title={t("showDetails")}>
                <span className="trail-time tnum">{formatClock(locale, r.at, w.settings.timeZone).slice(0, 8)}</span>
                <span className="trail-main">
                  <span className={`trail-step r-${r.result}`}>
                    <span className="trail-dot" aria-hidden="true" />
                    <code>{r.step}</code>
                    {r.userId && <span className="chip tone-neutral">{w.users[r.userId]?.displayName ?? r.userId}</span>}
                    {r.deviceId && <span className="chip tone-neutral">{r.deviceId}</span>}
                    {r.eventId && <span className="chip tone-sim mono">{r.eventId}</span>}
                  </span>
                  <span className="trail-why">{reasonText(locale, r.reason) || r.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- State editor and lab actions
const TIMEZONES = ["America/Los_Angeles", "America/New_York", "America/Sao_Paulo", "UTC"];

export function StatePanel({ lab, locale }: { lab: Lab; locale: Locale }) {
  const t = useT(locale);
  const w = lab.session.world;
  const devices = Object.values(w.devices).filter((d) => d.visible || d.id === "gabi-ipad");
  const [deviceId, setDeviceId] = useState("ana-iphone");
  const [persona, setPersona] = useState("ana");
  const [jobId, setJobId] = useState("job-maple");
  const [offerMode, setOfferMode] = useState<"MANUAL" | "AUTO">("MANUAL");
  const [invited, setInvited] = useState(2);
  const [generate, setGenerate] = useState("ASSIGN");
  const [clockDate, setClockDate] = useState("2026-11-04");
  const [clockTime, setClockTime] = useState("19:00");
  const device = w.devices[deviceId]!;
  const job = w.jobs[jobId]!;
  const cleaners = Object.values(w.users).filter((u) => u.role === "CLEANER" && u.orgId === "org-demo");
  const apply = lab.apply;
  const setDev = (patch: Partial<Omit<Device, "id" | "userId">>) => apply({ type: "SET_DEVICE", deviceId, patch });

  const generators: Record<string, () => Command> = {
    ASSIGN: () => ({ type: "ASSIGN", jobId, cleanerId: persona }),
    CHECKLIST_SUBMIT: () => ({ type: "CHECKLIST_SUBMIT", jobId, cleanerId: persona }),
    CHECKLIST_AVAILABLE: () => ({ type: "CHECKLIST_AVAILABLE", jobId }),
    CONFIRM_ATTENDANCE: () => ({ type: "CONFIRM_ATTENDANCE", jobId, cleanerId: persona }),
    SPECIAL_REQUEST: () => ({ type: "SPECIAL_REQUEST", jobId, cleanerId: persona }),
    REPORT_ISSUE: () => ({ type: "REPORT_ISSUE", jobId, cleanerId: persona, issue: "supplies" }),
    MANAGER_19: () => ({ type: "RUN_REMINDER", kind: "MANAGER_19" }),
    MANAGER_07: () => ({ type: "RUN_REMINDER", kind: "MANAGER_07" }),
    CLEANER_DAY_BEFORE: () => ({ type: "RUN_REMINDER", kind: "CLEANER_DAY_BEFORE" }),
    CLEANER_LEAD: () => ({ type: "RUN_REMINDER", kind: "CLEANER_LEAD" }),
    EXCEPTIONS: () => ({ type: "RUN_REMINDER", kind: "EXCEPTIONS" }),
  };

  return (
    <div className="rbody" data-testid="state-panel">
      <p className="sec">{t("manualActionNote")}</p>
      <section className="section">
        <h3>{t("stateEditor")}</h3>
        <div className="field-row">
          <label className="field"><span>{t("device")}</span>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} data-testid="device-select">
              {devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("platform")}</span>
            <select value={device.platform} onChange={(e) => setDev({ platform: e.target.value as typeof device.platform })}>
              <option value="ios">iPhone</option><option value="android">Android</option><option value="desktop">Desktop</option>
            </select>
          </label>
          <label className="field"><span>{t("runMode")}</span>
            <select value={device.standalone ? "icon" : "tab"} onChange={(e) => setDev({ standalone: e.target.value === "icon", installed: e.target.value === "icon" ? true : device.installed })} data-testid="run-mode">
              <option value="icon">{t("runIcon")}</option><option value="tab">{t("runTab")}</option>
            </select>
          </label>
          <label className="field"><span>{t("installedQ")}</span>
            <select value={device.installed ? "yes" : "no"} onChange={(e) => setDev({ installed: e.target.value === "yes", standalone: e.target.value === "yes" ? device.standalone : false })}>
              <option value="yes">✓</option><option value="no">✕</option>
            </select>
          </label>
          <label className="field"><span>{t("permission")}</span>
            <select value={device.permission} onChange={(e) => setDev({ permission: e.target.value as typeof device.permission })} data-testid="permission-select">
              <option value="default">default</option><option value="granted">granted</option><option value="denied">denied</option>
            </select>
          </label>
          <label className="field"><span>{t("subscription")}</span>
            <select value={device.subscription} onChange={(e) => setDev({ subscription: e.target.value as typeof device.subscription })}>
              <option value="missing">missing</option><option value="active">active</option><option value="stale">stale</option>
            </select>
          </label>
          <label className="field"><span>{t("connectivity")}</span>
            <select value={device.online ? "online" : "offline"} onChange={(e) => apply({ type: "SET_ONLINE", deviceId, online: e.target.value === "online" })}>
              <option value="online">{t("online")}</option><option value="offline">{t("offline")}</option>
            </select>
          </label>
          <label className="field"><span>{t("appState")}</span>
            <select value={device.foreground ? "fg" : "bg"} onChange={(e) => setDev({ foreground: e.target.value === "fg" })}>
              <option value="fg">{t("foreground")}</option><option value="bg">{t("background")}</option>
            </select>
          </label>
          <label className="field"><span>{t("provider")}</span>
            <select value={device.providerMode} onChange={(e) => setDev({ providerMode: e.target.value as ProviderMode })} data-testid="provider-select">
              <option value="accepted">accepted</option><option value="rejected">rejected</option><option value="timeout">timeout</option><option value="unknown">UNKNOWN</option>
            </select>
          </label>
          {deviceId === "gabi-ipad" && (
            <label className="field"><span>iPad</span>
              <select value={device.visible ? "on" : "off"} onChange={(e) => setDev({ visible: e.target.value === "on" })}>
                <option value="on">✓</option><option value="off">✕</option>
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="section">
        <h3>{t("actions")}</h3>
        <div className="field-row">
          <label className="field"><span>{t("activeUser")}</span>
            <select value={persona} onChange={(e) => setPersona(e.target.value)}>
              {cleaners.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("jobStatus")}</span>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
              {Object.values(w.jobs).filter((j) => j.orgId === "org-demo").map((j) => (
                <option key={j.id} value={j.id}>{j.propertyName} · {j.archived ? "✕" : j.status}{j.assignedCleanerId ? ` · ${w.users[j.assignedCleanerId]?.displayName}` : ""}</option>
              ))}
            </select>
          </label>
          <label className="field"><span>{t("offerMode")}</span>
            <select value={offerMode} onChange={(e) => setOfferMode(e.target.value as "MANUAL" | "AUTO")}>
              <option value="MANUAL">{t("manualMode")}</option><option value="AUTO">{t("autoMode")}</option>
            </select>
          </label>
          <label className="field"><span>{t("invited")}</span>
            <input type="number" min={1} max={3} value={invited} onChange={(e) => setInvited(Math.max(1, Math.min(3, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <div className="field-row">
          <label className="field"><span>{t("aGenerate")}</span>
            <select value={generate} onChange={(e) => setGenerate(e.target.value)} data-testid="generate-select">
              {Object.keys(generators).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        </div>
        <div className="actions-grid">
          <button className="btn btn-primary" onClick={() => apply(generators[generate]!())} data-action="generate">{t("aGenerate")}</button>
          <button className="btn" onClick={() => apply({ type: "SEND_OFFER", jobId, cleanerIds: cleaners.slice(0, invited).map((c) => c.id), mode: offerMode })} data-action="send-offer">{t("aSendOffer")}</button>
          <button className="btn" onClick={() => apply({ type: "RESPOND_OFFER", jobId, cleanerId: "ana", response: job.offerMode === "AUTO" ? "ACCEPT" : "INTERESTED" })} data-action="accept-ana">{t("aAcceptAna")}</button>
          <button className="btn" onClick={() => apply({ type: "RESPOND_OFFER", jobId, cleanerId: "bia", response: job.offerMode === "AUTO" ? "ACCEPT" : "INTERESTED" })} data-action="accept-bia">{t("aAcceptBia")}</button>
          <button className="btn" onClick={() => apply({ type: "RESCHEDULE", jobId, date: "2026-11-06", start: "08:30" })} data-action="reschedule">{t("aReschedule")}</button>
          <button className="btn btn-danger" onClick={() => apply({ type: "CANCEL_JOB", jobId })} data-action="cancel">{t("aCancel")}</button>
          <button className="btn" onClick={() => apply({ type: "SET_ONLINE", deviceId, online: !device.online })} data-action="toggle-online">{t("aToggleOnline")}</button>
          <button className="btn" onClick={() => apply({ type: "REVOKE_SUBSCRIPTION", deviceId })} data-action="revoke-sub">{t("aRevokeSub")}</button>
          <button className="btn" onClick={() => apply({ type: "SWITCH_ACCOUNT", deviceId, userId: device.signedInUserId === device.userId ? (device.userId === "carla" ? "ana" : "carla") : device.userId })} data-action="switch-account">{t("aSwitch")}</button>
          <button className="btn" onClick={() => apply({ type: "SIMULATE_DISPLAY", deviceId })} data-action="simulate-display">{t("simulateDisplay")}</button>
          <button className="btn" onClick={() => apply({ type: "OPEN_PUSH", deviceId })} data-action="open-push">{t("aOpenPush")}</button>
          <button className="btn" onClick={() => apply({ type: "MARK_READ", deviceId })} data-action="mark-read">{t("aMarkRead")}</button>
          <button className="btn" onClick={() => apply({ type: "ARCHIVE", deviceId })} data-action="archive">{t("aArchive")}</button>
          <button className="btn btn-danger" onClick={() => apply({ type: "REVOKE_ACCESS", userId: persona })} data-action="revoke-access">{t("accessEnded")}</button>
        </div>
      </section>

      <section className="section">
        <h3>{t("clock")}</h3>
        <div className="field-row">
          <label className="field"><span>{t("clock")}</span><input type="date" value={clockDate} onChange={(e) => setClockDate(e.target.value)} /></label>
          <label className="field"><span>&nbsp;</span><input type="time" value={clockTime} onChange={(e) => setClockTime(e.target.value)} /></label>
          <div className="field"><span>&nbsp;</span><button className="btn" onClick={() => apply({ type: "SET_CLOCK", date: clockDate, time: clockTime })} data-action="set-clock">OK</button></div>
        </div>
        <div className="field-row">
          <label className="field"><span>{t("timeZone")}</span>
            <select value={w.settings.timeZone} onChange={(e) => apply({ type: "SET_SETTINGS", patch: { timeZone: e.target.value } })}>
              {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("quietHours")}</span>
            <input type="time" value={w.settings.quietStart} onChange={(e) => apply({ type: "SET_SETTINGS", patch: { quietStart: e.target.value } })} />
          </label>
          <label className="field"><span>&nbsp;</span>
            <input type="time" value={w.settings.quietEnd} onChange={(e) => apply({ type: "SET_SETTINGS", patch: { quietEnd: e.target.value } })} />
          </label>
          <label className="field"><span>{t("leadHours")}</span>
            <input type="number" min={1} max={24} value={w.settings.reminderLeadHours} onChange={(e) => apply({ type: "SET_SETTINGS", patch: { reminderLeadHours: Math.max(1, Math.min(24, Number(e.target.value) || 1)) } })} />
          </label>
        </div>
      </section>

      <section className="section">
        <h3>{t("personas")}</h3>
        <div className="table-wrap">
          <table className="grid" data-testid="persona-table">
            <thead><tr><th>user</th><th>{t("role")} / {t("org")}</th><th>{t("devices")}</th><th>{t("unread")}</th><th>{t("lastSync")}</th></tr></thead>
            <tbody>
              {personaTable(w).map((p) => (
                <tr key={p.userId}>
                  <td><b>{p.name}</b>{!p.active && <span className="chip tone-risk" style={{ marginLeft: 4 }}>✕</span>}</td>
                  <td>{p.role}<br /><span className="mono">{p.orgId}</span></td>
                  <td>
                    {p.devices.filter((d) => d.visible).map((d) => (
                      <div key={d.id} className="sec" style={{ fontSize: 12 }}>
                        {d.label}: {d.permission} · {d.subscription === "active" ? t("tokenOk") : d.subscription === "stale" ? t("tokenBad") : t("tokenNone")}
                      </div>
                    ))}
                  </td>
                  <td className="tnum">{p.unread}</td>
                  <td className="tnum">{p.lastSyncAt ? formatClock(locale, p.lastSyncAt, w.settings.timeZone).slice(0, 5) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Control bar
export function ControlBar({ lab, locale, setLocale, channel, onEvidence }: { lab: Lab; locale: Locale; setLocale: (l: Locale) => void; channel: boolean; onEvidence?: () => void }) {
  const t = useT(locale);
  const { session } = lab;
  const terminal = isTerminal(session);
  const w = session.world;
  const status = lab.replaying ? t("replaying") : lab.playing ? t("running") : terminal ? t("terminal") : session.ops.length ? t("paused") : t("ready");
  return (
    <footer className="controlbar" aria-label="Controles">
      <div className="group">
        {lab.playing ? (
          <button className="btn btn-primary" onClick={lab.pause} data-control="pause"><Icon name="pause" /> {t("pause")}</button>
        ) : (
          <button className="btn btn-primary" onClick={lab.run} disabled={terminal} data-control="run"><Icon name="play" /> {t("run")}</button>
        )}
        <button className="btn" onClick={lab.step} disabled={terminal} data-control="step"><Icon name="step" /> {t("step")}</button>
        <button className="btn" onClick={lab.replay} disabled={session.ops.length === 0} data-control="replay"><Icon name="replay" /> {t("replay")}</button>
        <button className="btn" onClick={() => lab.reset()} data-control="reset"><Icon name="reset" /> {t("reset")}</button>
        <button className="btn btn-ghost" onClick={lab.next} data-control="next"><Icon name="next" /> {t("next")}</button>
        {onEvidence && (
          <button className="btn" onClick={onEvidence} data-control="generate-evidence"><Icon name="doc" /> {t("generateEvidence")}</button>
        )}
      </div>
      <span className="divider" />
      <div className="group">
        <label className="sr-only" htmlFor="speed">{t("speed")}</label>
        <select id="speed" value={lab.speed} onChange={(e) => lab.setSpeed(e.target.value as Speed)} aria-label={t("speed")} data-control="speed">
          <option value="slow">{t("speed")}: {t("speedSlow")}</option>
          <option value="normal">{t("speed")}: {t("speedNormal")}</option>
          <option value="fast">{t("speed")}: {t("speedFast")}</option>
          <option value="instant">{t("speed")}: {t("speedInstant")}</option>
        </select>
        {channel && (
          <select value={w.settings.channel} onChange={(e) => lab.apply({ type: "SET_SETTINGS", patch: { channel: e.target.value as "push" | "inApp" } })} aria-label={t("channel")} data-control="channel">
            <option value="push">{t("channel")}: {t("channelPush")}</option>
            <option value="inApp">{t("channel")}: {t("channelInApp")}</option>
          </select>
        )}
        <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={t("language")} data-control="language">
          {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
      </div>
      <span className="divider" />
      <div className="clock">
        <span className="micro">{t("clock")} · {w.settings.timeZone.replace("America/", "")}</span>
        <b data-testid="sim-clock">{formatClock(locale, w.clock, w.settings.timeZone, true)}</b>
      </div>
      <div className="group hide-mobile" style={{ marginLeft: "auto" }}>
        <span className="status-pill" data-testid="run-status"><span className="trail-dot r-info" /> {status}</span>
        <span className="chip tone-sim mono" title={t("fingerprint")} data-testid="fingerprint">{t("seed")} {session.seed} · {fingerprint(w)}</span>
      </div>
    </footer>
  );
}
