import { useEffect, useRef, useState } from "react";
import {
  createChecklistRun as createChecklistRunRequest,
  approveChecklistRun as approveChecklistRunRequest,
  submitChecklistRunForReview as submitChecklistRunForReviewRequest,
  completeJobWithoutChecklist as completeJobWithoutChecklistRequest,
  abandonChecklistRunAndCompleteJob as abandonChecklistRunAndCompleteJobRequest,
  getChecklistRun,
} from "../checklists/checklistRunService.js";
import {
  getChecklistCapability,
  issueChecklistCapability as issueChecklistCapabilityRequest,
  revokeChecklistCapability as revokeChecklistCapabilityRequest,
} from "../checklists/checklistCapabilityService.js";
import { getCleaners } from "../cleaners/cleanerService.js";
import { getJobIssues, resolveIssue } from "../issues/issueService.js";
import {
  closeOfferByManager, createPublicOfferLink, getJobOffers, reopenOfferByManager, revokeAutomaticOffer, subscribeToJobOffer,
} from "./jobOfferService.js";
import {
  assignInterestedCleaner,
  assignCleanerDirectly as assignCleanerDirectlyRequest,
  getJobAssignments,
  removeAssignment,
  replaceAssignment,
  setRequiredCleanerCount,
} from "./assignmentService.js";
import { isAutomaticOfferJob } from "./automaticOffers.js";
import { markCleanerReminderSent } from "./cleanerReminderLog.js";
import { isAssignmentAwareJob } from "./jobCompatibility.js";
import {
  assignCleanerToJob,
  getJobById,
  subscribeToJob,
  startAssignedJob,
  updateJobPrices,
  updateJobDetails,
  updateJobDataProvenance,
  archiveJob,
  restoreJob,
} from "./jobService.js";
import {
  createManualReplacementOffer as createManualReplacementOfferRequest,
  rescheduleJob as rescheduleJobRequest,
} from "./jobScheduleService.js";
import { currentScheduleRevision } from "./scheduleConfirmation.js";
import {
  createManagerOperationTracker,
  createManagerPageVisitId,
} from "../telemetry/managerOperationTelemetryService.js";

function emptyDetailData() {
  return {
    offers: [],
    isLoadingOffers: false,
    hasOffersError: false,
    assignments: [],
    isLoadingAssignments: false,
    hasAssignmentsError: false,
    issues: [],
    isLoadingIssues: false,
    hasIssuesError: false,
    checklistRun: null,
    isLoadingChecklistRun: false,
    isRefreshingChecklistRun: false,
    hasChecklistRunError: false,
    isCreatingChecklistRun: false,
    hasCreateChecklistRunError: false,
    checklistCapability: { state: "NONE" },
    isLoadingChecklistCapability: false,
    hasChecklistCapabilityError: false,
    isIssuingChecklistCapability: false,
    hasIssueChecklistCapabilityError: false,
    isRevokingChecklistCapability: false,
    hasRevokeChecklistCapabilityError: false,
  };
}

/**
 * Owns Job-detail data and mutations. It reports changed Jobs to the worklist
 * rather than duplicating Firestore state outside the Jobs feature.
 */
