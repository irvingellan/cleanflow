import { useEffect, useState } from "react";
import { cleanerT } from "../model/cleanerCopy.js";
import { useStore } from "../model/store.js";
import { Icon } from "../ui/Icon.jsx";

// Batch photo upload for the cleaner checklist (prototype).
// Current Production limits: 20 photos, 50 MiB in total, 5 MiB per image, no HEIC.
// "50 photos" is only a simulated future option here; it is NOT supported today.

const ct = (lang, key, params) => cleanerT(lang, key, params);
export const LIMITS = { current: { photos: 20, totalMb: 50 }, future: { photos: 50, totalMb: 150 }, perImageMb: 5 };
export const photoMb = n => Math.round((1.6 + ((n * 37) % 30) / 10) * 10) / 10;

/** Gallery shown by the simulated picker: a few files are rejected on purpose. */
export const GALLERY = Array.from({ length: 30 }, (_, i) => ({
  id: `g${i + 1}`, n: i + 1, hue: (i * 47) % 360,
  mb: i === 10 ? 7.8 : Math.round((1.2 + ((i * 53) % 38) / 10) * 10) / 10,
  heic: i === 5 || i === 16,
}));
export const rejectReason = g => (g.heic ? "heic" : g.mb > LIMITS.perImageMb ? "tooBig" : null);

export function quotaOf(photos, future) {
  const limit = future ? LIMITS.future : LIMITS.current;
  const used = photos.length;
  const mb = Math.round(photos.reduce((sum, p) => sum + (p.mb ?? photoMb(p.n)), 0) * 10) / 10;
  return { limit, used, mb, leftPhotos: Math.max(0, limit.photos - used), leftMb: Math.max(0, Math.round((limit.totalMb - mb) * 10) / 10) };
}

