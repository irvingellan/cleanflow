import { WorkedTimeForm } from "./WorkedTimeForm.jsx";
import { workedTimeMessages } from "./workedTimeMessages.js";
import { approveWorkedTime } from "./workedTimeService.js";

export function JobWorkedTime({ job, assignments, roster, offers, names, language, checklistStatus, loading, failed }) {
  const t = workedTimeMessages(language);
  const hourlyClient = job.billing?.mode === "HOURLY";
  const hourlyAssignments = assignments.filter(assignment => {
    if (!roster.includes(assignment.cleanerId)) return false;
    const offer = assignment.sourceOfferId && offers?.find(item =>
      item.id === assignment.sourceOfferId && item.cleanerId === assignment.cleanerId);
    const pay = offer || assignment.paySnapshot;
    return hourlyClient || pay?.offeredPay?.mode === "HOURLY" || (!pay && job.pay?.mode === "HOURLY")
      || Boolean(assignment.reportedWork || assignment.approvedWork);
  });
  if (!hourlyClient && job.pay?.mode !== "HOURLY" && !hourlyAssignments.length) return null;
  const canApprove = ["IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus)
    || (job.operationalStatus === "ASSIGNED" && ["READY_FOR_REVIEW", "APPROVED", "LOCKED", "FINALIZED"].includes(checklistStatus));
  return <section className="job-detail__section">
    <h3>{t.review}</h3>
    {loading ? <p role="status">{t.loading}</p> : failed ? <p role="alert">{t.unavailable}</p>
      : hourlyAssignments.length === 0 ? <p>{t.empty}</p>
      : hourlyAssignments.map(assignment => <div key={assignment.id}>
        <h4>{names[roster.indexOf(assignment.cleanerId)]}</h4>
        <WorkedTimeForm manager language={language} allowSave={canApprove && !job.archivedAt}
          paid={Boolean(job.payoutId || job.payoutIdsByCleaner?.[assignment.cleanerId])}
          touchUp={job.serviceType === "AIRBNB_TOUCH_UP"}
          work={{ reportedMinutes: assignment.reportedWork?.minutes, approvedMinutes: assignment.approvedWork?.minutes,
            payoutCents: assignment.payoutCents }}
          onSave={minutes => approveWorkedTime(job.id, assignment.id, minutes)} />
      </div>)}
  </section>;
}
