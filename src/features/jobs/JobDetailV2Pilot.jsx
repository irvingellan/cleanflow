import { useEffect, useState } from "react";
import { JobDetail } from "./JobDetail.jsx";
import { Panel, SegmentedControl, StateLabel } from "../../components/v2/primitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { formatOperationalStatus } from "../../lib/presentation.js";
import "./jobDetailV2.css";

// Imported only by the Sandbox build or the credential-free local harness.
// This wrapper owns presentation preference, not permission or domain state.
export function JobDetailV2Pilot(props) {
  const { translate } = useTranslation();
  const [presentation, setPresentation] = useState(() => new URLSearchParams(window.location.search).get("jobDetail") === "v2" ? "v2" : "current");
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1100px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const change = () => setDesktop(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  function compare(value) {
    setPresentation(value);
    const url = new URL(window.location.href);
    if (value === "v2") url.searchParams.set("jobDetail", "v2");
    else url.searchParams.delete("jobDetail");
    window.history.replaceState(window.history.state, "", url);
  }
  const v2 = presentation === "v2" && desktop;
  const status = formatOperationalStatus(props.job.operationalStatus, translate);
  const tone = props.job.archivedAt ? "neutral" : ({ UNASSIGNED: "warning", OFFERED: "info", ASSIGNED: "brand", IN_PROGRESS: "info", COMPLETED: "success" }[props.job.operationalStatus] || "neutral");
  return <div className={v2 ? "job-v2-pilot job-v2-pilot--wide" : "job-v2-pilot"}>
    <div className="job-v2-comparison">
      <SegmentedControl label={translate("jobV2.comparison")} value={presentation} onChange={compare}
        options={[{ value: "current", label: translate("jobV2.current") }, { value: "v2", label: "V2" }]} />
      {!desktop && presentation === "v2" && <span>{translate("jobV2.desktopOnly")}</span>}
    </div>
    <JobDetail {...props} renderPresentation={v2 ? ({ identity, summary, intents, details, scrollToTop }) => <section className="job-detail-v2" aria-labelledby="job-detail-title">
      <header className="job-v2-identity"><StateLabel tone={tone} icon={props.job.operationalStatus === "COMPLETED" ? "check" : "info"}>{status}</StateLabel>{identity}</header>
      <div className="job-v2-columns">
        <div className="job-v2-main">{summary}<div className="job-v2-groups">{details}</div></div>
        <aside className="job-v2-decision" aria-label={translate("jobV2.decision")}>
          <Panel><p className="job-v2-situation">{status}</p>{intents}</Panel>
        </aside>
      </div>{scrollToTop}
    </section> : undefined} />
  </div>;
}
