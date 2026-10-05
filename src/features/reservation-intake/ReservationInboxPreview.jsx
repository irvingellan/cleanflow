import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { reservationIntakeMessages } from "./reservationIntakeMessages.js";
import { buildSyntheticReservationState } from "./syntheticReservationFixtures.js";
import { readLocalInbox, sanitizeInboxSnapshot } from "./reservationInboxService.js";
import "./reservationInbox.css";

export function ReservationInboxPreview({ onBack }) {
  const { language, translate } = useTranslation();
  const messages = reservationIntakeMessages[language] || reservationIntakeMessages.en;
  const t = key => messages[key] || messages.none;
  const [rows, setRows] = useState([]), [selected, setSelected] = useState(null), [filter, setFilter] = useState("");
  const [port, setPort] = useState("4789"), [pairingKey, setPairingKey] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [synthetic, setSynthetic] = useState(true);
  const generation = useRef(0);
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
      if (generation.current === current) { setRows(result); setSelected(null); setSynthetic(false); }
    } catch { if (generation.current === current) setError(true); }
    finally { if (generation.current === current) setLoading(false); }
  }
  const mapping = row => t(row.propertyMappingState === "MATCHED" ? "matched" : row.propertyMappingState === "AMBIGUOUS" ? "ambiguous" : "unknownMapping");
  const value = entry => entry || t("none");
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
    <label className="reservation-inbox__filter">{t("change")}<select value={filter} onChange={e => setFilter(e.target.value)}>
      <option value="">{t("all")}</option>{[...new Set(rows.map(row => row.changeType))].map(type => <option key={type} value={type}>{t(type)}</option>)}
    </select></label>
    {!loading && !rows.length && <p>{t("empty")}</p>}
    <div className="reservation-inbox__grid">{rows.filter(row => !filter || row.changeType === filter).map(row => <article className="reservation-inbox__card" key={row.id}>
      <span className="eyebrow">{row.sourceProvider}</span><h2>{value(row.sourcePropertyName)}</h2>
      <strong className="reservation-inbox__change">{t(row.changeType)}</strong>
      <dl><dt>{t("checkIn")}</dt><dd>{value(row.checkIn)}</dd><dt>{t("checkOut")}</dt><dd>{value(row.checkOut)}</dd>
        {row.changeSet.checkOut && <><dt>{t("before")} → {t("after")}</dt><dd>{value(row.changeSet.checkOut.before)} → {value(row.changeSet.checkOut.after)}</dd></>}
        <dt>{t("mapping")}</dt><dd>{mapping(row)}</dd><dt>{t("confidence")}</dt><dd>{t(row.confidence?.toLowerCase())}</dd>
        <dt>{t("observed")}</dt><dd>{value(row.observedAt)}</dd></dl>
      <p className="reservation-inbox__review">⚠ {t("review")}</p>
      <button type="button" className="button" onClick={() => setSelected(selected?.id === row.id ? null : row)} aria-expanded={selected?.id === row.id}>{t("details")}</button>
      {selected?.id === row.id && <div className="reservation-inbox__detail">
        <h3>{t("current")}</h3><dl><dt>{t("guest")}</dt><dd>{value(row.guestName)}</dd><dt>{t("status")}</dt><dd>{value(row.sourceReservationStatus)}</dd>
          <dt>{t("identity")}</dt><dd>{t(row.identityStrategy)}</dd></dl>
        {row.previousObservation && <><h3>{t("previous")}</h3><dl>{["checkIn", "checkOut", "status", "observed"].map(key => {
          const field = { status: "sourceReservationStatus", observed: "observedAt" }[key] || key;
          return <div key={key}><dt>{t(key)}</dt><dd>{value(row.previousObservation[field])}</dd></div>;
        })}</dl></>}
        {Object.entries(row.changeSet).map(([key, diff]) => <p key={key}>{t(key === "sourceReservationStatus" ? "status" : key === "propertyMappingState" ? "mapping" : key)}: {value(diff.before)} → {value(diff.after)}</p>)}
        {row.conflict && <><h3>{t("CONFLICT")}</h3><p>{t("note")}</p><dl>
          <dt>{t("checkIn")}</dt><dd>{value(row.conflict.observation.checkIn)}</dd>
          <dt>{t("checkOut")}</dt><dd>{value(row.conflict.observation.checkOut)}</dd>
          <dt>{t("observed")}</dt><dd>{value(row.conflict.observation.observedAt)}</dd>
        </dl></>}
      </div>}
    </article>)}</div>
  </section>;
}
