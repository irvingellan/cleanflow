import { useMemo, useState } from "react";
import { Banner, ConsequenceDisclosure } from "../../../components/v2/primitives.jsx";
import { buildMessage } from "../model/cleanerCopy.js";
import { checklistItems, cleaners } from "../model/demoData.js";
import { translate } from "../model/messages.js";
import { checklistSummary, cleanerLoad, offerSummary, templateFor } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { formatDay, formatTime } from "../model/time.js";
import { Icon } from "../ui/Icon.jsx";
import { JobStatus, Overlay, PhotoTile, SimTag, cleanerName, compText, propertyOf, useT, whenText } from "../ui/kit.jsx";

const btn = (variant, extra = "") => `cfv2-button cfv2-button-${variant === "quiet" ? "tertiary" : variant} mw-btn ${extra}`.trim();

function useJob(id) {
  const { data } = useStore();
  return data.jobs.find(j => j.id === id);
}

function offerParams(data, job, cleaner, link, lang) {
  const property = propertyOf(data, job);
  const amount = job.comp?.mode === "hourly" ? `${translate(lang, "comp.hourly", { rate: `$${job.comp.rate}`, hours: job.comp.estHours, total: `$${job.comp.rate * job.comp.estHours}` })}` : job.comp?.amount ? `$${job.comp.amount}` : "—";
  return {
    name: cleaner.name, type: translate(lang, `type.${job.type}`), area: property.area, property: property.name,
    day: formatDay(job.date, lang, "medium"), time: job.start ? formatTime(job.start, lang) : translate(lang, "c.timeNotSet"),
    hours: Math.round(job.durationMin / 60), pay: amount, link,
  };
}

export function linkFor(job, cleanerId) {
  return `https://demo.cleanflow.invalid/o/${job.id.toUpperCase()}-${cleanerId.slice(0, 3).toUpperCase()}`;
}

