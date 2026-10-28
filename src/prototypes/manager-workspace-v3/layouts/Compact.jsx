import { ActionButton } from "../flows/JobPanel.jsx";
import { attentionFor, checklistSummary, filteredJobs, nextActionFor, offerSummary, otherActionsFor } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { useLayout, useStudio } from "../studio/Studio.jsx";
import { Icon } from "../ui/Icon.jsx";
import { AttentionTag, JobStatus, Rail, cleanerName, compText, dayWord, propertyOf, useT, whenText } from "../ui/kit.jsx";
import { FilterBar } from "./Worklist.jsx";

// Strategy 3 — compact worklist with contextual detail.
// Every operational fact of the selected service is visible at once in a fixed
// fact sheet beside the list: no accordions to open and no page to leave.

function Cell({ id, job }) {
  const t = useT();
  const { data } = useStore();
  const property = propertyOf(data, job);
  const offers = offerSummary(job);
  const cl = checklistSummary(data, job);
  const top = attentionFor(data, job)[0];
  const issues = job.issues.filter(i => i.status === "open").length;
  switch (id) {
    case "title": return <span className="cx-title">{property.name}<span className="mw-sec">{property.area}</span></span>;
    case "when": return <span className="tnum cx-when">{dayWord(t, data, job.date)} · {job.start ? t.time(job.start) : t("c.timeNotSet")}</span>;
    case "cleaner": return <span className="cx-cleaner">{job.cleanerIds.length ? job.cleanerIds.map(cleanerName).join(" + ") : <span className="mw-flag tone-risk"><Icon name="userX" size={13} />{t("cx.noCleaner")}</span>}</span>;
    case "status": return <JobStatus job={job} small />;
    case "offer": return offers.sent ? <span className="cx-offer">{t("cx.offerShort", { interested: offers.interested.length, waiting: offers.waiting.length })}</span> : <span className="mw-muted">—</span>;
    case "checklist": return <span className={`cx-check tone-${cl.state === "submitted" ? "attention" : cl.state === "reviewed" ? "success" : "neutral"}`}>{t(`cl.${cl.state}`)}{cl.state !== "none" ? ` · ${cl.done}/${cl.total}` : ""}</span>;
    case "issues": return issues ? <span className="mw-flag tone-risk"><Icon name="alert" size={13} />{issues}</span> : <span className="mw-muted">—</span>;
    case "primary": return top && top.tone !== "neutral" ? <AttentionTag item={top} /> : <span className="mw-muted">{t("cx.onTrack")}</span>;
    default: return null;
  }
}

function FactSheet({ job }) {
  const t = useT();
  const { data, setUi } = useStore();
  const property = propertyOf(data, job);
  const offers = offerSummary(job);
  const cl = checklistSummary(data, job);
  const primary = nextActionFor(data, job);
  const others = otherActionsFor(data, job, primary);
  const openIssues = job.issues.filter(i => i.status === "open");
  const fact = (label, value, tone) => <div className={`cx-fact${tone ? ` tone-${tone}` : ""}`}><dt>{label}</dt><dd>{value}</dd></div>;
  return (
    <article className="cx-sheet" aria-labelledby={`cx-${job.id}`}>
      <header className="cx-sheet-head">
        <span className="mw-micro">{whenText(t, data, job)} · {t(`type.${job.type}`)}</span>
        <h2 id={`cx-${job.id}`}>{property.name}</h2>
        <Rail job={job} />
      </header>
      <div className="cx-actions">
        {primary && <ActionButton action={primary} job={job} variant="primary" />}
        {others.slice(0, 3).map(a => <ActionButton key={a} action={a} job={job} variant="quiet" />)}
      </div>
      <dl className="cx-facts">
        {fact(t("j.cleaner"), job.cleanerIds.length ? `${job.cleanerIds.map(cleanerName).join(" + ")}${job.ack ? ` · ${t(`ack.${job.ack}`)}` : ""}` : t("cx.noCleaner"), job.cleanerIds.length ? null : "risk")}
        {fact(t("cx.offers"), offers.sent ? t("cx.offerLong", { sent: offers.sent, interested: offers.interested.length, declined: offers.declined.length, waiting: offers.waiting.length }) : t("cx.noOffers"))}
        {fact(t("j.checklist"), `${t(`cl.${cl.state}`)}${cl.state !== "none" ? ` · ${t("j.items", { done: cl.done, total: cl.total })} · ${t("j.photos", { count: cl.photos })}` : ""}`, cl.state === "submitted" ? "attention" : null)}
        {fact(t("j.payment"), compText(t, job.comp))}
        {fact(t("j.issues"), openIssues.length ? openIssues.map(i => i.title[t.lang] || i.title.en).join(" · ") : t("j.noIssues"), openIssues.length ? "risk" : null)}
        {fact(t("j.property"), property.instructions[t.lang] || property.instructions.en)}
        {fact(t("cx.access"), t("j.accessMasked"))}
        {fact(t("j.activity"), job.activity.length ? `${t.stamp(job.activity[job.activity.length - 1].at)} · ${t(job.activity[job.activity.length - 1].key, job.activity[job.activity.length - 1].params)}` : "—")}
      </dl>
      <button type="button" className="mw-linkbtn" onClick={() => setUi({ overlay: { type: "detail", jobId: job.id } })}>{t("cx.fullDetail")}<Icon name="arrowR" size={14} /></button>
    </article>
  );
}

export const ROW_FIELDS = ["when", "title", "cleaner", "status", "offer", "checklist", "issues", "primary"];

export function ModeCompact() {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const layout = useLayout("row");
  const { studio, original } = useStudio();
  const fields = layout.filter(b => b.region === "row").map(b => b.id);
  const emph = id => (original ? undefined : studio.emph?.[`row/${id}`]);
  const jobs = filteredJobs(data, ui.range, ui.filter, ui.search);
  const selected = jobs.find(j => j.id === ui.selectedJobId) || jobs[0];
  return (
    <div className="cx">
      <FilterBar />
      <div className="cx-grid">
        <div className="cx-table" role="table" aria-label={t("cx.table")} style={{ "--cx-cols": fields.map(f => (f === "title" ? "minmax(150px, 1.6fr)" : "minmax(70px, 1fr)")).join(" ") }}>
          <div className="cx-row cx-headrow" role="row">{fields.map(f => <span key={f} role="columnheader" data-emph={emph(f)}>{t(`cx.col.${f}`)}</span>)}</div>
          {jobs.map(job => (
            <button key={job.id} type="button" role="row" data-job-id={job.id} className={`cx-row${selected?.id === job.id ? " is-selected" : ""}`} aria-pressed={selected?.id === job.id}
              onClick={() => setUi({ selectedJobId: job.id })}>
              {fields.map(f => <span key={f} role="cell" className={`cx-cell cx-${f}`} data-emph={emph(f)}><Cell id={f} job={job} /></span>)}
            </button>
          ))}
          {!jobs.length && <p className="mw-sec cx-empty">{t("cx.empty")}</p>}
        </div>
        {selected && <FactSheet job={selected} />}
      </div>
    </div>
  );
}
