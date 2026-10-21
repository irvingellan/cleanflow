import { EmptyState } from "../../../components/v2/primitives.jsx";
import { EmptyDetail, JobDetail, NextStep } from "../flows/JobPanel.jsx";
import { FILTERS, filteredJobs, groupByDay, jobsInRange } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { inRange } from "../model/time.js";
import { Icon } from "../ui/Icon.jsx";
import { JobRow, dayWord, useT, useViewport } from "../ui/kit.jsx";

export const FILTER_ORDER = ["needsYou", "all", "noCleaner", "responses", "notConfirmed", "review", "inProgress", "completed"];

export function FilterBar() {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const base = jobsInRange(data, ui.range);
  return (
    <div className="mw-filterbar">
      <div className="mw-chiprow mw-chiprow-scroll" role="group" aria-label={t("f.label")}>
        {FILTER_ORDER.map(f => {
          const count = base.filter(j => FILTERS[f](data, j)).length;
          return (
            <button key={f} type="button" className={`mw-chip${f === "needsYou" && count ? " is-attention" : ""}`} aria-pressed={ui.filter === f} onClick={() => setUi({ filter: f })}>
              {t(`f.${f}`)}<span className="mw-chip-count">{count}</span>
            </button>
          );
        })}
      </div>
      <label className="mw-search">
        <Icon name="search" size={16} />
        <input type="search" value={ui.search} placeholder={t("app.search")} aria-label={t("app.search")} onChange={e => setUi({ search: e.target.value })} />
      </label>
    </div>
  );
}

export function JobList({ }) {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const jobs = filteredJobs(data, ui.range, ui.filter, ui.search);
  const groups = groupByDay(jobs);
  if (!jobs.length) {
    return <EmptyState icon="search" title={t("j.emptyRange")} action={ui.filter !== "all" ? <button type="button" className="cfv2-button cfv2-button-secondary mw-btn" onClick={() => setUi({ filter: "all", search: "" })}>{t("j.clearFilter")}</button> : null} />;
  }
  return (
    <div className="mw-joblist">
      {groups.map(group => (
        <section key={group.date} aria-label={t.day(group.date, "long")}>
          <h3 className="mw-dayhead"><span>{dayWord(t, data, group.date)}</span><span className="mw-sec">{t.day(group.date, "long")} · {t("b.jobs", { count: group.jobs.length })}</span></h3>
          {group.jobs.map(job => <JobRow key={job.id} job={job} selected={ui.selectedJobId === job.id} onSelect={j => setUi({ selectedJobId: j.id })} />)}
        </section>
      ))}
    </div>
  );
}

/** List + detail + next action. Layout A, and the Hybrid "Operations" screen. */
export function Worklist({ heading }) {
  const { data, ui } = useStore();
  const vp = useViewport();
  const job = data.jobs.find(j => j.id === ui.selectedJobId);
  const outOfRange = job && !inRange(job.date, ui.range);
  if (vp.compact) {
    return <div className="mw-worklist is-compact">{heading}<FilterBar /><JobList /></div>;
  }
  const threeCol = vp.xwide;
  return (
    <div className={`mw-worklist${threeCol ? " is-three" : ""}`}>
      <div className="mw-worklist-list">{heading}<FilterBar /><JobList /></div>
      <div className="mw-worklist-detail">{job ? <JobDetail job={job} withNextStep={!threeCol} outOfRange={outOfRange} /> : <EmptyDetail />}</div>
      {threeCol && <aside className="mw-worklist-actions" aria-label="next">{job ? <NextStep job={job} /> : null}</aside>}
    </div>
  );
}
