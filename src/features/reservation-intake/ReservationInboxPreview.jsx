import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { reservationIntakeMessages } from "./reservationIntakeMessages.js";
import { buildSyntheticReservationState } from "./syntheticReservationFixtures.js";
import { readLocalInbox, sanitizeInboxSnapshot } from "./reservationInboxService.js";
import { ReservationReviewPanel } from "./ReservationReviewPanel.jsx";
import { IntakeIcon } from "./IntakeIcon.jsx";
import { acceptanceMessages } from "./reservationAcceptanceMessages.js";
import { reviewMessages } from "./reservationReviewMessages.js";
import { designMessages } from "./reservationDesignMessages.js";
import { intakeShortDate, intakeSource, matchesIntakeTriage } from "./reservationReviewPresentation.js";
import "./reservationInbox.css";

export function ReservationInboxPreview({ onBack, properties, review }) {
  const { language, translate } = useTranslation();
  const messages = reservationIntakeMessages[language] || reservationIntakeMessages.en, t = key => messages[key] || messages.none;
  const a = acceptanceMessages[language] || acceptanceMessages.en, states = reviewMessages[language] || reviewMessages.en, d = designMessages[language] || designMessages.en;
  const [decisions, setDecisions] = useState({}), [triage, setTriage] = useState(""), [tab, setTab] = useState("");
  const onDecision = useCallback((id, decision) => setDecisions(previous => ({ ...previous, [id]: decision })), []);
  const [rows, setRows] = useState([]), [selected, setSelected] = useState(null), [filter, setFilter] = useState("");
  const [port, setPort] = useState("4789"), [pairingKey, setPairingKey] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const generation = useRef(0), workbench = useRef(null);
  useEffect(() => {
    if (!selected) return;
    workbench.current?.querySelector("h2")?.focus({ preventScroll: true });
    if (window.matchMedia?.("(max-width: 700px)").matches) window.scrollTo?.({ top: 0, behavior: "instant" });
  }, [selected]);
  useEffect(() => {
    const current = ++generation.current;
    buildSyntheticReservationState().then(state => { if (generation.current === current) { setRows(sanitizeInboxSnapshot({ candidates: Object.values(state.candidates) })); setLoading(false); } }, () => { if (generation.current === current) { setError(true); setLoading(false); } });
    return () => { generation.current++; };
  }, []);
  async function read(loader) {
    const current = ++generation.current; setLoading(true); setError(false);
    try { const result = await loader(); if (generation.current === current) { setRows(result); setSelected(null); setDecisions({}); } }
    catch { if (generation.current === current) setError(true); }
    finally { if (generation.current === current) setLoading(false); }
  }
  const date = value => intakeShortDate(value, language);
  const matchesTab = (row, wanted) => !wanted || matchesIntakeTriage(row, decisions[row.id], wanted);
  const visible = rows.filter(row => matchesTab(row, tab) && (!filter || row.changeType === filter) && matchesIntakeTriage(row, decisions[row.id], triage));
  function select(row) { setSelected(row); }
  return <section className={`reservation-inbox ${selected ? "reservation-inbox--selected" : ""}`}>
    <div className="intake-environment"><IntakeIcon state="ENVIRONMENT" />{d.environment}</div>
    <header className="intake-header" inert={confirming ? true : undefined}><div><span className="intake-overline">{d.area}</span><h1>{d.title}</h1><p>{d.subtitle}</p></div><button type="button" className="button" onClick={onBack}>{translate("common.back")}</button></header>
    {loading && <p role="status">{t("loading")}</p>}{error && <p role="alert">{t("error")}</p>}
    <div className="intake-workbench">
      <aside className="intake-queue" inert={confirming ? true : undefined}>
        <div className="intake-queue__heading"><h2 className="intake-overline">{d.queue}</h2><span>{visible.length} {d.items}</span></div>
        <div className="intake-filter-pills" role="group" aria-label={a.triage}>{[["", d.all], ["CHANGED", d.changes], ["NEEDS_REVIEW", d.attention]].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label} · {rows.filter(row => matchesTab(row, key)).length}</button>)}</div>
        <details className="intake-triage"><summary>{a.triage}</summary><label>{a.triage}<select value={triage} onChange={e => setTriage(e.target.value)}><option value="">{t("all")}</option>{["NEEDS_REVIEW", "PROPERTY_REQUIRED", "CHANGED", "POSSIBLE_CANCELLED", "NEW", "PROMOTED", "IGNORED"].map(key => <option key={key} value={key}>{a[key] || states[key] || t(key)}</option>)}</select></label><p>{a.stateNote}</p>
          <label>{t("change")}<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">{t("all")}</option>{[...new Set(rows.map(row => row.changeType))].map(type => <option key={type} value={type}>{t(type)}</option>)}</select></label></details>
        <div className="intake-queue__items">{visible.map(row => {
          const decision = decisions[row.id], terminal = ["PROMOTED", "IGNORED"].includes(decision?.state);
          const label = terminal ? states[decision.state] : row.propertyMappingState !== "MATCHED" && !decision?.propertyId ? d.required : row.changeType === "NEW" && row.sourceEvidenceType === "CALENDAR_EVENT" ? t("newCalendarEvent") : t(row.changeType);
          const visualState = terminal ? decision.state : row.propertyMappingState !== "MATCHED" && !decision?.propertyId ? "PROPERTY_REQUIRED" : row.changeType;
          return <article key={row.id} className={`intake-queue-row ${selected?.id === row.id ? "intake-queue-row--selected" : ""}`}>
            <button type="button" onClick={() => select(row)} aria-label={`${t("details")}: ${row.sourcePropertyName}`} aria-pressed={selected?.id === row.id} aria-controls="reservation-review-detail">
              <div className="intake-queue-row__meta"><strong className={`intake-state intake-state--${visualState}`}><IntakeIcon state={visualState} />{label}</strong><span>{intakeSource(row, d.generic)}</span></div>
              <h3>{row.sourcePropertyName || t("none")}</h3><strong>{date(row.checkIn)} → {date(row.checkOut)}</strong>
              {row.changeSet.checkOut && <p>{d.end}: {date(row.changeSet.checkOut.before)} → {date(row.changeSet.checkOut.after)}</p>}
              {row.propertyMappingState !== "MATCHED" && !decision?.propertyId && <p>{d.required}</p>}
              {["POSSIBLE_CANCELLED", "SOURCE_DISAPPEARED"].includes(row.changeType) && <p>{d.cancelNote}</p>}
            </button>
          </article>;
        })}</div>
        {!loading && !visible.length && <p>{t("empty")}</p>}
        <p className="intake-queue__note">{d.queueNote}</p>
        <details className="intake-local-tools"><summary>{d.diagnostics}</summary><p>{t("note")}</p><label>{t("port")}<input type="number" min="1024" max="65535" value={port} onChange={e => setPort(e.target.value)} /></label><label>{t("key")}<input type="password" autoComplete="off" value={pairingKey} onChange={e => setPairingKey(e.target.value)} /></label><button type="button" className="button" disabled={loading} onClick={() => read(() => readLocalInbox({ port: Number(port), pairingKey }))}>{t("load")}</button><label>{t("import")}<input type="file" accept="application/json,.json" onChange={event => {
          const file = event.target.files?.[0]; if (file) read(async () => { if (file.size > 2 * 1024 * 1024) throw new Error(); return sanitizeInboxSnapshot(JSON.parse(await file.text())); }); event.target.value = "";
        }} /></label></details>
      </aside>
      <div ref={workbench} id="reservation-review-detail" className="intake-workspace">{selected ? <ReservationReviewPanel key={selected.id} row={selected} properties={properties} review={review} language={language} onDecision={onDecision} onConfirmation={setConfirming} onBack={() => setSelected(null)} /> : <div className="intake-workspace__empty"><h2>{d.choose}</h2><p>{d.queueNote}</p></div>}</div>
    </div>
  </section>;
}
