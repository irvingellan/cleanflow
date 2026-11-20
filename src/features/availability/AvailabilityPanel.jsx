import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../components/Icon.jsx";
import { formatServiceTime } from "../../lib/presentation.js";
import { availabilityMessage } from "./availabilityMessages.js";
import { assignedBlockConflicts, availabilityDateLabel } from "./availabilityModel.js";
import { unavailabilityPeriodError } from "../../../functions/src/unavailabilityPeriod.js";
import { useAvailability } from "./useAvailability.js";
import "./availability.css";

function ConflictNotice({ period, entries, t }) {
  if (!period || !entries) return null;
  const { blocked, unknown } = assignedBlockConflicts(period, entries);
  if (!blocked && !unknown) return null;
  return <div className="av-conflict" role="status">
    <Icon name="alert" size={18} />
    <div>
      {blocked > 0 && <p>{t(blocked === 1 ? "conflictOne" : "conflictMany", { count: blocked })}</p>}
      {unknown > 0 && <p>{t(unknown === 1 ? "unknownOne" : "unknownMany", { count: unknown })}</p>}
    </div>
  </div>;
}

function AvailabilityForm({ today, t, entries, busy, onSave, onCancel }) {
  const [dates, setDates] = useState({ startDate: today, endDate: today });
  const [times, setTimes] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const startRef = useRef(null);
  const id = useId();
  useEffect(() => { startRef.current?.focus(); }, []);
  function changeDate(name, value) {
    const next = { ...dates, [name]: value };
    if (name === "startDate" && (dates.startDate === dates.endDate || value > dates.endDate)) next.endDate = value;
    if (next.startDate !== next.endDate) setTimes(null);
    setDates(next);
  }
  const period = { ...dates, ...times };
  const validation = unavailabilityPeriodError(period, today);
  function submit(event) {
    event.preventDefault();
    setSubmitted(true);
    if (!validation) void onSave(period);
  }
  return <form className="av-form" noValidate onSubmit={submit} aria-labelledby={id}>
    <h3 id={id}>{t("add")}</h3>
    <fieldset disabled={busy}>
      <div className="av-fields">
        <label>{t("from")}<input ref={startRef} type="date" required value={dates.startDate} onChange={e => changeDate("startDate", e.target.value)} /></label>
        <label>{t("to")}<input type="date" required min={dates.startDate > today ? dates.startDate : today} value={dates.endDate} onChange={e => changeDate("endDate", e.target.value)} /></label>
      </div>
      {dates.startDate && dates.startDate === dates.endDate && <label className="av-partial">
        <input type="checkbox" checked={Boolean(times)} onChange={e => setTimes(e.target.checked ? { startTime: "", endTime: "" } : null)} />{t("partial")}
      </label>}
      {times && <div className="av-fields">
        <label>{t("startTime")}<input type="time" required value={times.startTime} onChange={e => setTimes({ ...times, startTime: e.target.value })} /></label>
        <label>{t("endTime")}<input type="time" required value={times.endTime} onChange={e => setTimes({ ...times, endTime: e.target.value })} /></label>
      </div>}
      {submitted && validation && <p className="av-error" role="alert">{t(validation)}</p>}
      <ConflictNotice period={validation ? null : period} entries={entries} t={t} />
      <div className="av-actions">
        <button type="submit" className="button button--primary">{t("save")}</button>
        <button type="button" className="button" onClick={onCancel}>{t("cancel")}</button>
      </div>
    </fieldset>
  </form>;
}

/** The service receives only the date fields or a block id. The caller owns the authorized scope. */
export function AvailabilityPanel({ language, title, service, today, entries }) {
  const t = (key, values) => availabilityMessage(language, key, values);
  const { blocks, status, busy, error, change, retry, clearError } = useAvailability(service);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);
  const addRef = useRef(null);
  const feedbackRef = useRef(null);
  const id = useId();
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!editing && returnFocus.current) {
      (notice ? feedbackRef.current : addRef.current)?.focus({ preventScroll: true });
      returnFocus.current = false;
    }
  }, [editing, notice]);
  function closeForm() {
    returnFocus.current = true;
    clearError();
    setEditing(false);
  }
  async function save(period) {
    if (await change(period)) {
      setNotice({ message: "added", period });
      closeForm();
    }
  }
  async function remove(blockId) {
    if (await change({ blockId }, true)) {
      returnFocus.current = true;
      setNotice({ message: "removed" });
    }
  }
  const sorted = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate)
    || (a.startTime || "").localeCompare(b.startTime || "") || a.endDate.localeCompare(b.endDate));
  return <section className="av-panel" aria-labelledby={id}>
    <h2 id={id}>{title || t("title")}</h2>
    {status === "loading" && <p role="status">{t("loading")}</p>}
    {status === "error" && <div className="av-error-box" role="alert">
      <p>{t("loadError")}</p><button type="button" className="button" onClick={retry}>{t("retry")}</button>
    </div>}
    {status === "ready" && <>
      {notice && <p className="av-receipt" role="status" tabIndex={-1} ref={feedbackRef}><Icon name="checkCircle" size={17}/>{t(notice.message)}</p>}
      {notice?.period && <ConflictNotice period={notice.period} entries={entries} t={t} />}
      {editing ? <AvailabilityForm today={today} t={t} entries={entries} busy={busy} onSave={save} onCancel={closeForm} /> :
        sorted.length < 30 && <button ref={addRef} type="button" className="button button--primary av-add" disabled={busy}
          onClick={() => { clearError(); setNotice(null); setEditing(true); }}><Icon name="plus" size={18}/>{t("add")}</button>}
      {sorted.length >= 30 && <p role="status">{t("capacity")}</p>}
      {error && <p className="av-error" role="alert">{t(error)}</p>}
      {!sorted.length && !editing && <p className="av-empty">{t("empty")}</p>}
      {sorted.length > 0 && <ul className="av-list">
        {sorted.map(block => {
          const day = availabilityDateLabel(block, language);
          const hours = block.startTime && block.endTime
            ? [formatServiceTime(block.startTime, language), formatServiceTime(block.endTime, language)].join(" – ")
            : t(block.startDate === block.endDate ? "allDay" : "allDays");
          return <li key={block.id}><div><strong>{day}</strong><span>{hours}</span></div>
            <button type="button" className="button button--text" disabled={busy || editing}
              aria-label={t("remove") + " " + day + " · " + hours} onClick={() => remove(block.id)}>{t("remove")}</button>
          </li>;
        })}
      </ul>}
    </>}
  </section>;
}
