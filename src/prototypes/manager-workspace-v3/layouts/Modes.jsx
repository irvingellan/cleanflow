import { useState } from "react";
import { ActionButton, useActions } from "../flows/JobPanel.jsx";
import { attentionFor, attentionQueue, dayCounts, filteredJobs, jobsInRange, nextActionFor, otherActionsFor, parseIntent } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { addDays, rangeFor, rangeDays } from "../model/time.js";
import { Icon } from "../ui/Icon.jsx";
import { AttentionTag, CleanerCell, JobRow, JobStatus, SimTag, cleanerName, dayWord, propertyOf, useT, whenText, whyText } from "../ui/kit.jsx";
import { Worklist } from "./Worklist.jsx";
import { EditableLabel, StudioArea } from "../studio/Studio.jsx";

// On phones the detail opens over the current screen, so Back returns there.
const workScreen = () => (typeof window !== "undefined" && window.innerWidth < 720 ? {} : { hybridScreen: "work" });

const QUESTION_ICONS = { noCleaner: "userX", responses: "userCheck", notConfirmed: "clock", review: "clipCheck", readyToComplete: "checkCircle", issues: "alert" };

/* ---------------- Shared pieces ---------------- */
function Headline({ counts, keyName = "now.headline", needs }) {
  const t = useT();
  return <p className="mw-headline"><strong>{t(keyName, { needs: needs ?? counts.needsYou, ok: counts.onTrack })}</strong></p>;
}

function QuestionStrip({ counts, onPick }) {
  const t = useT();
  return (
    <div className="mw-questions" role="list">
      {Object.keys(QUESTION_ICONS).map(key => (
        <button key={key} type="button" role="listitem" className={`mw-question${counts[key] ? ` is-${key === "issues" ? "risk" : key === "readyToComplete" ? "success" : "attention"}` : ""}`} onClick={() => onPick(key)}>
          <Icon name={QUESTION_ICONS[key]} size={16} />
          <span className="mw-question-n tnum">{counts[key]}</span>
          <span className="mw-question-l">{t(`q.${key}`)}</span>
        </button>
      ))}
    </div>
  );
}

const questionIntent = { noCleaner: "atribuir", responses: "atribuir", notConfirmed: "lembrar", review: "revisar", readyToComplete: "revisar", issues: "problemas" };
const questionFilter = { noCleaner: "noCleaner", responses: "responses", notConfirmed: "notConfirmed", review: "review", readyToComplete: "inProgress", issues: "needsYou" };