/* ---------------- Assign ---------------- */
export function AssignSheet({ jobId, onClose }) {
  const t = useT();
  const { data, act, setUi } = useStore();
  const job = useJob(jobId);
  const offers = offerSummary(job);
  const [pick, setPick] = useState(offers.interested[0]?.cleanerId || "");
  const property = propertyOf(data, job);
  const ordered = useMemo(() => [...cleaners].sort((a, b) => {
    const ia = offers.interested.some(o => o.cleanerId === a.id) ? 0 : 1;
    const ib = offers.interested.some(o => o.cleanerId === b.id) ? 0 : 1;
    return ia - ib || cleanerLoad(data, a.id, job.date).length - cleanerLoad(data, b.id, job.date).length;
  }), [data, job]);
  const pickName = pick ? cleanerName(pick) : "";
  const confirm = () => {
    act("ASSIGN", { jobId, cleanerId: pick, cleanerName: pickName }, { text: t("as.assigned") });
    setUi({ overlay: { type: "remind", jobId, fromAssign: true } });
  };
  return (
    <Overlay title={t("as.title")} onClose={onClose} footer={
      <>
        <button type="button" className={btn("primary")} disabled={!pick} onClick={confirm}><Icon name="userCheck" size={17} />{pick ? t("as.confirm", { name: pickName }) : t("as.pickFirst")}</button>
        <button type="button" className={btn("quiet")} onClick={() => setUi({ overlay: { type: "offer", jobId } })}><Icon name="send" size={17} />{t("as.orOffer")}</button>
      </>}>
      <p className="mw-sheet-sub"><strong>{property.name}</strong> · {whenText(t, data, job)}</p>
      {offers.sent > 0 && (
        <section className="mw-sheet-section">
          <h3 className="mw-micro">{t("as.responses")}</h3>
          <p className="mw-sec">{t("as.privacy")}</p>
          <ul className="mw-optionlist">
            {job.offers.map(o => (
              <li key={o.cleanerId} className="mw-option-static">
                <span className="mw-avatar">{cleanerName(o.cleanerId).slice(0, 2).toUpperCase()}</span>
                <span className="mw-grow"><strong>{cleanerName(o.cleanerId)}</strong>
                  <span className={`mw-flag tone-${o.response === "interested" ? "attention" : o.response === "declined" ? "neutral" : "info"}`}>{t(`offer.${o.response || "waiting"}`)}{o.via === "message" && o.response ? ` · ${t("offer.viaMessage")}` : ""}</span>
                </span>
                {!o.response && (
                  <button type="button" className={btn("quiet", "cfv2-button-small")} title={t("as.recordHint")}
                    onClick={() => { act("OFFER_RESPONSE", { jobId, cleanerId: o.cleanerId, cleanerName: cleanerName(o.cleanerId), response: "interested", via: "message" }); setPick(o.cleanerId); }}>
                    <Icon name="msg" size={15} />{t("as.recordAction", { name: cleanerName(o.cleanerId) })}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mw-hint"><Icon name="info" size={14} />{t("as.recordHint")} <SimTag kind="proposal" /></p>
        </section>
      )}
      <section className="mw-sheet-section">
        <h3 className="mw-micro" id="assign-choose">{t("as.choose")}</h3>
        <div className="mw-optionlist" role="radiogroup" aria-labelledby="assign-choose">
          {ordered.map(c => {
            const load = cleanerLoad(data, c.id, job.date).filter(j => j.id !== job.id);
            const interested = offers.interested.some(o => o.cleanerId === c.id);
            return (
              <label key={c.id} className={`mw-option${pick === c.id ? " is-on" : ""}`}>
                <input type="radio" name="assign-cleaner" value={c.id} checked={pick === c.id} onChange={() => setPick(c.id)} />
                <span className="mw-avatar">{c.name.slice(0, 2).toUpperCase()}</span>
                <span className="mw-grow"><strong>{c.name}</strong>
                  <span className="mw-sec">{load.length ? t("as.busy", { count: load.length, times: load.map(j => (j.start ? t.time(j.start) : "—")).join(", ") }) : t("as.free")}</span>
                </span>
                {interested && <span className="mw-flag tone-attention"><Icon name="userCheck" size={14} />{t("offer.interested")}</span>}
              </label>
            );
          })}
        </div>
      </section>
      {pick && <ConsequenceDisclosure title={t("as.consequence")} will={[t("as.will", { name: pickName, property: property.name })]} willNot={[t("as.wont1"), t("as.wont2")]} />}
    </Overlay>
  );
}

/* ---------------- Offer composer ---------------- */
export function OfferComposer({ jobId, onClose }) {
  const t = useT();
  const { data, act, setUi, ui } = useStore();
  const job = useJob(jobId);
  const property = propertyOf(data, job);
  const known = property.defaultPayout;
  const [selected, setSelected] = useState([]);
  const [override, setOverride] = useState(!known);
  const [amount, setAmount] = useState(known ? String(known) : "");
  const [reason, setReason] = useState("");
  const [concept, setConcept] = useState(ui.offerConcept || "details");
  const [previewId, setPreviewId] = useState(null);
  const [sent, setSent] = useState(null);
  const offered = new Set(job.offers.map(o => o.cleanerId));
  const value = Number(amount);
  const differs = known && override && value && value !== known;
  const blocked = !selected.length ? t("of.pick") : (!value ? t("of.amount") : (differs && !reason.trim() ? t("of.reasonNeeded") : null));
  const comp = job.comp?.mode === "hourly" ? job.comp : { mode: "fixed", amount: override ? value : known, source: differs ? "override" : (known ? "property" : "manual"), reason: differs ? reason.trim() : undefined };
  const previewCleaner = cleaners.find(c => c.id === (previewId || selected[0])) || cleaners.find(c => !offered.has(c.id));
  const previewJob = { ...job, comp };
  const message = buildMessage(concept, previewCleaner.lang, offerParams(data, previewJob, previewCleaner, linkFor(job, previewCleaner.id), previewCleaner.lang));
  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const send = () => {
    act("SEND_OFFERS", { jobId, cleanerIds: selected, comp, link: linkFor(job, selected[0]), concept }, { text: t("of.sent"), icon: "send" });
    setUi({ offerConcept: concept });
    setSent(selected);
  };
  const copy = text => { try { navigator.clipboard?.writeText(text); } catch { /* demo */ } setUi({ toast: { id: Date.now(), text: t("c.copied"), icon: "check" } }); };

  if (sent) {
    return (
      <Overlay title={t("of.title")} onClose={onClose}>
        <Banner tone="success" title={t("of.sent")} />
        <ul className="mw-optionlist">
          {sent.map(id => {
            const c = cleaners.find(x => x.id === id);
            const text = buildMessage(concept, c.lang, offerParams(data, { ...job, comp }, c, linkFor(job, id), c.lang));
            return (
              <li key={id} className="mw-option-static mw-sent-row">
                <span className="mw-avatar">{c.name.slice(0, 2).toUpperCase()}</span>
                <span className="mw-grow"><strong>{c.name}</strong><span className="mw-sec mw-mono">{linkFor(job, id)}</span></span>
                <button type="button" className={btn("secondary", "cfv2-button-small")} onClick={() => copy(text)}><Icon name="clipboard" size={15} />{t("c.copy")}</button>
                <button type="button" className={btn("primary", "cfv2-button-small")} onClick={() => setUi({ overlay: null, cleanerView: { kind: "offer", jobId, cleanerId: id } })}><Icon name="phone" size={15} />{t("of.openCleaner", { name: c.name })}</button>
              </li>
            );
          })}
        </ul>
      </Overlay>
    );
  }

  return (
    <Overlay title={t("of.title")} onClose={onClose} wide footer={
      <button type="button" className={btn("primary")} disabled={Boolean(blocked)} onClick={send}><Icon name={blocked ? "lock" : "send"} size={17} />{blocked || t("of.send", { count: selected.length })}</button>}>
      <p className="mw-sheet-sub"><strong>{property.name}</strong> · {whenText(t, data, job)} · {t(`type.${job.type}`)}</p>
      <div className="mw-offer-grid">
        <div>
          <section className="mw-sheet-section">
            <h3 className="mw-micro">{t("of.who")}</h3>
            <div className="mw-optionlist">
              {cleaners.map(c => {
                const load = cleanerLoad(data, c.id, job.date);
                return (
                  <label key={c.id} className={`mw-option${selected.includes(c.id) ? " is-on" : ""}`}>
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                    <span className="mw-grow"><span className="mw-lang-inline"><strong>{c.name}</strong><span className="mw-tag">{c.lang.toUpperCase()}</span></span>
                      <span className="mw-sec">{load.length ? t("as.busy", { count: load.length, times: load.map(j => (j.start ? t.time(j.start) : "—")).join(", ") }) : t("as.free")}{offered.has(c.id) ? ` · ${t("of.already")}` : ""}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
          <section className="mw-sheet-section">
            <h3 className="mw-micro">{t("of.pay")}</h3>
            {job.comp?.mode === "hourly" ? <p><strong>{compText(t, job.comp)}</strong> <SimTag kind="proposal" /></p> : (
              <>
                {known ? (
                  <div className={`mw-known${override ? "" : " is-on"}`}>
                    <Icon name="checkCircle" size={18} />
                    <span><strong>{t("of.known", { amount: t.money(known), property: property.name })}</strong><span className="mw-sec">{t("of.knownHint")}</span></span>
                  </div>
                ) : <Banner tone="attention" title={t("of.noKnown")} />}
                {known && <label className="mw-check"><input type="checkbox" checked={override} onChange={e => { setOverride(e.target.checked); if (!e.target.checked) setAmount(String(known)); }} />{t("of.override")}</label>}
                {override && (
                  <div className="mw-fieldrow">
                    <label className="mw-field"><span>{t("of.amount")}</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
                    {known && <label className="mw-field mw-grow"><span>{t("of.reason")}</span><input value={reason} onChange={e => setReason(e.target.value)} /></label>}
                  </div>
                )}
                {differs && <p className="mw-flag tone-attention"><Icon name="alert" size={14} />{t("of.diff", { amount: t.money(value), known: t.money(known) })}</p>}
              </>
            )}
          </section>
          <ConsequenceDisclosure title={t("of.consequence")} will={[t("of.will")]} willNot={[t("of.wont"), t("of.wont2")]} />
        </div>
        <section className="mw-sheet-section">
          <h3 className="mw-micro">{t("of.message")}</h3>
          <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("of.concept")}>
            {["details", "button"].map(k => <button key={k} type="button" aria-pressed={concept === k} onClick={() => setConcept(k)}>{t(`of.concept.${k}`)}</button>)}
          </div>
          {selected.length > 1 && (
            <div className="mw-chiprow">{selected.map(id => <button key={id} type="button" className="mw-chip" aria-pressed={(previewId || selected[0]) === id} onClick={() => setPreviewId(id)}>{cleanerName(id)}</button>)}</div>
          )}
          <p className="mw-sec">{t("of.previewFor", { name: previewCleaner.name })}</p>
          <div className="mw-bubble" aria-label="WhatsApp preview"><pre>{message}</pre></div>
          <p className="mw-hint"><Icon name="link" size={14} />{t("of.link")}</p>
        </section>
      </div>
    </Overlay>
  );
}

/* ---------------- Reminder ---------------- */
export function ReminderSheet({ jobId, fromAssign, onClose }) {
  const t = useT();
  const { data, act, setUi } = useStore();
  const job = useJob(jobId);
  const cleaner = cleaners.find(c => c.id === job.cleanerIds[0]);
  if (!cleaner) return null;
  const text = buildMessage("reminder", cleaner.lang, offerParams(data, job, cleaner, `https://demo.cleanflow.invalid/s/${job.id.toUpperCase()}`, cleaner.lang));
  return (
    <Overlay title={t("rm.title")} onClose={onClose} footer={
      <>
        <button type="button" className={btn("primary")} onClick={() => { try { navigator.clipboard?.writeText(text); } catch { /* demo */ } act("REMINDER_PREPARED", { jobId }, { text: t("rm.done") }); onClose(); }}><Icon name="clipboard" size={17} />{t("rm.mark")}</button>
        <button type="button" className={btn("quiet")} onClick={() => { act("CLEANER_CONFIRMED", { jobId, cleanerName: cleaner.name }); onClose(); }}><Icon name="userCheck" size={17} />{t("rm.simConfirm")}</button>
      </>}>
      {fromAssign && <Banner tone="success" title={t("as.assigned")} />}
      <p className="mw-sec">{t("rm.intro", { name: cleaner.name })}</p>
      <div className="mw-bubble"><pre>{text}</pre></div>
    </Overlay>
  );
}

/* ---------------- Checklist review ---------------- */
export function ReviewSheet({ jobId, onClose }) {
  const t = useT();
  const { data, act, setUi } = useStore();
  const job = useJob(jobId);
  const property = propertyOf(data, job);
  const cl = checklistSummary(data, job);
  const tpl = templateFor(data, job);
  const [requesting, setRequesting] = useState(false);
  const [note, setNote] = useState("");
  const name = job.cleanerIds.map(cleanerName).join(" + ");
  const items = checklistItems(tpl.sections);
  const missing = [...cl.missingPhotos, ...cl.missingItems];
  const title = cl.state === "draft" ? t("rv.draftTitle") : cl.state === "reviewed" || job.status === "COMPLETED" ? t("rv.reportTitle") : t("rv.title");
  const photos = job.checklist.photos || [];
  const footer = (() => {
    if (cl.state === "submitted" && !requesting) {
      return missing.length ? (
        <>
          <button type="button" className={btn("primary")} onClick={() => setRequesting(true)}><Icon name="msg" size={17} />{t("rv.request")}</button>
          <button type="button" className={btn("quiet")} onClick={() => act("REVIEW_CHECKLIST", { jobId, outcome: "approved" }, { text: t("rv.approved") })}>{t("rv.approveAnyway")}</button>
        </>
      ) : (
        <>
          <button type="button" className={btn("primary")} onClick={() => act("REVIEW_CHECKLIST", { jobId, outcome: "approved" }, { text: t("rv.approved") })}><Icon name="check" size={17} />{t("rv.approve")}</button>
          <button type="button" className={btn("quiet")} onClick={() => setRequesting(true)}>{t("rv.request")}</button>
        </>
      );
    }
    if (requesting) {
      return (
        <>
          <button type="button" className={btn("primary")} disabled={!note.trim()} onClick={() => { act("REVIEW_CHECKLIST", { jobId, outcome: "changes", note }, { text: t("act.changesRequested") }); setRequesting(false); }}><Icon name="send" size={17} />{t("rv.requestSend")}</button>
          <button type="button" className={btn("quiet")} onClick={() => setRequesting(false)}>{t("c.cancel")}</button>
        </>
      );
    }
    if (cl.state === "reviewed" && job.status !== "COMPLETED") {
      return <button type="button" className={btn("primary")} onClick={() => setUi({ overlay: { type: "complete", jobId } })}><Icon name="checkCircle" size={17} />{t("a.complete")}</button>;
    }
    return null;
  })();
  return (
    <Overlay title={title} onClose={onClose} wide footer={footer}>
      <p className="mw-sheet-sub"><strong>{property.name}</strong> · {whenText(t, data, job)}</p>
      <div className="mw-review-status"><JobStatus job={job} /><span className="mw-tag">{t("j.version", { v: cl.templateVersion })}</span></div>
      {cl.state === "draft" && <Banner tone="info" title={t("cl.draft")}>{t("rv.draftNote", { name, time: t.stamp(job.checklist.savedAt) })}</Banner>}
      {(cl.state === "submitted" || cl.state === "reviewed") && job.checklist.submittedAt && <p className="mw-sec">{t("rv.submittedBy", { name, time: t.stamp(job.checklist.submittedAt) })}</p>}
      {cl.state === "reviewed" && job.status !== "COMPLETED" && <Banner tone="success" title={t("rv.approved")}>{t("rv.thenComplete")}</Banner>}
      {cl.state === "submitted" && missing.length > 0 && (
        <Banner tone="risk" title={t("rv.missingTitle")}>
          {missing.map(i => i.label[t.lang] || i.label.en).join(" · ")}
          {job.checklist.missingNote ? <><br />{t("rv.missingNote", { note: job.checklist.missingNote })}</> : null}
        </Banner>
      )}
      {job.checklist.workDone && cl.state !== "draft" && <p className="mw-flag tone-success"><Icon name="checkCircle" size={15} />{t("rv.workDone")}</p>}
      {job.checklist.notes && <div className="mw-quote"><span className="mw-micro">{t("rv.notes")}</span><p>{job.checklist.notes}</p></div>}
      {requesting && <label className="mw-field"><span>{t("rv.requestNote")}</span><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} data-autofocus /></label>}
      {cl.state === "submitted" && <p className="mw-hint"><SimTag kind="proposal" /> {t("rv.proposal")}</p>}
      <h3 className="mw-micro">{t("rv.sections")}</h3>
      <div className="mw-review-sections">
        {tpl.sections.map(section => {
          const sectionItems = items.filter(i => i.sectionId === section.id);
          const sectionPhotos = photos.filter(p => p.sectionId === section.id);
          const done = sectionItems.filter(i => job.checklist.items?.[i.id]).length;
          return (
            <section key={section.id} className="mw-review-section">
              <header><strong>{section.title[t.lang] || section.title.en}</strong><span className="mw-sec">{done}/{sectionItems.length} · {t("j.photos", { count: sectionPhotos.length })}</span></header>
              <ul>
                {sectionItems.map(item => {
                  const ok = job.checklist.items?.[item.id];
                  return <li key={item.id} className={ok ? "is-ok" : "is-missing"}><Icon name={ok ? "check" : item.photo ? "camera" : "minus"} size={15} />{item.label[t.lang] || item.label.en}{!ok && <span className="mw-flag tone-risk">{item.photo ? t("rv.missing") : t("rv.notDone")}</span>}</li>;
                })}
              </ul>
              {sectionPhotos.length > 0 && (
                <div className="mw-photostrip">
                  {sectionPhotos.map(p => <PhotoTile key={p.id} photo={p} label={t("rv.photoOf", { n: p.n || "", item: (items.find(i => i.id === p.itemId)?.label[t.lang]) || "" })} />)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Overlay>
  );
}

/* ---------------- Complete ---------------- */
export function CompleteSheet({ jobId, onClose }) {
  const t = useT();
  const { data, act } = useStore();
  const job = useJob(jobId);
  const property = propertyOf(data, job);
  const cl = checklistSummary(data, job);
  return (
    <Overlay kind="sheet" title={t("cp.title", { property: property.name })} onClose={onClose} footer={
      <>
        <button type="button" className={btn("primary")} onClick={() => { act("COMPLETE_JOB", { jobId }, { text: t("cp.done") }); onClose(); }}><Icon name="checkCircle" size={17} />{t("cp.confirm")}</button>
        <button type="button" className={btn("secondary")} onClick={onClose} data-autofocus>{t("c.cancel")}</button>
      </>}>
      {cl.state !== "reviewed" && cl.state !== "none" && <Banner tone="attention" title={t("cp.notReviewed")} />}
      <ConsequenceDisclosure title={t("cp.consequence")} will={[t("cp.will")]} willNot={[t("cp.wont1"), t("cp.wont2")]} />
    </Overlay>
  );
}

/* ---------------- Issue ---------------- */
export function IssueSheet({ jobId, onClose }) {
  const t = useT();
  const { act } = useStore();
  const job = useJob(jobId);
  const open = job.issues.filter(i => i.status === "open");
  return (
    <Overlay kind="sheet" title={t("j.issues")} onClose={onClose}>
      {open.length ? open.map(issue => (
        <div key={issue.id} className="mw-issue">
          <Banner tone="risk" title={issue.title[t.lang] || issue.title.en}>{cleanerName(issue.by)} · {t.stamp(issue.at)}</Banner>
          <button type="button" className={btn("secondary")} onClick={() => { act("RESOLVE_ISSUE", { jobId, issueId: issue.id }, { text: t("is.resolved") }); onClose(); }}>{t("is.resolve")}</button>
        </div>
      )) : <p className="mw-sec">{t("j.noIssues")}</p>}
    </Overlay>
  );
}
