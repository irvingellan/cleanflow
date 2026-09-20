import { useEffect, useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { getAssignedCleanerIds } from "../jobs/jobCompatibility.js";

export function ChecklistCapabilityControls({
  job,
  checklistRun,
  capability,
  isLoading,
  hasError,
  isIssuing,
  hasIssueError,
  isRevoking,
  hasRevokeError,
  onRefresh,
  onIssue,
  onRevoke,
}) {
  const { translate } = useTranslation();
  const cleanerIds = getAssignedCleanerIds(job).length
    ? getAssignedCleanerIds(job)
    : (typeof job.assignedCleanerId === "string" && job.assignedCleanerId ? [job.assignedCleanerId] : []);
  const [cleanerId, setCleanerId] = useState(cleanerIds[0] || "");
  const [newLink, setNewLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!cleanerIds.includes(cleanerId)) setCleanerId(cleanerIds[0] || "");
  }, [cleanerIds.join(",")]);

  if (!checklistRun || checklistRun.status !== "DRAFT") return null;

  const active = capability?.state === "ACTIVE";
  const canIssue = ["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus) && cleanerIds.length > 0;

  async function createOrReplace() {
    try {
      const url = await onIssue(cleanerId);
      setNewLink(url || "");
      setCopied(false);
    } catch { /* controller exposes a localized error state */ }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(newLink);
      setCopied(true);
    } catch { setCopied(false); }
  }

  return (
    <section className="job-checklist__capability" aria-labelledby="checklist-capability-title">
      <h4 id="checklist-capability-title">{translate("checklists.cleanerLink")}</h4>
      {isLoading && <StateCard message={translate("checklists.linkLoading")} status="status" />}
      {!isLoading && hasError && (
        <><StateCard message={translate("checklists.linkLoadError")} status="alert" isError />
          <button className="button" type="button" onClick={onRefresh}>{translate("common.retry")}</button></>
      )}
      {!isLoading && !hasError && (
        <>
          <p className="job-checklist__summary">
            {translate(`checklists.linkState${capability?.state || "NONE"}`)}
          </p>
          {!canIssue && <p className="job-checklist__summary">{translate("checklists.linkNeedsAssignedCleaner")}</p>}
          {canIssue && (
            <div className="button-row">
              {cleanerIds.length > 1 && (
                <label>
                  {translate("checklists.linkCleaner")}
                  <select value={cleanerId} onChange={(event) => setCleanerId(event.target.value)}>
                    {cleanerIds.map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                </label>
              )}
              <button className="button button--primary" type="button" disabled={isIssuing || isRevoking} onClick={createOrReplace}>
                {isIssuing ? translate("checklists.linkCreating") : translate(active ? "checklists.replaceLink" : "checklists.createLink")}
              </button>
              {active && <button className="button" type="button" disabled={isIssuing || isRevoking} onClick={onRevoke}>
                {isRevoking ? translate("checklists.linkRevoking") : translate("checklists.revokeLink")}
              </button>}
            </div>
          )}
          {newLink && <div className="button-row"><button className="button" type="button" onClick={copyLink}>{copied ? translate("checklists.linkCopied") : translate("checklists.copyLink")}</button></div>}
          {hasIssueError && <p className="form-error" role="alert">{translate("checklists.linkCreateError")}</p>}
          {hasRevokeError && <p className="form-error" role="alert">{translate("checklists.linkRevokeError")}</p>}
        </>
      )}
    </section>
  );
}