export function CommandBar({ value, onChange, autoFocusId = "mw-command", hideLabel = false }) {
  const t = useT();
  const { data, ui } = useStore();
  const counts = dayCounts(data, ui.range);
  const shortcuts = [
    ["assign", "atribuir", counts.noCleaner], ["review", "revisar", counts.review], ["remind", "lembrar", counts.notConfirmed], ["issues", "problemas", counts.issues], ["create", "novo serviço", null],
  ];
  return (
    <div className="mw-command">
      <label htmlFor={autoFocusId} className={hideLabel ? "mw-visually-hidden" : "mw-command-label"}><Icon name="spark" size={18} />{t("cmd.label")}</label>
      <div className="mw-command-field">
        <Icon name="search" size={18} />
        <input id={autoFocusId} value={value} onChange={e => onChange(e.target.value)} placeholder={t("cmd.placeholder")} autoComplete="off" />
        {value && <button type="button" className="mw-iconbtn" aria-label={t("cmd.clear")} onClick={() => onChange("")}><Icon name="x" size={16} /></button>}
        <kbd className="mw-kbd" aria-hidden="true">/</kbd>
      </div>
      <div className="mw-chiprow" role="group" aria-label={t("cmd.label")}>
        {shortcuts.map(([intent, word, n]) => (
          <button key={intent} type="button" className="mw-chip mw-chip-intent" onClick={() => onChange(intent === "create" ? "novo serviço" : word)}>
            {t(`cmd.intent.${intent}`)}{n ? <span className="mw-chip-count is-attention">{n}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResolvedJob({ job, compact }) {
  const t = useT();
  const { data, setUi } = useStore();
  const next = nextActionFor(data, job);
  const top = attentionFor(data, job)[0];
  const property = propertyOf(data, job);
  return (
    <article className={`mw-resolved${top ? ` tone-${top.tone}` : ""}`}>
      <div className="mw-resolved-head">
        <span className="mw-micro">{whenText(t, data, job)}</span>
        <h3>{property.name}</h3>
        <p className="mw-sec">{property.area} · <CleanerCell job={job} /></p>
        <JobStatus job={job} />
      </div>
      <div className="mw-resolved-action">
        <span className="mw-micro">{t("cmd.recommended")}</span>
        {top && <AttentionTag item={top} />}
        <p className="mw-why">{top ? whyText(t, data, top, job) : t(`att.${next.kind}`)}</p>
        <ActionButton action={next.action} job={job} variant="primary" size="large" block={compact} />
        <div className="mw-other-inline">
          {otherActionsFor(data, job, next.action).slice(0, 3).map(a => <ActionButton key={a} action={a} job={job} variant="quiet" size="small" />)}
          <button type="button" className="mw-linkbtn" onClick={() => setUi({ selectedJobId: job.id, ...workScreen() })}>{t("hy.work")}<Icon name="arrowR" size={14} /></button>
        </div>
      </div>
    </article>
  );
}

function CommandResults({ text, onCreate }) {
  const t = useT();
  const { data, setUi } = useStore();
  const parsed = parseIntent(data, text);
  if (parsed.intent === "create") {
    return <section className="mw-results"><button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-large" onClick={onCreate}><Icon name="plus" size={18} />{t("app.newService")}</button></section>;
  }
  return (
    <section className="mw-results" aria-live="polite">
      <p className="mw-understood">
        <span className="mw-micro">{t("cmd.understood")}</span>
        {parsed.intent && <span className="mw-tag">{t(`cmd.intent.${parsed.intent}`)}</span>}
        {parsed.named?.map(p => <span key={p.id} className="mw-tag">{p.name}</span>)}
        <span className="mw-sec">{parsed.jobs.length ? t("cmd.matches", { count: parsed.jobs.length }) : t("cmd.noMatch")}</span>
      </p>
      {parsed.jobs[0] && <ResolvedJob job={parsed.jobs[0]} />}
      {parsed.jobs.length > 1 && (
        <div className="mw-panel mw-panel-flush">
          {parsed.jobs.slice(1, 9).map(job => <JobRow key={job.id} job={job} showDay onSelect={j => setUi({ selectedJobId: j.id, ...workScreen() })} />)}
        </div>
      )}
    </section>
  );
}

function AttentionQueue({ items, limit, onOpen }) {
  const t = useT();
  const { data } = useStore();
  const run = useActions();
  if (!items.length) return <div className="mw-allclear"><Icon name="checkCircle" size={22} /><p>{t("now.allClear")}</p></div>;
  return (
    <ol className="mw-queue">
      {items.slice(0, limit).map(item => {
        const property = propertyOf(data, item.job);
        return (
          <li key={`${item.job.id}-${item.kind}`} className={`mw-queue-item tone-${item.tone}`}>
            <button type="button" className="mw-queue-main" onClick={() => onOpen(item.job)}>
              <span className="mw-queue-top"><AttentionTag item={item} /><span className="mw-sec tnum">{whenText(t, data, item.job)}</span></span>
              <span className="mw-queue-title">{property.name}</span>
              <span className="mw-sec">{whyText(t, data, item, item.job)}</span>
            </button>
            <button type="button" className={`cfv2-button ${item.tone === "risk" || item.tone === "warning" ? "cfv2-button-primary" : "cfv2-button-secondary"} cfv2-button-small mw-btn`} onClick={() => run(item.action, item.job)}>{t(`a.${item.action}`)}</button>
          </li>
        );
      })}
    </ol>
  );
}

function DayCard({ date, onOpenDay }) {
  const t = useT();
  const { data, setUi } = useStore();
  const range = { start: date, end: date, kind: "day", anchor: date };
  const counts = dayCounts(data, range);
  const jobs = jobsInRange(data, range);
  const exceptions = jobs.filter(j => attentionFor(data, j).some(a => a.tone !== "neutral"));
  return (
    <section className="mw-daycard" aria-label={t.day(date, "long")}>
      <header>
        <h3>{dayWord(t, data, date)}<span className="mw-sec"> · {t.day(date, "medium")}</span></h3>
        <span className="mw-sec tnum">{t("b.jobs", { count: counts.total })}</span>
      </header>
      {counts.total ? (
        <>
          <div className="mw-daybar" role="img" aria-label={`${counts.needsYou} ${t("q.needsYou")}, ${counts.onTrack} ${t("q.onTrack")}, ${counts.completed} ${t("q.completed")}`}>
            <span className="is-done" style={{ flex: counts.completed }} /><span className="is-ok" style={{ flex: counts.onTrack }} /><span className="is-need" style={{ flex: counts.needsYou }} />
          </div>
          <p className="mw-daylegend"><span><i className="is-need" />{counts.needsYou} {t("q.needsYou")}</span><span><i className="is-ok" />{counts.onTrack} {t("q.onTrack")}</span><span><i className="is-done" />{counts.completed} {t("q.completed")}</span></p>
          {exceptions.length > 0 && <div className="mw-mini">{exceptions.slice(0, 4).map(job => <JobRow key={job.id} job={job} onSelect={j => setUi({ selectedJobId: j.id, ...workScreen() })} />)}</div>}
          <button type="button" className="mw-linkbtn" onClick={() => onOpenDay(date)}>{t("now.openDay")}<Icon name="arrowR" size={14} /></button>
        </>
      ) : <p className="mw-sec">{t("now.dayEmpty")}</p>}
    </section>
  );
}

function WeekStrip({ range, onOpenDay }) {
  const t = useT();
  const { data } = useStore();
  return (
    <section className="mw-weekstrip" aria-label={t("date.week")}>
      {rangeDays(range).map(date => {
        const c = dayCounts(data, { start: date, end: date });
        return (
          <button key={date} type="button" className={`mw-weekday${date === data.clock.date ? " is-today" : ""}`} onClick={() => onOpenDay(date)}>
            <span className="mw-micro">{t.day(date, "medium")}</span>
            <strong className="tnum">{c.total}</strong>
            <span className={`mw-flag tone-${c.needsYou ? "warning" : "neutral"}`}>{c.needsYou ? `${c.needsYou} ${t("q.needsYou")}` : t("q.onTrack")}</span>
          </button>
        );
      })}
    </section>
  );
}

/* ---------------- Hybrid C + A ---------------- */
export function HybridNow() {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const [text, setText] = useState("");
  const queue = attentionQueue(data, ui.range);
  const counts = dayCounts(data, ui.range);
  const first = queue[0];
  const run = useActions();
  const openJob = job => setUi({ selectedJobId: job.id, filter: "needsYou", ...workScreen() });
  const openDay = date => setUi({ range: date === data.clock.date ? rangeFor("today", date, data.clock.date) : rangeFor("day", date, data.clock.date), filter: "all", hybridScreen: "work" });
  const week = ui.range.kind === "week";
  const items = {
    headline: (
      <div className="mw-now-head">
        <Headline counts={counts} needs={queue.length} />
        <button type="button" className="cfv2-button cfv2-button-secondary mw-btn" onClick={() => setUi({ hybridScreen: "work", filter: "all" })}><Icon name="list" size={17} /><EditableLabel k="hy.openWork">{t("hy.openWork")}</EditableLabel></button>
      </div>
    ),
    command: <CommandBar value={text} onChange={setText} />,
    startWith: text ? <CommandResults text={text} onCreate={() => { setText(""); setUi({ overlay: { type: "newService" } }); }} /> : first ? (
      <article className={`mw-hero tone-${first.tone}`}>
        <EditableLabel k="now.startWith" className="mw-micro">{t("now.startWith")}</EditableLabel>
        <div className="mw-hero-row">
          <div className="mw-grow">
            <AttentionTag item={first} />
            <h2>{propertyOf(data, first.job).name}</h2>
            <p className="mw-sec">{whenText(t, data, first.job)} · {whyText(t, data, first, first.job)}</p>
          </div>
          <div className="mw-hero-actions">
            <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-large" onClick={() => run(first.action, first.job)}><EditableLabel k={`a.${first.action}`}>{t(`a.${first.action}`)}</EditableLabel><Icon name="arrowR" size={17} /></button>
            <button type="button" className="mw-linkbtn" onClick={() => openJob(first.job)}>{t("hy.work")}<Icon name="arrowR" size={14} /></button>
          </div>
        </div>
      </article>
    ) : null,
    queue: text ? null : (
      <section className="mw-panel">
        <header className="mw-panel-head"><h2><EditableLabel k="now.queue">{t("now.queue")}</EditableLabel><span className="mw-count">{queue.length}</span></h2><span className="mw-sec">{t("now.exceptionsOnly")}</span></header>
        <AttentionQueue items={queue.slice(1)} limit={8} onOpen={openJob} />
        {queue.length > 9 && <button type="button" className="mw-linkbtn" onClick={() => setUi({ hybridScreen: "work", filter: "needsYou" })}>{t("now.queueMore", { count: queue.length - 9 })}</button>}
      </section>
    ),
    questions: <QuestionStrip counts={counts} onPick={key => setUi({ hybridScreen: "work", filter: questionFilter[key] })} />,
    today: week ? <WeekStrip range={ui.range} onOpenDay={openDay} /> : <DayCard date={ui.range.start} onOpenDay={openDay} />,
    tomorrow: week ? null : <DayCard date={addDays(ui.range.start, 1)} onOpenDay={openDay} />,
    future: (
      <section className="mw-future" aria-label={t("fut.title")}>
        <span className="mw-micro">{t("fut.title")} <SimTag kind="future" /></span>
        <p className="mw-sec">{t("fut.body")}</p>
        <button type="button" className="mw-linkbtn" onClick={() => setUi({ overlay: { type: "reservations" } })}>{t("rx.open")}<Icon name="arrowR" size={14} /></button>
      </section>
    ),
  };
  return (
    <div className="mw-now">
      <StudioArea screen="now" region="top" className="mw-now-top" items={items} />
      <div className="mw-now-grid">
        <StudioArea screen="now" region="main" className="mw-now-main" items={items} />
        <StudioArea screen="now" region="side" className="mw-now-side" items={items} />
      </div>
    </div>
  );
}

export function HybridWork() {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const counts = dayCounts(data, ui.range);
  return (
    <Worklist heading={
      <div className="mw-work-head">
        <button type="button" className="mw-linkbtn" onClick={() => setUi({ hybridScreen: "now" })}><Icon name="arrowL" size={15} />{t("hy.backToNow")}</button>
        <Headline counts={counts} />
      </div>} />
  );
}

/* ---------------- A · Calm Workspace ---------------- */
export function ModeA() {
  const { data, ui } = useStore();
  const counts = dayCounts(data, ui.range);
  return <Worklist heading={<div className="mw-work-head"><Headline counts={counts} keyName="a.headline" /></div>} />;
}

/* ---------------- B · Attention Cockpit ---------------- */
const B_GROUPS = [
  ["issues", ["overdue", "issue", "reviewProblem"], "alert"],
  ["noCleaner", ["noCleanerToday", "noCleanerTomorrow", "offersWaiting"], "userX"],
  ["responses", ["interest"], "userCheck"],
  ["confirm", ["notNotified", "notConfirmed"], "clock"],
  ["review", ["review"], "clipCheck"],
  ["links", ["staleLink"], "link"],
];

export function ModeB() {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const [all, setAll] = useState(false);
  const run = useActions();
  const queue = attentionQueue(data, ui.range);
  const counts = dayCounts(data, ui.range);
  const jobs = jobsInRange(data, ui.range);
  const [focus, setFocus] = useState(null);
  const rows = focus ? filteredJobs(data, ui.range, questionFilter[focus]) : all ? jobs : jobs.filter(j => attentionFor(data, j).some(a => a.tone !== "neutral"));
  const working = [...new Set(jobs.flatMap(j => j.cleanerIds))];
  const open = job => setUi({ selectedJobId: job.id, overlay: { type: "detail", jobId: job.id } });
  return (
    <div className="mw-cockpit">
      <header className="mw-cockpit-head">
        <div><p className="mw-micro">{t("b.greeting")}</p><h1 className="mw-pagetitle">{t("b.summary", { total: counts.total, ok: counts.onTrack })}</h1></div>
        <QuestionStrip counts={counts} onPick={key => setFocus(f => (f === key ? null : key))} />
      </header>
      <div className="mw-cockpit-grid">
        <section className="mw-cockpit-attention" aria-label={t("b.attention")}>
          <h2 className="mw-section-title">{t("b.attention")}<span className="mw-count">{queue.length}</span></h2>
          {!queue.length && <div className="mw-allclear"><Icon name="checkCircle" size={22} /><p>{t("b.allClear")}</p></div>}
          {B_GROUPS.map(([key, kinds, icon]) => {
            const items = queue.filter(i => kinds.includes(i.kind));
            if (!items.length) return null;
            return (
              <article key={key} className={`mw-group tone-${items[0].tone}`}>
                <header><Icon name={icon} size={18} /><h3>{t(`b.group.${key}`)}</h3><span className="mw-group-n tnum">{items.length}</span></header>
                <p className="mw-sec">{items.map(i => propertyOf(data, i.job).name).join(", ")}</p>
                <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={() => run(items[0].action, items[0].job)}>{t("b.startWith", { property: propertyOf(data, items[0].job).name })}<Icon name="arrowR" size={15} /></button>
              </article>
            );
          })}
        </section>
        <section className="mw-cockpit-timeline" aria-label={t("b.timeline")}>
          <header className="mw-panel-head">
            <h2 className="mw-section-title">{t("b.timeline")}</h2>
            {focus && <button type="button" className="mw-chip" aria-pressed="true" onClick={() => setFocus(null)}>{t(`q.${focus}`)}<Icon name="x" size={14} /></button>}
            <div className="cfv2-segmented mw-seg-control">
              <button type="button" aria-pressed={!all && !focus} onClick={() => { setAll(false); setFocus(null); }}>{t("b.onlyExceptions")}</button>
              <button type="button" aria-pressed={all && !focus} onClick={() => { setAll(true); setFocus(null); }}>{t("b.showAll", { count: jobs.length })}</button>
            </div>
          </header>
          <div className="mw-table" role="table" aria-label={t("b.timeline")}>
            <div className="mw-tr mw-th" role="row"><span role="columnheader">{t("th.time")}</span><span role="columnheader">{t("th.property")}</span><span role="columnheader">{t("th.cleaner")}</span><span role="columnheader">{t("th.status")}</span><span role="columnheader">{t("th.attention")}</span></div>
            {rows.map(job => {
              const top = attentionFor(data, job)[0];
              return (
                <button key={job.id} type="button" role="row" className={`mw-tr${top && top.tone !== "neutral" ? ` has-${top.tone}` : ""}`} onClick={() => open(job)}>
                  <span role="cell" className="tnum">{ui.range.kind === "week" ? `${dayWord(t, data, job.date)} · ` : ""}{job.start ? t.time(job.start) : "—"}</span>
                  <span role="cell"><strong>{propertyOf(data, job).name}</strong></span>
                  <span role="cell"><CleanerCell job={job} /></span>
                  <span role="cell"><JobStatus job={job} small /></span>
                  <span role="cell">{top && top.tone !== "neutral" ? <AttentionTag item={top} /> : <span className="mw-sec">{t("att.onTrack")}</span>}</span>
                </button>
              );
            })}
          </div>
          <div className="mw-working">
            <h3 className="mw-micro">{t("b.working")}</h3>
            <div className="mw-chiprow">{working.map(id => <span key={id} className="mw-tag"><span className="mw-avatar mw-avatar-xs">{cleanerName(id).slice(0, 2).toUpperCase()}</span>{cleanerName(id)} · {jobs.filter(j => j.cleanerIds.includes(id)).length}</span>)}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- C · Intent First ---------------- */
export function ModeC() {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const [text, setText] = useState("");
  const queue = attentionQueue(data, ui.range);
  const counts = dayCounts(data, ui.range);
  return (
    <div className="mw-intent">
      <h1 className="mw-intent-title">{t("c.ask")}</h1>
      <CommandBar value={text} onChange={setText} hideLabel />
      {text ? <CommandResults text={text} onCreate={() => { setText(""); setUi({ overlay: { type: "newService" } }); }} /> : (
        <>
          {queue[0] && <ResolvedJob job={queue[0].job} />}
          <details className="mw-picture">
            <summary><Icon name="chevronR" size={16} />{t("c.fullPicture")} · {t("now.headline", { needs: counts.needsYou, ok: counts.onTrack })}</summary>
            <QuestionStrip counts={counts} onPick={key => setText(questionIntent[key])} />
          </details>
        </>
      )}
    </div>
  );
}