/** One photo at a time: the next queued photo starts only when the current one ends. */
export function useSequentialUpload(job) {
  const { act } = useStore();
  const photos = job.checklist.photos || [];
  const current = photos.find(p => p.status === "uploading");
  const next = photos.find(p => p.status === "queued");
  useEffect(() => {
    if (!current && !next) return undefined;
    const id = setTimeout(() => {
      if (!current) { act("CL_PHOTO_STATUS", { jobId: job.id, photoId: next.id, status: "uploading", progress: 8 }); return; }
      const progress = Math.min(100, (current.progress || 0) + 46);
      if (current.willFail && progress >= 50) act("CL_PHOTO_STATUS", { jobId: job.id, photoId: current.id, status: "failed", progress: 50 });
      else act("CL_PHOTO_STATUS", { jobId: job.id, photoId: current.id, status: progress >= 100 ? "saved" : "uploading", progress });
    }, current ? 260 : 60);
    return () => clearTimeout(id);
  }, [current?.id, current?.progress, next?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Overall progress for the whole batch, plus "retry only the failed ones". */
export function UploadQueue({ job, lang }) {
  const { act } = useStore();
  const photos = job.checklist.photos || [];
  const pending = photos.filter(p => p.status === "queued" || p.status === "uploading");
  const failed = photos.filter(p => p.status === "failed");
  const batch = photos.filter(p => p.batch && p.batch === (pending[0] || failed[0])?.batch);
  if (!pending.length && !failed.length) return null;
  const doneInBatch = batch.filter(p => p.status === "saved").length;
  const current = photos.find(p => p.status === "uploading");
  const pct = batch.length ? Math.round(((doneInBatch + (current ? current.progress / 100 : 0)) / batch.length) * 100) : 0;
  return (
    <div className={`cw-queue${failed.length && !pending.length ? " is-failed" : ""}`} role="status" aria-live="polite">
      {pending.length > 0 && (
        <>
          <div className="cw-queue-row"><Icon name="refresh" size={16} className="cw-spin" /><strong>{ct(lang, "pb.sending", { n: Math.min(doneInBatch + 1, batch.length || 1), total: batch.length || pending.length })}</strong><span className="tnum">{pct}%</span></div>
          <span className="mw-progress"><span style={{ width: `${pct}%` }} /></span>
          <span className="cw-queue-hint">{ct(lang, "pb.keepOpen")}</span>
        </>
      )}
      {failed.length > 0 && (
        <div className="cw-queue-row">
          <Icon name="alertCircle" size={16} /><span className="mw-grow">{ct(lang, "pb.failedCount", { count: failed.length })}</span>
          <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => act("CL_RETRY_FAILED", { jobId: job.id })}>{ct(lang, "pb.retryFailed", { count: failed.length })}</button>
        </div>
      )}
    </div>
  );
}

export function QuotaLine({ photos, lang, future, onToggleFuture }) {
  const q = quotaOf(photos, future);
  const near = q.leftPhotos <= 3 || q.leftMb <= 8;
  return (
    <div className={`cw-quota${near ? " is-near" : ""}`}>
      <div className="cw-quota-row">
        <strong className="tnum">{ct(lang, "pb.quota", { used: q.used, limit: q.limit.photos })}</strong>
        <span className="tnum">{ct(lang, "pb.quotaMb", { mb: q.mb, limit: q.limit.totalMb })}</span>
      </div>
      <span className="mw-progress"><span style={{ width: `${Math.min(100, (q.used / q.limit.photos) * 100)}%` }} /></span>
      <span className="cw-queue-hint">{ct(lang, future ? "pb.futureNote" : "pb.rules")}</span>
      {onToggleFuture && <label className="cw-sim"><input type="checkbox" checked={future} onChange={e => onToggleFuture(e.target.checked)} />{ct(lang, "pb.simFuture")}</label>}
    </div>
  );
}

/** Simulated device photo picker: select many in one go. */
export function PhotoPicker({ lang, photos, future, onCancel, onAdd }) {
  const [sel, setSel] = useState([]);
  const [over, setOver] = useState(false);
  const q = quotaOf(photos, future);
  const chosen = GALLERY.filter(g => sel.includes(g.id));
  const chosenMb = Math.round(chosen.reduce((s, g) => s + g.mb, 0) * 10) / 10;
  const toggle = g => {
    if (sel.includes(g.id)) { setSel(sel.filter(id => id !== g.id)); setOver(false); return; }
    if (rejectReason(g)) return;
    if (chosen.length + 1 > q.leftPhotos || chosenMb + g.mb > q.leftMb) { setOver(true); return; }
    setOver(false);
    setSel([...sel, g.id]);
  };
  const full = chosen.length >= q.leftPhotos;
  return (
    <div className="cw-picker" role="dialog" aria-modal="true" aria-label={ct(lang, "pb.pickerTitle")}>
      <header className="cw-picker-head">
        <button type="button" className="mw-linkbtn" onClick={onCancel}>{ct(lang, "pb.cancel")}</button>
        <strong>{ct(lang, "pb.selected", { count: chosen.length })}</strong>
        <button type="button" className="mw-linkbtn" disabled={!chosen.length} onClick={() => onAdd(chosen)}>{ct(lang, "pb.add")}</button>
      </header>
      <p className={`cw-picker-note${full || over ? " is-full" : ""}`} role="status">{full ? ct(lang, "pb.full", { limit: q.limit.photos }) : over ? ct(lang, "pb.overMb", { mb: Math.round((q.leftMb - chosenMb) * 10) / 10 }) : ct(lang, "pb.left", { count: q.leftPhotos - chosen.length, mb: Math.round((q.leftMb - chosenMb) * 10) / 10 })}</p>
      <ul className="cw-picker-grid">
        {GALLERY.map(g => {
          const reason = rejectReason(g);
          const on = sel.includes(g.id);
          const order = sel.indexOf(g.id) + 1;
          return (
            <li key={g.id}>
              <button type="button" className={`cw-pick${on ? " is-on" : ""}${reason ? " is-rejected" : ""}`} aria-pressed={on} disabled={Boolean(reason)}
                aria-label={`${ct(lang, "pb.photo", { n: g.n })} · ${g.mb} MB${reason ? ` · ${ct(lang, `pb.reject.${reason}`)}` : ""}`} onClick={() => toggle(g)}>
                <svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill={`hsl(${g.hue} 25% 74%)`} /><path d="M0 30 12 18l8 7 7-5 13 10v10H0z" fill={`hsl(${g.hue} 22% 58%)`} /></svg>
                {on && <span className="cw-pick-n">{order}</span>}
                {reason && <span className="cw-pick-x">{ct(lang, `pb.reject.${reason}.short`)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="cw-picker-foot">
        <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" disabled={!chosen.length} onClick={() => onAdd(chosen)}>
          <Icon name="image" size={18} />{ct(lang, "pb.addN", { count: chosen.length, mb: chosenMb })}
        </button>
      </div>
    </div>
  );
}

/** Submission states kept separate, so "saved" is never mistaken for "sent". */
export const STEPS = ["draftSaved", "photosSaved", "evidence", "submitted", "physicallyDone", "formallyDone"];
export function submissionSteps(job, missingCount) {
  const c = job.checklist;
  const photos = c.photos || [];
  const submitted = c.state === "submitted" || c.state === "reviewed" || job.status === "COMPLETED";
  return {
    draftSaved: c.savedAt || submitted ? "done" : "todo",
    photosSaved: photos.length && photos.every(p => p.status === "saved") ? "done" : photos.some(p => p.status !== "saved") ? "active" : "todo",
    evidence: missingCount ? "warn" : "done",
    submitted: submitted ? "done" : "todo",
    physicallyDone: submitted && c.workDone ? "done" : "todo",
    formallyDone: job.status === "COMPLETED" ? "done" : "todo",
  };
}

export function SubmissionSteps({ job, lang, missingCount }) {
  const states = submissionSteps(job, missingCount);
  const icon = { done: "checkCircle", warn: "alert", active: "refresh", todo: "minus" };
  return (
    <ol className="cw-stepper" aria-label={ct(lang, "pb.stepsTitle")}>
      {STEPS.map(k => (
        <li key={k} className={`is-${states[k]}`}>
          <Icon name={icon[states[k]]} size={15} />
          <span>{ct(lang, `pb.step.${k}${k === "evidence" ? (states[k] === "warn" ? ".missing" : ".ready") : ""}`, { count: missingCount })}</span>
        </li>
      ))}
    </ol>
  );
}
