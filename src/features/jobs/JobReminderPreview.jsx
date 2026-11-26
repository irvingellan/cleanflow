import { cleanerReminderState } from "./cleanerReminderLog.js";
import { formatCreatedAt } from "../../lib/presentation.js";

/** The reminder preview of Job Detail's Cleaner section: the message for one cleaner, its options and the send actions. */
export function JobReminderPreview({
  job,
  translate,
  language,
  reminderPreview,
  reminderSectionRef,
  isCopyingReminder,
  setReminderPreview,
  sensitivePropertyDetails,
  reminderCleanerStillAssigned,
  setHasReminderChecklistError,
  checklistCapability,
  reminderChecklistCapabilityCurrent,
  canPrepareChecklistForReminder,
  isPreparingReminderChecklist,
  isIssuingChecklistCapability,
  isCreatingChecklistRun,
  prepareReminderChecklist,
  hasReminderChecklistError,
  cleanerLanguageLabelFor,
  reminderPreviewMessage,
  copyMessageErrorCleanerId,
  reminderWhatsAppUrl,
  reminderReadyToSend,
  copyReminderMessage,
  onMarkReminderSent,
  reminderLogState,
  setReminderLogState,
}) {
  return (
    <>
      {reminderPreview && (
        <section ref={reminderSectionRef} tabIndex={-1} className="job-reminder-preview" aria-labelledby="job-reminder-preview-title">
          <div className="job-reminder-preview__header">
            <h3 id="job-reminder-preview-title">
              {translate("jobs.reminderPreviewTitle", { cleaner: reminderPreview.cleanerName })}
            </h3>
            <button
              className="button"
              type="button"
              disabled={isCopyingReminder}
              onClick={() => setReminderPreview(null)}
            >
              {translate("common.cancel")}
            </button>
          </div>

          {sensitivePropertyDetails.length > 0 && (
            <div className="job-reminder-preview__sensitive">
              <strong>{translate("jobs.reminderSensitiveAccessTitle")}</strong>
              <p>{translate("jobs.reminderSensitiveAccessWarning")}</p>
              <ul>
                {sensitivePropertyDetails.map(([key, value]) => (
                  <li key={key}>{translate(key, { details: value.trim() })}</li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={reminderPreview.includeSensitiveAccess}
                  onChange={(event) => setReminderPreview((current) => ({
                    ...current,
                    includeSensitiveAccess: event.target.checked,
                  }))}
                />
                {translate("jobs.reminderIncludeSensitiveAccess")}
              </label>
            </div>
          )}

          {reminderCleanerStillAssigned && (
            <div className="job-reminder-preview__sensitive">
              <label>
                <input type="checkbox" checked={reminderPreview.includeChecklist}
                  onChange={(event) => {
                    setHasReminderChecklistError(false);
                    setReminderPreview((current) => ({
                      ...current, includeChecklist: event.target.checked,
                      checklistUrl: null, checklistIssuedAt: null,
                    }));
                  }} />
                {translate("jobs.reminderIncludeChecklist")}
              </label>
              {reminderPreview.includeChecklist && (
                <>
                  <p className="form-hint">{translate("jobs.reminderChecklistPreparationHint")}</p>
                  {checklistCapability?.state === "ACTIVE" && !reminderChecklistCapabilityCurrent && (
                    <p className="form-hint">{translate("jobs.reminderExistingChecklistLinkWarning")}</p>
                  )}
                  {canPrepareChecklistForReminder && !reminderChecklistCapabilityCurrent && (
                    <button className="button" type="button"
                      disabled={isPreparingReminderChecklist || isIssuingChecklistCapability || isCreatingChecklistRun}
                      onClick={prepareReminderChecklist}>
                      {isPreparingReminderChecklist ? translate("jobs.reminderPreparingChecklist")
                        : translate("jobs.reminderPrepareChecklist")}
                    </button>
                  )}
                  {!canPrepareChecklistForReminder && (
                    <p className="form-error" role="alert">{translate("jobs.reminderChecklistUnavailable")}</p>
                  )}
                  {reminderChecklistCapabilityCurrent && (
                    <p className="form-success" role="status">
                      {translate("jobs.reminderChecklistReady")}
                      {reminderPreview.checklistRefresh && (
                        <> {translate(`checklists.linkSnapshot.${reminderPreview.checklistRefresh}`)}</>
                      )}
                    </p>
                  )}
                  {hasReminderChecklistError && (
                    <p className="form-error" role="alert">{translate("jobs.reminderChecklistError")}</p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="job-reminder-preview__message">
            <strong>{translate("jobs.reminderPreviewMessage")}</strong>
            <p className="form-hint">
              {translate("jobs.messageForCleanerLanguage", {
                cleaner: reminderPreview.cleanerName,
                language: cleanerLanguageLabelFor(reminderPreview.cleanerId),
              })}
            </p>
            <pre>{reminderPreviewMessage}</pre>
          </div>
          <p className="form-hint">{translate("whatsapp.manualSendNote")}</p>

          {!reminderCleanerStillAssigned && (
            <p className="form-error" role="alert">
              {translate("jobs.reminderCleanerNoLongerAssigned")}
            </p>
          )}
          {copyMessageErrorCleanerId === reminderPreview.cleanerId && (
            <p className="form-error" role="alert">{translate("jobs.copyMessageError")}</p>
          )}

          <div className="job-reminder-preview__actions">
            {reminderWhatsAppUrl && reminderReadyToSend && (
              <a
                className="button button--primary"
                href={reminderWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {translate("whatsapp.openInWhatsApp")}
              </a>
            )}
            <button
              className="button"
              type="button"
              disabled={!reminderReadyToSend || isCopyingReminder}
              onClick={copyReminderMessage}
            >
              {isCopyingReminder
                ? translate("jobs.reminderCopying")
                : translate("jobs.reminderCopyNow")}
            </button>
          </div>
          {onMarkReminderSent && reminderCleanerStillAssigned && reminderPreview.cleanerId !== "legacy-assigned-cleaner" && (() => {
            const logged = cleanerReminderState(job, reminderPreview.cleanerId);
            const sentAt = logged.state === "sent" ? formatCreatedAt(logged.sentAt, language) : null;
            return <div className="job-reminder-preview__log" data-testid="reminder-log">
              <p className={logged.state === "sent" ? "form-success" : "form-hint"} role="status">
                {logged.state === "sent"
                  ? translate(sentAt ? "jobs.reminderLoggedAt" : "jobs.reminderLogged", { time: sentAt })
                  : translate(logged.stale ? "jobs.reminderStale" : "jobs.reminderNotLogged")}
              </p>
              <button className="button" type="button" disabled={reminderLogState === "saving"} onClick={async () => {
                setReminderLogState("saving");
                try { await onMarkReminderSent(reminderPreview.cleanerId); setReminderLogState(null); }
                catch { setReminderLogState("error"); }
              }}>
                {translate(reminderLogState === "saving" ? "jobs.reminderLogging"
                  : logged.state === "sent" ? "jobs.reminderLogAgain" : "jobs.reminderMarkSent")}
              </button>
              {reminderLogState === "error" && <p className="form-error" role="alert">{translate("jobs.reminderLogError")}</p>}
            </div>;
          })()}
          {reminderReadyToSend && !reminderWhatsAppUrl && (
            <p className="form-hint">{translate("whatsapp.phoneNeeded")}</p>
          )}
        </section>
      )}
    </>
  );
}
