import { JobDetailSection } from "./JobDetailSection.jsx";
import { JobServiceTypeSelect } from "./JobServiceTypeSelect.jsx";
import { serviceTypeMessage } from "./serviceTypeMessages.js";
import { currentScheduleConfirmations, currentScheduleRevision } from "./scheduleConfirmation.js";
import { requiredCleanerCount } from "./offerSlots.js";
import { resolveJobPricing } from "../pricing/pricingModel.js";
import { formatPricingRate } from "../pricing/pricingMessages.js";
import { jobPricesLocked } from "./jobPricingForm.js";
import { canEditJobDetails, maximumGuestNameLength } from "./jobCompatibility.js";

/** The Details section of Job Detail: the schedule edit form, the details edit form (guest name and notes) and the notes. */
export function JobDetailsSection({
  job,
  property,
  translate,
  language,
  scheduleSectionRef,
  hasSavedJobSchedule,
  isEditingJobSchedule,
  scheduleCommunicationMayBeStale,
  needsScheduleReload,
  scheduleMessage,
  saveJobSchedule,
  jobScheduleValues,
  setJobScheduleValues,
  jobScheduleSaveError,
  isSavingJobSchedule,
  setIsEditingJobSchedule,
  setJobScheduleSaveError,
  scheduleRevisionConflict,
  startJobScheduleEdit,
  isEditingJobDetails,
  startJobDetailsEdit,
  hasSavedJobDetails,
  saveJobDetails,
  jobDetailValues,
  isSavingJobDetails,
  setJobDetailValues,
  jobDetailsSaveError,
  setIsEditingJobDetails,
  setJobDetailsSaveError,
  jobDetailFormValues,
}) {
  const typeChanged = jobDetailValues.serviceType !== jobDetailValues.initialServiceType;
  const nextRates = typeChanged && property
    ? resolveJobPricing({ serviceType: jobDetailValues.serviceType }, { property, cleanerCount: requiredCleanerCount(job) })
    : null;
  const recordedRates = resolveJobPricing(job);
  const checkPrices = !nextRates || nextRates.client.state !== "ready" || nextRates.cleaner.state !== "ready";
  return (
    <JobDetailSection jobId={job.id} title={translate("jobs.section.details")}>
    <section ref={scheduleSectionRef} tabIndex={-1} className="job-details-edit" aria-label={translate("jobs.editSchedule")}>
      {hasSavedJobSchedule && !isEditingJobSchedule && (
        <p className="form-success" role="status">{translate("jobs.scheduleSaved")}</p>
      )}
      {hasSavedJobSchedule && scheduleCommunicationMayBeStale && !isEditingJobSchedule && (
        <p className="form-hint">{translate("jobs.scheduleExternalMessageWarning")}</p>
      )}
      {needsScheduleReload && currentScheduleConfirmations(job).length === 0 && !isEditingJobSchedule && (
        <p className="form-hint" role="status">{scheduleMessage("readbackError")}</p>
      )}
      {isEditingJobSchedule && (
        <form className="cleaning-form" noValidate onSubmit={saveJobSchedule}>
          <p className="form-hint">{translate("jobs.scheduleExternalMessageWarning")}</p>
          <label>
            {translate("jobs.scheduledDate")}
            <input
              required
              type="date"
              name="scheduledDate"
              value={jobScheduleValues.scheduledDate}
              onChange={(event) => setJobScheduleValues((current) => ({
                ...current,
                scheduledDate: event.target.value,
              }))}
            />
          </label>
          <label>
            {translate("jobs.scheduledTime")}
            <input
              type="time"
              name="scheduledStart"
              value={jobScheduleValues.scheduledStart}
              onChange={(event) => setJobScheduleValues((current) => ({
                ...current,
                scheduledStart: event.target.value,
              }))}
            />
          </label>
          {jobScheduleSaveError && <p className="form-error" role="alert">{jobScheduleSaveError}</p>}
          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={isSavingJobSchedule}
              onClick={() => {
                setIsEditingJobSchedule(false);
                setJobScheduleSaveError("");
                setJobScheduleValues({
                  scheduledDate: job.scheduledDate || "",
                  scheduledStart: job.scheduledStart || "",
                  expectedScheduleRevision: currentScheduleRevision(job),
                });
              }}
            >
              {translate("common.cancel")}
            </button>
            {scheduleRevisionConflict
              ? <button className="button" type="button" onClick={startJobScheduleEdit}>{scheduleMessage("reviewCurrent")}</button>
              : <button className="button button--primary" type="submit" disabled={isSavingJobSchedule}>
                {isSavingJobSchedule ? translate("jobs.savingSchedule") : translate("jobs.saveSchedule")}
              </button>}
          </div>
        </form>
      )}
    </section>


    <section className="job-details-edit" aria-label={serviceTypeMessage(language, "editDetails")}>
      {!isEditingJobDetails && (
        <>
          <button
            className="button"
            type="button"
            disabled={!canEditJobDetails(job)}
            onClick={startJobDetailsEdit}
          >
            {serviceTypeMessage(language, "editDetails")}
          </button>
          {!canEditJobDetails(job) && (
            <p className="form-hint">{translate("jobs.detailsReadOnlyHistorical")}</p>
          )}
        </>
      )}
      {hasSavedJobDetails && !isEditingJobDetails && (
        <p className="form-success" role="status">{serviceTypeMessage(language, "detailsSaved")}</p>
      )}
      {isEditingJobDetails && (
        <form className="cleaning-form" noValidate onSubmit={saveJobDetails}>
          <JobServiceTypeSelect value={jobDetailValues.serviceType} disabled={isSavingJobDetails || jobPricesLocked(job)}
            onChange={(event) => setJobDetailValues((current) => ({ ...current, serviceType: event.target.value }))} />
          {jobPricesLocked(job) && <p className="form-hint">{serviceTypeMessage(language, "paidPrices")}</p>}
          {typeChanged && !jobPricesLocked(job) && (
            <div className="form-hint" role="status">
              <p>{serviceTypeMessage(language, checkPrices ? "keepJobPrices" : "typePriceChange")}</p>
              {nextRates && <>
                <p>{translate("jobs.clientPrice")} · {formatPricingRate(nextRates.client.state === "ready" ? nextRates.client : recordedRates.client, language, translate)}</p>
                <p>{translate("jobs.cleanerPayout")} · {formatPricingRate(nextRates.cleaner.state === "ready" ? nextRates.cleaner : recordedRates.cleaner, language, translate)}</p>
              </>}
            </div>
          )}
          <label>
            {translate("jobs.guestName")}
            <input
              type="text"
              name="guestName"
              maxLength={maximumGuestNameLength}
              value={jobDetailValues.guestName}
              onChange={(event) => setJobDetailValues((current) => ({
                ...current,
                guestName: event.target.value,
              }))}
            />
          </label>
          <label>
            {translate("common.notes")}
            <textarea
              name="notes"
              rows="4"
              value={jobDetailValues.notes}
              onChange={(event) => setJobDetailValues((current) => ({
                ...current,
                notes: event.target.value,
              }))}
            />
          </label>
          <small className="form-hint">{translate("jobs.cleanerNotesHint")}</small>
          {jobDetailsSaveError && <p className="form-error" role="alert">{jobDetailsSaveError}</p>}
          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={isSavingJobDetails}
              onClick={() => {
                setIsEditingJobDetails(false);
                setJobDetailsSaveError("");
                setJobDetailValues(jobDetailFormValues(job));
              }}
            >
              {translate("common.cancel")}
            </button>
            <button className="button button--primary" type="submit" disabled={isSavingJobDetails}>
              {isSavingJobDetails ? translate("jobs.savingDetails") : translate("jobs.saveDetails")}
            </button>
          </div>
        </form>
      )}
    </section>

    {job.notes && (
      <section className="notes-section" aria-label={translate("common.notes")}>
        <h3>{translate("common.notes")}</h3>
        <p>{job.notes}</p>
      </section>
    )}

    </JobDetailSection>
  );
}
