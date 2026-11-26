import { useEffect, useState } from "react";
import { normalizeServiceType } from "../../../functions/src/serviceTypes.js";
import { isServiceTime } from "../../lib/presentation.js";
import { serviceTypeMessage } from "./serviceTypeMessages.js";
import { canEditJobDetails, maximumGuestNameLength } from "./jobCompatibility.js";

/** The values the details edit form starts from for one Job. */
export function jobDetailFormValues(job) {
  const serviceType = normalizeServiceType(job.serviceType);
  return {
    guestName: job.guestName || "",
    guestCheckInTime: isServiceTime(job.guestCheckInTime) ? job.guestCheckInTime : "",
    notes: job.notes || "",
    serviceType,
    initialServiceType: serviceType,
  };
}

/** State of the details edit form (service type, guest name and notes) in Job Detail's Details section. Resets when another Job is shown. */
export function useJobDetailsEdit({ job, translate, language, onUpdateDetails }) {
  const [isEditingJobDetails, setIsEditingJobDetails] = useState(false);
  const [jobDetailValues, setJobDetailValues] = useState(() => jobDetailFormValues(job));
  const [isSavingJobDetails, setIsSavingJobDetails] = useState(false);
  const [jobDetailsSaveError, setJobDetailsSaveError] = useState("");
  const [hasSavedJobDetails, setHasSavedJobDetails] = useState(false);

  useEffect(() => {
    setJobDetailValues(jobDetailFormValues(job));
    setIsEditingJobDetails(false);
    setIsSavingJobDetails(false);
    setJobDetailsSaveError("");
    setHasSavedJobDetails(false);
  }, [job.id]);

  function startJobDetailsEdit() {
    if (!canEditJobDetails(job)) return;
    setJobDetailValues(jobDetailFormValues(job));
    setJobDetailsSaveError("");
    setHasSavedJobDetails(false);
    setIsEditingJobDetails(true);
  }

  async function saveJobDetails(event) {
    event.preventDefault();
    const { guestCheckInTime } = jobDetailValues;
    const details = {
      guestName: jobDetailValues.guestName.trim(),
      ...(guestCheckInTime !== jobDetailFormValues(job).guestCheckInTime && { guestCheckInTime }),
      notes: jobDetailValues.notes.trim(),
      ...(jobDetailValues.serviceType !== jobDetailValues.initialServiceType
        ? { serviceType: jobDetailValues.serviceType } : {}),
    };

    if (details.guestName.length > maximumGuestNameLength) {
      setJobDetailsSaveError(translate("jobs.guestNameTooLong"));
      return;
    }
    if (event.currentTarget.elements.guestCheckInTime.validity.badInput || (guestCheckInTime && !isServiceTime(guestCheckInTime))) {
      setJobDetailsSaveError(translate("jobs.scheduleInvalidTime"));
      return;
    }

    setIsSavingJobDetails(true);
    setJobDetailsSaveError("");
    setHasSavedJobDetails(false);

    try {
      await onUpdateDetails(details);
      setIsEditingJobDetails(false);
      setHasSavedJobDetails(true);
    } catch {
      setJobDetailsSaveError(serviceTypeMessage(language, "detailsUpdateError"));
    } finally {
      setIsSavingJobDetails(false);
    }
  }

  return {
    isEditingJobDetails, setIsEditingJobDetails, jobDetailValues, setJobDetailValues, isSavingJobDetails,
    jobDetailsSaveError, setJobDetailsSaveError, hasSavedJobDetails, startJobDetailsEdit, saveJobDetails,
  };
}
