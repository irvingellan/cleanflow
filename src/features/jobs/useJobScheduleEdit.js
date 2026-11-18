import { useEffect, useState } from "react";
import { currentScheduleRevision } from "./scheduleConfirmation.js";

/**
 * State of the schedule edit form in Job Detail's Details section. Resets when another Job is shown, and then
 * also clears the intent notice. `currentJobIdRef` holds the ID of the Job on screen, so that a save that
 * finishes after the manager moved to another Job changes nothing.
 */
export function useJobScheduleEdit({
  job, translate, onUpdateSchedule, canReschedule, scheduleMessage, currentJobIdRef, setIntentNotice,
}) {
  const [isEditingJobSchedule, setIsEditingJobSchedule] = useState(false);
  const [jobScheduleValues, setJobScheduleValues] = useState(() => ({
    scheduledDate: job.scheduledDate || "",
    scheduledStart: job.scheduledStart || "",
    expectedScheduleRevision: currentScheduleRevision(job),
  }));
  const [isSavingJobSchedule, setIsSavingJobSchedule] = useState(false);
  const [jobScheduleSaveError, setJobScheduleSaveError] = useState("");
  const [hasSavedJobSchedule, setHasSavedJobSchedule] = useState(false);
  const [scheduleCommunicationMayBeStale, setScheduleCommunicationMayBeStale] = useState(false);
  const [needsScheduleReload, setNeedsScheduleReload] = useState(false);
  const [scheduleRevisionConflict, setScheduleRevisionConflict] = useState(false);

  useEffect(() => {
    setJobScheduleValues({
      scheduledDate: job.scheduledDate || "",
      scheduledStart: job.scheduledStart || "",
      expectedScheduleRevision: currentScheduleRevision(job),
    });
    setIsEditingJobSchedule(false);
    setIsSavingJobSchedule(false);
    setJobScheduleSaveError("");
    setHasSavedJobSchedule(false);
    setScheduleCommunicationMayBeStale(false);
    setNeedsScheduleReload(false);
    setScheduleRevisionConflict(false);
    setIntentNotice(null);
  }, [job.id]);

  function startJobScheduleEdit() {
    if (!canReschedule) return;
    setJobScheduleValues({
      scheduledDate: job.scheduledDate || "",
      scheduledStart: job.scheduledStart || "",
      expectedScheduleRevision: currentScheduleRevision(job),
    });
    setJobScheduleSaveError("");
    setHasSavedJobSchedule(false);
    setScheduleCommunicationMayBeStale(false);
    setNeedsScheduleReload(false);
    setScheduleRevisionConflict(false);
    setIsEditingJobSchedule(true);
  }

  async function saveJobSchedule(event) {
    event.preventDefault();
    if (scheduleRevisionConflict || isSavingJobSchedule) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jobScheduleValues.scheduledDate)) {
      setJobScheduleSaveError(translate("jobs.scheduleInvalidDate"));
      return;
    }
    const [year, month, day] = jobScheduleValues.scheduledDate.split("-").map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysByMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysByMonth[month - 1]) {
      setJobScheduleSaveError(translate("jobs.scheduleInvalidDate"));
      return;
    }
    if (jobScheduleValues.scheduledStart
      && !/^([01]\d|2[0-3]):[0-5]\d$/.test(jobScheduleValues.scheduledStart)) {
      setJobScheduleSaveError(translate("jobs.scheduleInvalidTime"));
      return;
    }

    setIsSavingJobSchedule(true);
    setJobScheduleSaveError("");
    setHasSavedJobSchedule(false);
    const jobId = job.id;
    try {
      const result = await onUpdateSchedule(jobScheduleValues);
      if (currentJobIdRef.current !== jobId) return;
      setJobScheduleValues({
        scheduledDate: result?.job?.scheduledDate || jobScheduleValues.scheduledDate,
        scheduledStart: result?.job?.scheduledStart || "",
        expectedScheduleRevision: currentScheduleRevision(result?.job || job),
      });
      setNeedsScheduleReload(result?.needsScheduleReload === true);
      setScheduleCommunicationMayBeStale(result?.changed === true);
      setIsEditingJobSchedule(false);
      setHasSavedJobSchedule(true);
    } catch (error) {
      if (currentJobIdRef.current !== jobId) return;
      const reason = error?.details?.reason;
      setScheduleRevisionConflict(reason === "stale-schedule");
      setJobScheduleSaveError(reason === "stale-schedule"
        ? scheduleMessage("stale")
        : reason === "checklist-run-exists"
        ? translate("jobs.scheduleLockedByChecklist")
        : reason === "status" || reason === "archived"
          ? translate("jobs.scheduleReadOnlyState")
          : reason === "invalid-date"
            ? translate("jobs.scheduleInvalidDate")
            : reason === "invalid-time"
              ? translate("jobs.scheduleInvalidTime")
              : translate("jobs.scheduleUpdateError"));
    } finally {
      if (currentJobIdRef.current === jobId) setIsSavingJobSchedule(false);
    }
  }

  return {
    isEditingJobSchedule, setIsEditingJobSchedule, jobScheduleValues, setJobScheduleValues, isSavingJobSchedule,
    jobScheduleSaveError, setJobScheduleSaveError, hasSavedJobSchedule, scheduleCommunicationMayBeStale, needsScheduleReload,
    scheduleRevisionConflict, startJobScheduleEdit, saveJobSchedule,
  };
}
