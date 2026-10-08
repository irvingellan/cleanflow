import { useEffect, useRef, useState } from "react";
import { JobDetail } from "./JobDetail.jsx";
import { Panel, SegmentedControl, StateLabel, StickyMobileAction } from "../../components/v2/primitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { formatOperationalStatus } from "../../lib/presentation.js";
import "./jobDetailV2.css";
import { jobDisclosureSummaries } from "./jobDisclosureSummaries.js";
import { JobConfirmationV2, JobConsequencesV2 } from "./JobConfirmationV2.jsx";

// Imported only by the Sandbox build or the credential-free local harness.
// This wrapper owns presentation preference, not permission or domain state.
export function JobDetailV2Pilot(props) {
  const { translate, language } = useTranslation();
  const [localPresentation, setPresentation] = useState(() => new URLSearchParams(window.location.search).get("jobDetail") === "v2" ? "v2" : "current");
  const presentation = props.presentation ?? localPresentation;
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1100px)").matches);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 719px)").matches);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const pendingResolver = useRef(null);
  function settleConfirmation(confirmed) {
    pendingResolver.current?.(confirmed);
    pendingResolver.current = null;
    setPendingConfirmation(null);
  }
  useEffect(() => {
    setPendingConfirmation(null);
    return () => { pendingResolver.current?.(false); pendingResolver.current = null; };
  }, [props.job.id, presentation]);
  function requestConfirmation(contract) {
    pendingResolver.current?.(false);
    return new Promise(resolve => {
      pendingResolver.current = resolve;
      setPendingConfirmation(contract);
    });
  }
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const change = () => setDesktop(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 719px)");
    const change = () => setCompact(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    // Focus is a conservative keyboard signal, including Safari versions where
    // visualViewport resize is delayed. No data or device identification.
    const check = () => setKeyboardOpen(Boolean(document.activeElement?.matches(
      "input:not([type=radio]):not([type=checkbox]), textarea, select, [contenteditable=true]",
    )));
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    window.visualViewport?.addEventListener("resize", check);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
      window.visualViewport?.removeEventListener("resize", check);
    };
  }, []);
  function compare(value) {
    setPresentation(value);
    const url = new URL(window.location.href);
    if (value === "v2") url.searchParams.set("jobDetail", "v2");
    else url.searchParams.delete("jobDetail");
    window.history.replaceState(window.history.state, "", url);
  }
  const v2 = presentation === "v2";
  const status = formatOperationalStatus(props.job.operationalStatus, translate);
  const tone = props.job.archivedAt ? "neutral" : ({ UNASSIGNED: "warning", OFFERED: "info", ASSIGNED: "brand", IN_PROGRESS: "info", COMPLETED: "success" }[props.job.operationalStatus] || "neutral");
  return <div className={v2 ? "job-v2-pilot job-v2-pilot--wide" : "job-v2-pilot"}>
    {!props.hideComparison && <div className="job-v2-comparison">
      <SegmentedControl label={translate("jobV2.comparison")} value={presentation} onChange={compare}
        options={[{ value: "current", label: translate("jobV2.current") }, { value: "v2", label: "V2" }]} />
    </div>}
    <JobDetail {...props}
      compactLifecycle={v2 && compact}
      requestConfirmation={v2 ? requestConfirmation : undefined}
      renderConfirmation={v2 ? contract => <JobConfirmationV2 job={props.job} {...contract} /> : undefined}
      renderConsequences={v2 ? kind => <JobConsequencesV2 kind={kind} /> : undefined}
      renderIntentNext={v2 && compact ? (next, { operationOpen }) => <StickyMobileAction keyboardOpen={keyboardOpen || operationOpen}>{next}</StickyMobileAction> : undefined}
      disclosureSummaries={v2 ? jobDisclosureSummaries(props, translate, language) : undefined} renderPresentation={v2 ? ({ identity, summary, summaryParts, intents, details, scrollToTop }) => {
      const decision = <aside className="job-v2-decision" aria-label={translate("jobV2.decision")}>
        <Panel><p className="job-v2-situation">{status}</p>{intents}</Panel>
      </aside>;
      const groups = <div className="job-v2-groups">{details}</div>;
      return <section className={`job-detail-v2${!desktop ? " job-detail-v2--stacked" : ""}`} aria-labelledby="job-detail-title">
      <header className="job-v2-identity"><StateLabel tone={tone} icon={props.job.operationalStatus === "COMPLETED" ? "check" : "info"}>{status}</StateLabel>{identity}</header>
      <div className="job-v2-columns">
        {desktop ? <><div className="job-v2-main">{summary}{groups}</div>{decision}</> : <>
          <div className="job-v2-mobile-summary">{summaryParts.cleaner}{summaryParts.lifecycle}{summaryParts.checklist}{summaryParts.attention}</div>
          {decision}{groups}
        </>}
      </div>{scrollToTop}
    </section>;
    } : undefined} />
    {v2 && pendingConfirmation && <JobConfirmationV2 job={props.job} {...pendingConfirmation}
      title={translate("jobV2.replaceChecklist")}
      confirmLabel={translate("jobs.reminderPrepareChecklist")}
      cancelLabel={translate("common.cancel")}
      onCancel={() => settleConfirmation(false)} onConfirm={() => settleConfirmation(true)} />}
  </div>;
}
