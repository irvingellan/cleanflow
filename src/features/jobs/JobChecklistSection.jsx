import { checklistFirstOpenHint } from "./checklistMessages.js";
import { JobDetailSection } from "./JobDetailSection.jsx";
import { OperationalIcon } from "../../components/OperationalIcon.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { ChecklistCapabilityControls } from "../checklists/ChecklistCapabilityControls.jsx";

/** The Checklist section of Job Detail: checklist run and link controls, completion controls and the legacy execution block. */
export function JobChecklistSection({
  job,
  translate,
  language,
  checklistSectionRef,
  isLoadingChecklistRun,
  checklistRun,
  onOpenChecklistRun,
  hasChecklistRunError,
  isCompleted,
  isCreatingChecklistRun,
  onCreateChecklistRun,
  onRefreshChecklistRun,
  hasCreateChecklistRunError,
  checklistCapability,
  isLoadingChecklistCapability,
  hasChecklistCapabilityError,
  isIssuingChecklistCapability,
  hasIssueChecklistCapabilityError,
  isRevokingChecklistCapability,
  hasRevokeChecklistCapabilityError,
  onRefreshChecklistCapability,
  onIssueChecklistCapability,
  onRevokeChecklistCapability,
  canUseCompletionControls,
  completionSectionRef,
  isCompletionConfirmationVisible,
  setIsCompletionConfirmationVisible,
  isCompletingCleaning,
  completeCleaning,
  hasCompleteCleaningError,
  isAssignmentAware,
  isInProgress,
  isStartingCleaning,
  startCleaning,
  hasStartCleaningError,
}) {
  const canOpenInHub = !job.archivedAt && job.propertyId && ["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus);
  return (
    <JobDetailSection jobId={job.id} title={translate("jobs.section.checklist")}>
    <section ref={checklistSectionRef} tabIndex={-1} className="job-checklist" aria-labelledby="job-checklist-title">
      <div className="issues-section__header">
        <h3 id="job-checklist-title">{translate("checklists.title")}</h3>
        {!isLoadingChecklistRun && checklistRun && (
          <button className="button" type="button" onClick={onOpenChecklistRun}>
            {translate(
              checklistRun.status === "DRAFT" ? "checklists.viewDraftProgress"
                : checklistRun.status === "ABANDONED" ? "checklists.viewAbandonedRun"
                  : "checklists.open",
            )}
          </button>
        )}
        {!isLoadingChecklistRun && !checklistRun && !hasChecklistRunError
          && !job.archivedAt && !isCompleted && (
          <button
            className="button"
            type="button"
            disabled={isCreatingChecklistRun}
            onClick={onCreateChecklistRun}
          >
            {isCreatingChecklistRun
              ? translate("checklists.creating")
              : translate("checklists.create")}
          </button>
        )}
      </div>
      {isLoadingChecklistRun && (
        <StateCard message={translate("checklists.loading")} status="status" />
      )}
      {!isLoadingChecklistRun && hasChecklistRunError && (
        <>
          <StateCard message={translate("checklists.loadError")} status="alert" isError />
          <button className="button" type="button" onClick={onRefreshChecklistRun}>
            {translate("common.retry")}
          </button>
        </>
      )}
      {!isLoadingChecklistRun && !hasChecklistRunError && !checklistRun && (
        <p className="job-checklist__summary">
          {canOpenInHub ? checklistFirstOpenHint[language] : translate("checklists.noRun")}
        </p>
      )}
      {!isLoadingChecklistRun && !hasChecklistRunError && checklistRun && (
        <p className="job-checklist__summary">{translate(
          checklistRun.status === "DRAFT" ? "checklists.existingDraft"
            : checklistRun.status === "READY_FOR_REVIEW" ? "checklists.existingRun"
              : checklistRun.status === "ABANDONED" ? "checklists.existingAbandoned"
                : "checklists.existingRunUnknown",
        )}</p>
      )}
      {hasCreateChecklistRunError && (
        <p className="form-error" role="alert">{translate("checklists.createError")}</p>
      )}
      <ChecklistCapabilityControls
        job={job}
        checklistRun={checklistRun}
        capability={checklistCapability}
        isLoading={isLoadingChecklistCapability}
        hasError={hasChecklistCapabilityError}
        isIssuing={isIssuingChecklistCapability}
        hasIssueError={hasIssueChecklistCapabilityError}
        isRevoking={isRevokingChecklistCapability}
        hasRevokeError={hasRevokeChecklistCapabilityError}
        onRefresh={onRefreshChecklistCapability}
        onIssue={onIssueChecklistCapability}
        onRevoke={onRevokeChecklistCapability}
      />
    </section>

    {canUseCompletionControls && (
      <section ref={completionSectionRef} tabIndex={-1} className="job-execution" aria-label={translate("jobs.completeService")}>
        {isLoadingChecklistRun && (
          <p className="form-hint">{translate("jobs.completionCheckingChecklist")}</p>
        )}
        {hasChecklistRunError && !isLoadingChecklistRun && (
          <p className="form-error" role="alert">{translate("jobs.completionChecklistUnavailable")}</p>
        )}
        {!isLoadingChecklistRun && !hasChecklistRunError && checklistRun && (
          <p className="form-hint">{translate(
            checklistRun.status === "DRAFT" ? "jobs.completionDraftOptions"
              : checklistRun.status === "READY_FOR_REVIEW" ? "jobs.completionRequiresChecklistReview"
                : "jobs.completionChecklistUnavailable",
          )}</p>
        )}
        {!isLoadingChecklistRun && !hasChecklistRunError && !checklistRun && (
          <>
            {!isCompletionConfirmationVisible ? (
              <button className="button button--primary" type="button"
                onClick={() => setIsCompletionConfirmationVisible(true)}>
                {translate("jobs.completeService")}
              </button>
            ) : (
              <div>
                <p>{translate("jobs.completeWithoutChecklistConfirm")}</p>
                <div className="button-row">
                  <button className="button" type="button" disabled={isCompletingCleaning}
                    onClick={() => setIsCompletionConfirmationVisible(false)}>
                    {translate("common.cancel")}
                  </button>
                  <button className="button button--primary" type="button"
                    disabled={isCompletingCleaning} onClick={completeCleaning}>
                    {isCompletingCleaning ? translate("jobs.completingCleaning")
                      : translate("jobs.completeService")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {hasCompleteCleaningError && (
          <p className="form-error" role="alert">{translate("jobs.completeCleaningError")}</p>
        )}
      </section>
    )}

    {!isAssignmentAware && (job.operationalStatus === "ASSIGNED" ||
      isInProgress ||
      isCompleted) && (
      <section
        className="job-execution"
        aria-label={translate("jobs.operationalStatus")}
      >
        {isInProgress && (
          <p className="job-execution__state job-execution__state--in-progress">
            <OperationalIcon name="clock" />
            {translate("jobs.executionInProgress")}
          </p>
        )}
        {isCompleted && (
          <p className="job-execution__state job-execution__state--completed">
            <OperationalIcon name="check-circle" />
            {translate("jobs.executionCompleted")}
          </p>
        )}
        {job.operationalStatus === "ASSIGNED" && (
          <div className="button-row job-execution__actions">
            <button
              className="button button--primary"
              type="button"
              disabled={isStartingCleaning}
              onClick={startCleaning}
            >
              {isStartingCleaning
                ? translate("jobs.startingCleaning")
                : translate("jobs.startCleaning")}
            </button>
          </div>
        )}
        {hasStartCleaningError && (
          <p className="form-error" role="alert">
            {translate("jobs.startCleaningError")}
          </p>
        )}
      </section>
    )}

    </JobDetailSection>
  );
}