export function useJobDetailController({ view, onJobUpdated, actorUid }) {
  const [selectedJob, setSelectedJob] = useState(null);
  const [detailData, setDetailData] = useState(emptyDetailData);
  const [availableCleaners, setAvailableCleaners] = useState([]);
  const [isLoadingCleaners, setIsLoadingCleaners] = useState(false);
  const [hasCleanerError, setHasCleanerError] = useState(false);
  const [offersCreatedCount, setOffersCreatedCount] = useState(null);
  const [replacementObservation, setReplacementObservation] = useState(null);
  const checklistRunCreateInFlight = useRef(false);
  const checklistCapabilityInFlight = useRef(false);
  const capabilityJobsInFlight = useRef(new Set());
  const offersRequestId = useRef(0);
  const checklistRunRequestId = useRef(0);
  const checklistCapabilityRequestId = useRef(0);
  const selectedJobIdRef = useRef(null);
  const selectedJobEpochRef = useRef(0);
  const operationTrackerRef = useRef(null);
  const watchedJobId = isAutomaticOfferJob(selectedJob) || selectedJob?.operationalStatus === "ASSIGNED"
    || currentScheduleRevision(selectedJob) > 0 ? selectedJob.id : null;
  const latestServerJobRef = useRef(null);
  const replacementId = selectedJob?.manualReplacementOffer?.scheduleRevision === currentScheduleRevision(selectedJob)
    ? selectedJob.manualReplacementOffer.offerId : null;
  const replacementJobId = replacementId ? selectedJob.id : null;
  const replacementRevision = replacementId ? currentScheduleRevision(selectedJob) : null;
  const onJobUpdatedRef = useRef(onJobUpdated);
  onJobUpdatedRef.current = onJobUpdated;

  useEffect(() => {
    if (view !== "job-detail" || !watchedJobId) return undefined;
    const epoch = selectedJobEpochRef.current;
    return subscribeToJob(watchedJobId, (updatedJob) => {
      if (selectedJobIdRef.current !== watchedJobId || selectedJobEpochRef.current !== epoch) return;
      latestServerJobRef.current = updatedJob;
      setSelectedJob(updatedJob);
      onJobUpdatedRef.current(updatedJob);
    });
  }, [view, watchedJobId]);

  useEffect(() => {
    if (view !== "job-detail" || !replacementId) return undefined;
    const epoch = selectedJobEpochRef.current;
    let current = true;
    const unsubscribe = subscribeToJobOffer(replacementJobId, replacementId, (offer) => {
      if (current && selectedJobIdRef.current === replacementJobId && selectedJobEpochRef.current === epoch) {
        setReplacementObservation({ jobId: replacementJobId, offerId: replacementId, revision: replacementRevision, offer });
      }
    });
    return () => { current = false; unsubscribe(); };
  }, [view, replacementJobId, replacementId, replacementRevision]);

  useEffect(() => {
    operationTrackerRef.current = view === "job-detail" && selectedJob?.id && actorUid
      ? createManagerOperationTracker({ uid: actorUid, pageVisitId: createManagerPageVisitId() })
      : null;
    return () => { operationTrackerRef.current = null; };
  }, [actorUid, selectedJob?.id, view]);

  function loadDetailOperation(operation, task) {
    const tracker = operationTrackerRef.current;
    return tracker ? tracker.track(operation, task) : task();
  }

  async function refreshOffers() {
    if (!selectedJob || selectedJobIdRef.current !== selectedJob.id) {
      return;
    }
    const jobId = selectedJob.id;
    const epoch = selectedJobEpochRef.current;
    const requestId = ++offersRequestId.current;
    const isCurrent = () => selectedJobIdRef.current === jobId
      && selectedJobEpochRef.current === epoch && offersRequestId.current === requestId;

    setDetailData((currentData) => ({
      ...currentData,
      isLoadingOffers: true,
      hasOffersError: false,
    }));

    try {
      const offers = await loadDetailOperation("offers", () => getJobOffers(jobId));
      if (isCurrent()) setDetailData((currentData) => ({ ...currentData, offers }));
    } catch {
      if (isCurrent()) setDetailData((currentData) => ({ ...currentData, hasOffersError: true }));
    } finally {
      if (isCurrent()) setDetailData((currentData) => ({ ...currentData, isLoadingOffers: false }));
    }
  }

  async function refreshIssues() {
    if (!selectedJob) {
      return;
    }

    setDetailData((currentData) => ({
      ...currentData,
      isLoadingIssues: true,
      hasIssuesError: false,
    }));

    try {
      const issues = await loadDetailOperation("issues", () => getJobIssues(selectedJob.id));
      setDetailData((currentData) => ({ ...currentData, issues }));
    } catch {
      setDetailData((currentData) => ({ ...currentData, hasIssuesError: true }));
    } finally {
      setDetailData((currentData) => ({ ...currentData, isLoadingIssues: false }));
    }
  }

  async function refreshAssignments(job = selectedJob) {
    if (!job || !isAssignmentAwareJob(job)) {
      setDetailData((currentData) => ({ ...currentData, assignments: [] }));
      return;
    }

    setDetailData((currentData) => ({
      ...currentData,
      isLoadingAssignments: true,
      hasAssignmentsError: false,
    }));

    try {
      const assignments = await loadDetailOperation("assignments", () => getJobAssignments(job.id));
      setDetailData((currentData) => ({ ...currentData, assignments }));
    } catch {
      setDetailData((currentData) => ({ ...currentData, hasAssignmentsError: true }));
    } finally {
      setDetailData((currentData) => ({ ...currentData, isLoadingAssignments: false }));
    }
  }

  async function refreshChecklistRun(job = selectedJob, { manual = false } = {}) {
    if (!job) {
      return;
    }

    const requestId = ++checklistRunRequestId.current;

    setDetailData((currentData) => ({
      ...currentData,
      ...(manual ? { isRefreshingChecklistRun: true } : { isLoadingChecklistRun: true }),
      hasChecklistRunError: false,
    }));

    try {
      const checklistRun = await loadDetailOperation("checklist-run", () => getChecklistRun(job.id));
      if (requestId === checklistRunRequestId.current && selectedJobIdRef.current === job.id) {
        setDetailData((currentData) => ({ ...currentData, checklistRun }));
      }
    } catch {
      if (requestId === checklistRunRequestId.current && selectedJobIdRef.current === job.id) {
        setDetailData((currentData) => ({ ...currentData, hasChecklistRunError: true }));
      }
    } finally {
      if (requestId === checklistRunRequestId.current && selectedJobIdRef.current === job.id) {
        setDetailData((currentData) => ({
          ...currentData,
          ...(manual ? { isRefreshingChecklistRun: false } : { isLoadingChecklistRun: false }),
        }));
      }
    }
  }

  async function refreshChecklistCapability(job = selectedJob) {
    if (!job) return;
    const requestId = ++checklistCapabilityRequestId.current;
    setDetailData((currentData) => ({
      ...currentData, isLoadingChecklistCapability: true, hasChecklistCapabilityError: false,
    }));
    try {
      const checklistCapability = await loadDetailOperation(
        "checklist-capability", () => getChecklistCapability(job.id),
      );
      if (requestId === checklistCapabilityRequestId.current && selectedJobIdRef.current === job.id) {
        setDetailData((currentData) => ({ ...currentData, checklistCapability }));
      }
    } catch {
      if (requestId === checklistCapabilityRequestId.current && selectedJobIdRef.current === job.id) {
        setDetailData((currentData) => ({ ...currentData, hasChecklistCapabilityError: true }));
      }
    } finally {
      if (requestId === checklistCapabilityRequestId.current && selectedJobIdRef.current === job.id) {
        setDetailData((currentData) => ({ ...currentData, isLoadingChecklistCapability: false }));
      }
    }
  }

  useEffect(() => {
    if (view === "job-detail" && selectedJob) {
      refreshOffers();
      refreshIssues();
      refreshAssignments();
      refreshChecklistRun();
      refreshChecklistCapability();
    }
  }, [view, selectedJob]);

  useEffect(() => {
    if (view !== "offer-cleaners" && view !== "job-detail") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingCleaners(true);
    setHasCleanerError(false);

    async function loadCleaners() {
      try {
        const cleaners = await loadDetailOperation("cleaners", () => getCleaners());

        if (isCurrent) {
          setAvailableCleaners(cleaners);
        }
      } catch {
        if (isCurrent) {
          setHasCleanerError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingCleaners(false);
        }
      }
    }

    loadCleaners();

    return () => {
      isCurrent = false;
    };
  }, [view]);

  function updateSelectedJob(updatedJob) {
    selectedJobIdRef.current = updatedJob?.id || null;
    setSelectedJob(updatedJob);
    onJobUpdated(updatedJob);
  }

  function openJob(job) {
    selectedJobEpochRef.current += 1;
    latestServerJobRef.current = null;
    setReplacementObservation(null);
    checklistRunCreateInFlight.current = null;
    checklistCapabilityInFlight.current = null;
    checklistRunRequestId.current += 1;
    checklistCapabilityRequestId.current += 1;
    selectedJobIdRef.current = job.id;
    setOffersCreatedCount(null);
    setSelectedJob(job);
    setDetailData({
      ...emptyDetailData(),
      isLoadingOffers: true,
      isLoadingIssues: true,
      isLoadingAssignments: isAssignmentAwareJob(job),
      isLoadingChecklistRun: true,
      isLoadingChecklistCapability: true,
    });
  }

  function closeJob() {
    selectedJobEpochRef.current += 1;
    checklistRunCreateInFlight.current = null;
    checklistCapabilityInFlight.current = null;
    selectedJobIdRef.current = null;
    checklistRunRequestId.current += 1;
    checklistCapabilityRequestId.current += 1;
    setSelectedJob(null);
    setDetailData(emptyDetailData());
  }

  function prepareJobDetailRefresh() {
    setDetailData({
      ...emptyDetailData(),
      isLoadingOffers: true,
      isLoadingIssues: true,
      isLoadingAssignments: isAssignmentAwareJob(selectedJob),
      isLoadingChecklistRun: true,
      isLoadingChecklistCapability: true,
    });
  }

  async function updateJob(action) {
    if (!selectedJob) {
      return;
    }

    const job = selectedJob;
    const epoch = selectedJobEpochRef.current;

    try {
      const updatedJob = await action(job);
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === job.id) {
        updateSelectedJob(updatedJob);
        return updatedJob;
      }
      if (updatedJob) onJobUpdated(updatedJob);
      return null;
    } catch (error) {
      if (error.job) {
        if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === job.id) {
          updateSelectedJob(error.job);
        } else {
          onJobUpdated(error.job);
        }
      }

      throw error;
    }
  }

  async function assignCleaner(offer, options = {}) {
    const updatedJob = await updateJob((job) =>
      isAssignmentAwareJob(job)
        ? assignInterestedCleaner(job.id, offer.id, options)
        : assignCleanerToJob(job.id, {
          id: offer.cleanerId,
          name: offer.cleanerName,
        }),
    );

    if (updatedJob && isAssignmentAwareJob(updatedJob)) {
      await refreshAssignments(updatedJob);
    }
    if (updatedJob) await refreshChecklistCapability(updatedJob);
  }

  async function assignCleanerDirectly(cleanerId, replacementOfferId) {
    const updatedJob = await updateJob((job) =>
      assignCleanerDirectlyRequest(job.id, cleanerId, replacementOfferId));
    if (updatedJob) {
      await refreshAssignments(updatedJob);
      await refreshChecklistCapability(updatedJob);
    }
    return updatedJob;
  }

  async function removeCleanerAssignment(assignmentId) {
    const updatedJob = await updateJob((job) =>
      removeAssignment(job.id, assignmentId, actorUid),
    );

    if (updatedJob) {
      await refreshAssignments(updatedJob);
      await refreshChecklistCapability(updatedJob);
    }
  }

  async function replaceCleanerAssignment(assignmentId, replacementOfferId) {
    const updatedJob = await updateJob((job) =>
      replaceAssignment(job.id, assignmentId, replacementOfferId, actorUid),
    );

    if (updatedJob) {
      await refreshAssignments(updatedJob);
      await refreshChecklistCapability(updatedJob);
    }
  }

  async function startCleaning() {
    const updatedJob = await updateJob((job) => startAssignedJob(job.id));
    if (updatedJob) await refreshChecklistCapability(updatedJob);
    return updatedJob;
  }

  async function completeCleaning() {
    const updatedJob = await updateJob(async (job) => {
      await completeJobWithoutChecklistRequest(job.id);
      return getJobById(job.id);
    });
    if (updatedJob) await refreshChecklistCapability(updatedJob);
    return updatedJob;
  }

  async function approveChecklistRun() {
    return updateJob(async (job) => {
      const result = await approveChecklistRunRequest(job.id);
      return { ...job, operationalStatus: result.operationalStatus };
    });
  }

  async function submitChecklistRunForReview(baseRevision) {
    if (!selectedJob) return;
    await submitChecklistRunForReviewRequest(selectedJob.id, baseRevision);
    await refreshChecklistRun(selectedJob);
  }

  async function abandonChecklistRunAndCompleteJob() {
    const updatedJob = await updateJob(async (job) => {
      await abandonChecklistRunAndCompleteJobRequest(job.id);
      return getJobById(job.id);
    });
    if (updatedJob) {
      await Promise.all([
        refreshChecklistRun(updatedJob),
        refreshChecklistCapability(updatedJob),
      ]);
    }
    return updatedJob;
  }

  async function saveJobPrices(prices) {
    return updateJob((job) => updateJobPrices(job.id, prices));
  }

  async function saveJobDetails(details) {
    return updateJob((job) => updateJobDetails(job.id, details));
  }

  async function saveJobSchedule(schedule) {
    if (!selectedJob) return null;
    const job = selectedJob;
    const epoch = selectedJobEpochRef.current;
    const isCurrent = () => selectedJobIdRef.current === job.id && selectedJobEpochRef.current === epoch;
    const readCurrent = async () => {
      const previousObservation = latestServerJobRef.current;
      const snapshot = await getJobById(job.id, { serverOnly: true });
      const observation = latestServerJobRef.current;
      return observation?.id === job.id
        && (currentScheduleRevision(observation) > currentScheduleRevision(snapshot)
          || (observation !== previousObservation
            && currentScheduleRevision(observation) === currentScheduleRevision(snapshot)))
        ? observation : snapshot;
    };
    let result;
    try {
      result = await rescheduleJobRequest({
        ...schedule, jobId: job.id,
        expectedScheduleRevision: schedule.expectedScheduleRevision ?? currentScheduleRevision(job),
      });
    } catch (error) {
      if (error?.details?.reason === "stale-schedule" && isCurrent()) {
        try {
          const currentJob = await readCurrent();
          if (isCurrent()) updateSelectedJob(currentJob);
        } catch {
          // Preserve the actionable conflict even when the readback is unavailable.
        }
      }
      throw error;
    }
    if (!isCurrent()) return null;
    let updatedJob;
    let needsScheduleReload = false;
    try {
      updatedJob = await readCurrent();
    } catch {
      const observed = latestServerJobRef.current;
      if (observed?.id === job.id && currentScheduleRevision(observed) >= result.scheduleRevision) {
        updatedJob = observed;
      } else {
        updatedJob = {
          ...job,
          scheduledDate: result.scheduledDate,
          scheduledStart: result.scheduledStart || undefined,
          scheduleRevision: result.scheduleRevision,
          checklistContextRevision: result.checklistContextRevision,
          scheduleConfirmation: result.scheduleConfirmation,
        };
        needsScheduleReload = result.changed && !Object.hasOwn(result, "scheduleConfirmation");
      }
    }
    if (!isCurrent()) return null;
    updateSelectedJob(updatedJob);
    return { job: updatedJob, changed: result.changed, needsScheduleReload };
  }

  async function offerManualReplacement(cleanerId, scheduleRevision) {
    return updateJob(async (job) => {
      await createManualReplacementOfferRequest({ jobId: job.id, cleanerId, scheduleRevision });
      return getJobById(job.id, { serverOnly: true });
    });
  }

  async function saveDataProvenance(dataProvenance) {
    return updateJob(async (job) => {
      await updateJobDataProvenance(job.id, dataProvenance, actorUid);
      return { ...job, dataProvenance };
    });
  }

  async function archive() {
    if (!selectedJob) return;
    await archiveJob(selectedJob.id, actorUid);
    const archivedJob = { ...selectedJob, archivedAt: true };
    updateSelectedJob(archivedJob);
    await refreshChecklistCapability(archivedJob);
  }

  async function restore() {
    if (!selectedJob) return;
    await restoreJob(selectedJob.id, actorUid);
    const restored = { ...selectedJob, archivedAt: null };
    updateSelectedJob(restored);
    await refreshChecklistCapability(restored);
    return restored;
  }

  async function resolveJobIssue({ issueId, resolutionNote }) {
    if (!selectedJob) {
      return;
    }

    try {
      const resolvedIssue = await resolveIssue({
        jobId: selectedJob.id,
        issueId,
        resolutionNote,
      });

      setDetailData((currentData) => ({
        ...currentData,
        issues: currentData.issues.map((issue) =>
          issue.id === resolvedIssue.id ? resolvedIssue : issue,
        ),
      }));
    } catch (error) {
      if (error.issue) {
        setDetailData((currentData) => ({
          ...currentData,
          issues: currentData.issues.map((issue) =>
            issue.id === error.issue.id ? error.issue : issue,
          ),
        }));
      }

      throw error;
    }
  }

  async function createCleanerOfferLink(offer, offeredCompensation) {
    if (!selectedJob) {
      throw new Error("No job selected.");
    }

    return createPublicOfferLink({
      jobId: selectedJob.id,
      cleanerId: offer.cleanerId,
      offeredCompensation,
    });
  }

  async function decideCleanerOffer(offer, decision) {
    if (!selectedJob) return;
    await closeOfferByManager({ jobId: selectedJob.id, offerId: offer.id, decision, actorUid });
    if (selectedJobIdRef.current === selectedJob.id) await refreshOffers();
  }

  async function reopenCleanerOffer(offer) {
    if (!selectedJob) return;
    await reopenOfferByManager({ jobId: selectedJob.id, offerId: offer.id, actorUid });
    if (selectedJobIdRef.current === selectedJob.id) await refreshOffers();
  }

  async function markReminderSent(cleanerId) {
    await updateJob(async (job) => {
      await markCleanerReminderSent(job.id, cleanerId, actorUid);
      return getJobById(job.id);
    });
  }

  async function setCleanerSpots(count) {
    await updateJob((job) => setRequiredCleanerCount(job.id, count));
  }

  async function revokeCleanerOffer(offerId) {
    if (!selectedJob) return;
    await revokeAutomaticOffer({ jobId: selectedJob.id, offerId });
    if (selectedJobIdRef.current === selectedJob.id) await refreshOffers();
  }

  async function createChecklistRun() {
    if (!selectedJob || checklistRunCreateInFlight.current) {
      return detailData.checklistRun;
    }

    const jobId = selectedJob.id;
    const epoch = selectedJobEpochRef.current;
    const operation = Symbol("checklist-run-create");
    checklistRunCreateInFlight.current = operation;
    setDetailData((currentData) => ({
      ...currentData,
      isCreatingChecklistRun: true,
      hasCreateChecklistRunError: false,
    }));

    try {
      const checklistRun = await createChecklistRunRequest(jobId);
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, checklistRun }));
      }
      return checklistRun;
    } catch (error) {
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, hasCreateChecklistRunError: true }));
      }
      throw error;
    } finally {
      if (checklistRunCreateInFlight.current === operation) checklistRunCreateInFlight.current = null;
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, isCreatingChecklistRun: false }));
      }
    }
  }

  async function issueChecklistCapability(cleanerId) {
    return issueChecklistCapabilityWithState(cleanerId);
  }

  async function issueChecklistCapabilityWithState(cleanerId) {
    if (!selectedJob || capabilityJobsInFlight.current.has(selectedJob.id)) return null;
    const jobId = selectedJob.id;
    const epoch = selectedJobEpochRef.current;
    const operation = Symbol("checklist-capability-issue");
    capabilityJobsInFlight.current.add(jobId);
    checklistCapabilityInFlight.current = operation;
    setDetailData((currentData) => ({
      ...currentData, isIssuingChecklistCapability: true, hasIssueChecklistCapabilityError: false,
    }));
    try {
      const result = await issueChecklistCapabilityRequest({ jobId, cleanerId });
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, checklistCapability: result.capability }));
      }
      return result;
    } catch (error) {
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, hasIssueChecklistCapabilityError: true }));
      }
      throw error;
    } finally {
      capabilityJobsInFlight.current.delete(jobId);
      if (checklistCapabilityInFlight.current === operation) checklistCapabilityInFlight.current = null;
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, isIssuingChecklistCapability: false }));
      }
    }
  }

  async function prepareChecklistReminder(cleanerId) {
    if (!selectedJob) throw new Error("No Job selected.");
    const jobId = selectedJob.id;
    const epoch = selectedJobEpochRef.current;
    const run = detailData.checklistRun || await createChecklistRun();
    if (selectedJobEpochRef.current !== epoch || selectedJobIdRef.current !== jobId) {
      throw new Error("Job changed while preparing the reminder.");
    }
    if (run?.status !== "DRAFT") throw new Error("A Draft Checklist Run is required.");
    const result = await issueChecklistCapabilityWithState(cleanerId);
    if (selectedJobEpochRef.current !== epoch || selectedJobIdRef.current !== jobId) {
      throw new Error("Job changed while preparing the reminder.");
    }
    if (!result?.url || result.capability?.state !== "ACTIVE"
      || result.capability?.cleanerId !== cleanerId) {
      throw new Error("Cleaner checklist link is unavailable.");
    }
    return result;
  }

  async function revokeChecklistCapability() {
    if (!selectedJob || capabilityJobsInFlight.current.has(selectedJob.id)) return null;
    const jobId = selectedJob.id;
    const epoch = selectedJobEpochRef.current;
    const operation = Symbol("checklist-capability-revoke");
    capabilityJobsInFlight.current.add(jobId);
    checklistCapabilityInFlight.current = operation;
    setDetailData((currentData) => ({
      ...currentData, isRevokingChecklistCapability: true, hasRevokeChecklistCapabilityError: false,
    }));
    try {
      const checklistCapability = await revokeChecklistCapabilityRequest(jobId);
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, checklistCapability }));
      }
      return checklistCapability;
    } catch (error) {
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, hasRevokeChecklistCapabilityError: true }));
      }
      throw error;
    } finally {
      capabilityJobsInFlight.current.delete(jobId);
      if (checklistCapabilityInFlight.current === operation) checklistCapabilityInFlight.current = null;
      if (selectedJobEpochRef.current === epoch && selectedJobIdRef.current === jobId) {
        setDetailData((currentData) => ({ ...currentData, isRevokingChecklistCapability: false }));
      }
    }
  }

  function recordOffersCreated(count, updatedJob) {
    updateSelectedJob(updatedJob);
    setOffersCreatedCount(count);
  }

  return {
    job: selectedJob,
    detail: {
      offers: replacementObservation && replacementObservation.jobId === replacementJobId
        && replacementObservation.offerId === replacementId && replacementObservation.revision === replacementRevision
        ? [...detailData.offers.filter(({ id }) => id !== replacementId), ...(replacementObservation.offer ? [replacementObservation.offer] : [])]
        : detailData.offers,
      isLoadingOffers: detailData.isLoadingOffers,
      hasOffersError: detailData.hasOffersError,
      assignments: detailData.assignments,
      isLoadingAssignments: detailData.isLoadingAssignments,
      hasAssignmentsError: detailData.hasAssignmentsError,
      issues: detailData.issues,
      isLoadingIssues: detailData.isLoadingIssues,
      hasIssuesError: detailData.hasIssuesError,
      refreshOffers,
      refreshIssues,
      checklistRun: detailData.checklistRun,
      isLoadingChecklistRun: detailData.isLoadingChecklistRun,
      isRefreshingChecklistRun: detailData.isRefreshingChecklistRun,
      hasChecklistRunError: detailData.hasChecklistRunError,
      isCreatingChecklistRun: detailData.isCreatingChecklistRun,
      hasCreateChecklistRunError: detailData.hasCreateChecklistRunError,
      refreshChecklistRun,
      checklistCapability: detailData.checklistCapability,
      isLoadingChecklistCapability: detailData.isLoadingChecklistCapability,
      hasChecklistCapabilityError: detailData.hasChecklistCapabilityError,
      isIssuingChecklistCapability: detailData.isIssuingChecklistCapability,
      hasIssueChecklistCapabilityError: detailData.hasIssueChecklistCapabilityError,
      isRevokingChecklistCapability: detailData.isRevokingChecklistCapability,
      hasRevokeChecklistCapabilityError: detailData.hasRevokeChecklistCapabilityError,
      refreshChecklistCapability,
    },
    offerFlow: {
      offersCreatedCount,
      availableCleaners,
      isLoadingCleaners,
      hasCleanerError,
      clearOffersCreatedCount: () => setOffersCreatedCount(null),
      recordOffersCreated,
      createCleanerOfferLink,
      revokeCleanerOffer,
      decideCleanerOffer,
      reopenCleanerOffer,
    },
    actions: {
      setCleanerSpots,
      markReminderSent,
      assignCleaner,
      assignCleanerDirectly,
      removeCleanerAssignment,
      replaceCleanerAssignment,
      startCleaning,
      completeCleaning,
      approveChecklistRun,
      submitChecklistRunForReview,
      abandonChecklistRunAndCompleteJob,
      saveJobPrices,
      saveJobDetails,
      saveJobSchedule,
      offerManualReplacement,
      saveDataProvenance,
      archive,
      restore,
      resolveJobIssue,
      createChecklistRun,
      issueChecklistCapability,
      prepareChecklistReminder,
      revokeChecklistCapability,
    },
    openJob,
    closeJob,
    prepareJobDetailRefresh,
  };
}
