import { useState } from "react";
import { WorkedTimeForm } from "./WorkedTimeForm.jsx";
import { workedTimeMessages } from "./workedTimeMessages.js";
import { approveWorkedTime, refreshApprovedClientHours, removeWorkedTimeApproval } from "./workedTimeService.js";

export function JobWorkedTime({ job, assignments, roster, offers, names, language, checklistStatus, loading, failed, onRefresh }) {
  const t = workedTimeMessages(language);
  const [clientHours, setClientHours] = useState("idle");
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
  const active = roster.map(id => assignments.find(item => item.cleanerId === id));
  const needsClientHours = hourlyClient && !job.billing?.hours && !job.archivedAt && roster.length > 0
    && active.every(item => Number.isInteger(item?.approvedWork?.minutes));
  const updateClientHours = async () => {
    setClientHours("saving");
    try {
      await refreshApprovedClientHours(job.id, active[0].id);
      await onRefresh?.();
      setClientHours("idle");
    } catch { setClientHours("failed"); }
  };
  return <section className="job-detail__section">
    <h3>{t.review}</h3>
    {!loading && !failed && needsClientHours && <p>
      <button className="button button--small" type="button" disabled={clientHours === "saving"} onClick={updateClientHours}>
        {clientHours === "saving" ? t.saving : t.refreshClientHours}
      </button>
      {clientHours === "failed" && <span role="alert"> {t.failed}</span>}
    </p>}
    {loading ? <p role="status">{t.loading}</p> : failed ? <p role="alert">{t.unavailable}</p>
      : hourlyAssignments.length === 0 ? <p>{t.empty}</p>
      : hourlyAssignments.map(assignment => <div key={assignment.id}>
        <h4>{names[roster.indexOf(assignment.cleanerId)]}</h4>
        {(assignment.paySnapshot?.offeredPay || offers?.find(offer => offer.id === assignment.sourceOfferId)?.offeredPay)
          && <p className="form-hint">{t.agreedRate}</p>}
        <WorkedTimeForm key={`${assignment.approvedWork?.minutes ?? ""}:${assignment.payoutCents ?? ""}`}
          manager language={language} allowSave={canApprove && !job.archivedAt}
          paid={Boolean(job.payoutId || job.payoutPaidAt || job.payoutIdsByCleaner?.[assignment.cleanerId])}
          touchUp={job.serviceType === "AIRBNB_TOUCH_UP"}
          work={{ reportedMinutes: assignment.reportedWork?.minutes, approvedMinutes: assignment.approvedWork?.minutes,
            payoutCents: assignment.payoutCents }}
          onSave={async minutes => {
            const result = await approveWorkedTime(job.id, assignment.id, minutes);
            await onRefresh?.();
            return result;
          }}
          onRemoveApproval={assignment.approvedWork && !job.archivedAt ? async () => {
            await removeWorkedTimeApproval(job.id, assignment.id);
            await onRefresh?.();
          } : undefined} />
      </div>)}
  </section>;
}
