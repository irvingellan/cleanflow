import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { reservationIntakeMessages } from "./reservationIntakeMessages.js";
import { buildSyntheticReservationState } from "./syntheticReservationFixtures.js";
import { readLocalInbox, sanitizeInboxSnapshot } from "./reservationInboxService.js";
import "./reservationInbox.css";
import { ReservationReviewPanel } from "./ReservationReviewPanel.jsx";
import { acceptanceMessages } from "./reservationAcceptanceMessages.js";
import { reviewMessages } from "./reservationReviewMessages.js";
import { intakeDate, matchesIntakeTriage } from "./reservationReviewPresentation.js";

export function ReservationInboxPreview({ onBack, properties, review }) {
  const { language, translate } = useTranslation();
  const messages = reservationIntakeMessages[language] || reservationIntakeMessages.en;
  const t = key => messages[key] || messages.none;
  const a = acceptanceMessages[language] || acceptanceMessages.en;
  const states = reviewMessages[language] || reviewMessages.en;
  const [decisions, setDecisions] = useState({}), [triage, setTriage] = useState("");
  const panelHeading = useRef(null);
  const onDecision = useCallback((id, decision) => setDecisions(previous => ({ ...previous, [id]: decision })), []);
  const [rows, setRows] = useState([]), [selected, setSelected] = useState(null), [filter, setFilter] = useState("");
  const [port, setPort] = useState("4789"), [pairingKey, setPairingKey] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [synthetic, setSynthetic] = useState(true);
  const generation = useRef(0);
  useEffect(() => { if (selected) { panelHeading.current?.focus({ preventScroll: true });
    if (window.matchMedia?.("(max-width: 700px)").matches) panelHeading.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  } }, [selected]);
  useEffect(() => {
    const current = ++generation.current;
    buildSyntheticReservationState().then(state => {
      if (generation.current === current) { setRows(sanitizeInboxSnapshot({ candidates: Object.values(state.candidates) })); setLoading(false); }
    }, () => { if (generation.current === current) { setError(true); setLoading(false); } });
    return () => { generation.current++; };
  }, []);
  async function read(loader) {
    const current = ++generation.current; setLoading(true); setError(false);
    try {
      const result = await loader();
      if (generation.current === current) { setRows(result); setSelected(null); setDecisions({}); setSynthetic(false); }
    } catch { if (generation.current === current) setError(true); }
    finally { if (generation.current === current) setLoading(false); }
  }
  const mapping = row => t(row.propertyMappingState === "MATCHED" ? "matched" : row.propertyMappingState === "AMBIGUOUS" ? "ambiguous" : "unknownMapping");
  const value = entry => entry || t("none");
  const friendly = entry => intakeDate(entry, language);
  const row = selected;
  return <section className="reservation-inbox">
    <header className="section-header"><div><h1>{t("title")}</h1><p>{t("description")}</p></div>
      <button type="button" className="button" onClick={onBack}>{translate("common.back")}</button></header>
    {synthetic && <p className="service-preview-notice">{t("synthetic")}</p>}
    <p>{t("note")}</p>
    <details className="reservation-inbox__tools"><summary>{t("local")}</summary>
      <label>{t("port")}<input type="number" min="1024" max="65535" value={port} onChange={e => setPort(e.target.value)} /></label>
      <label>{t("key")}<input type="password" autoComplete="off" value={pairingKey} onChange={e => setPairingKey(e.target.value)} /></label>
      <button type="button" className="button" disabled={loading} onClick={() => read(() => readLocalInbox({ port: Number(port), pairingKey }))}>{t("load")}</button>
      <label>{t("import")}<input type="file" accept="application/json,.json" onChange={event => {
        const file = event.target.files?.[0];
        if (file) read(async () => { if (file.size > 2 * 1024 * 1024) throw new Error(); return sanitizeInboxSnapshot(JSON.parse(await file.text())); });
        event.target.value = "";
      }} /></label>
    </details>
    {loading && <p role="status">{t("loading")}</p>}
    {error && <p role="alert">{t("error")}</p>}
    <label className="reservation-inbox__filter">{a.triage}<select value={triage} onChange={e => setTriage(e.target.value)}>
      <option value="">{t("all")}</option>{["NEEDS_REVIEW", "PROPERTY_REQUIRED", "CHANGED", "POSSIBLE_CANCELLED", "NEW", "PROMOTED", "IGNORED"].map(key => <option key={key} value={key}>{a[key] || states[key] || t(key)}</option>)}
    </select></label><p className="caption">{a.stateNote}</p>
    <label className="reservation-inbox__filter">{t("change")}<select value={filter} onChange={e => setFilter(e.target.value)}>
      <option value="">{t("all")}</option>{[...new Set(rows.map(row => row.changeType))].map(type => <option key={type} value={type}>{t(type)}</option>)}
    </select></label>
    {!loading && !rows.length && <p>{t("empty")}</p>}
    <div className={`reservation-inbox__workspace ${selected ? "reservation-inbox__workspace--selected" : ""}`}>
    <div className="reservation-inbox__grid">{rows.filter(row => (!filter || row.changeType === filter) && matchesIntakeTriage(row, decisions[row.id], triage)).map(row => <article className="reservation-inbox__card" key={row.id}>
      <span className="eyebrow">{row.sourceProvider}</span><h2>{value(row.sourcePropertyName)}</h2>
      <strong className="reservation-inbox__change">{t(row.changeType === "NEW" && row.sourceEvidenceType === "CALENDAR_EVENT" ? "newCalendarEvent" : row.changeType)}</strong>
      {row.sourceSemantics === "GUESTY_LISTING_ICAL" && <p>{t("calendarOnly")}</p>}
      <dl><dt>{t("checkIn")}</dt><dd>{friendly(row.checkIn)}</dd><dt>{t("checkOut")}</dt><dd>{friendly(row.checkOut)}</dd>
        {row.changeSet.checkOut && <><dt>{t("before")} → {t("after")}</dt><dd>{friendly(row.changeSet.checkOut.before)} → {friendly(row.changeSet.checkOut.after)}</dd></>}
        <dt>{t("mapping")}</dt><dd>{mapping(row)}</dd><dt>{t("confidence")}</dt><dd>{t(row.confidence?.toLowerCase())}</dd>
        <dt>{t("observed")}</dt><dd>{friendly(row.observedAt)}</dd></dl>
      <p className={`reservation-state reservation-state--${decisions[row.id]?.state || "UNREAD"}`}>{decisions[row.id] ? states[decisions[row.id].state] : a.unread}</p>
      {!decisions[row.id]?.propertyId && !["PROMOTED", "IGNORED"].includes(decisions[row.id]?.state) && <p>{a.PROPERTY_REQUIRED}</p>}
      <button type="button" className="button" onClick={() => setSelected(selected?.id === row.id ? null : row)} aria-expanded={selected?.id === row.id} aria-controls="reservation-review-detail">{t("details")}</button>
    </article>)}</div>
      {selected && <div id="reservation-review-detail" className="reservation-inbox__detail">
        <h2 tabIndex={-1} ref={panelHeading}>{a.selected}: {row.sourcePropertyName || t("none")}</h2>
        <h3>{t("current")}</h3><dl><dt>{t("guest")}</dt><dd>{value(row.guestName)}</dd><dt>{t("status")}</dt><dd>{value(row.sourceReservationStatus)}</dd>
          <dt>{t("provider")}</dt><dd>{row.sourceProvider}</dd>
          <dt>{t("checkIn")}</dt><dd>{friendly(row.checkIn)}</dd><dt>{t("checkOut")}</dt><dd>{friendly(row.checkOut)}</dd></dl>
        <p>{a.dateContext}</p>
        {row.previousObservation && <><h3>{t("previous")}</h3><dl>{["checkIn", "checkOut", "status", "observed"].map(key => {
          const field = { status: "sourceReservationStatus", observed: "observedAt" }[key] || key;
          return <div key={key}><dt>{t(key)}</dt><dd>{field === "sourceReservationStatus" ? value(row.previousObservation[field]) : friendly(row.previousObservation[field])}</dd></div>;
        })}</dl></>}
        {Object.entries(row.changeSet).map(([key, diff]) => <p key={key}>{t(key === "sourceReservationStatus" ? "status" : key === "propertyMappingState" ? "mapping" : key)}: {["checkIn", "checkOut"].includes(key) ? friendly(diff.before) : value(diff.before)} → {["checkIn", "checkOut"].includes(key) ? friendly(diff.after) : value(diff.after)}</p>)}
        {row.conflict && <><h3>{t("CONFLICT")}</h3><p>{t("note")}</p><dl>
          <dt>{t("checkIn")}</dt><dd>{friendly(row.conflict.observation.checkIn)}</dd>
          <dt>{t("checkOut")}</dt><dd>{friendly(row.conflict.observation.checkOut)}</dd>
          <dt>{t("observed")}</dt><dd>{friendly(row.conflict.observation.observedAt)}</dd>
        </dl></>}
        <ReservationReviewPanel key={row.id} row={row} properties={properties} review={review} language={language} onDecision={onDecision} />
        <details><summary>{a.diagnostics}</summary><dl><dt>{t("identity")}</dt><dd>{t(row.identityStrategy)}</dd>
          <dt>{t("provider")}</dt><dd>{row.sourceProvider} · {row.sourceType} · {row.parserVersion}</dd>
          <dt>{t("checkIn")}</dt><dd>{value(row.checkIn)}</dd><dt>{t("checkOut")}</dt><dd>{value(row.checkOut)}</dd>
          <dt>{t("observed")}</dt><dd>{value(row.observedAt)}</dd></dl></details>
      </div>}
    </div>
  </section>;
}
