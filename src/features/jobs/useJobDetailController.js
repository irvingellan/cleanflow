import { useEffect, useRef, useState } from "react";
import {
  createChecklistRun as createChecklistRunRequest,
  approveChecklistRun as approveChecklistRunRequest,
  getChecklistRun,
} from "../checklists/checklistRunService.js";
import {
  getChecklistCapability,
  issueChecklistCapability as issueChecklistCapabilityRequest,
  revokeChecklistCapability as revokeChecklistCapabilityRequest,
} from "../checklists/checklistCapabilityService.js";
import { getCleaners } from "../cleaners/cleanerService.js";
import { getJobIssues, resolveIssue } from "../issues/issueService.js";
import { createPublicOfferLink, getJobOffers } from "./jobOfferService.js";
import {
  assignInterestedCleaner,
  getJobAssignments,
  removeAssignment,
  replaceAssignment,
} from "./assignmentService.js";
import { isAssignmentAwareJob } from "./jobCompatibility.js";
import {
  assignCleanerToJob,
  completeInProgressJob,
  startAssignedJob,
  updateJobPrices,
  updateJobDataProvenance,
  archiveJob,
  restoreJob,
} from "./jobService.js";

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
  const [offersSentCount, setOffersSentCount] = useState(null);
  const checklistRunCreateInFlight = useRef(false);
  const checklistCapabilityInFlight = useRef(false);
  const checklistRunRequestId = useRef(0);
  const selectedJobIdRef = useRef(null);

  async function refreshOffers() {
    if (!selectedJob) {
      return;
    }

    setDetailData((currentData) => ({
      ...currentData,
      isLoadingOffers: true,
      hasOffersError: false,
    }));

    try {
      const offers = await getJobOffers(selectedJob.id);
      setDetailData((currentData) => ({ ...currentData, offers }));
    } catch {
      setDetailData((currentData) => ({ ...currentData, hasOffersError: true }));
    } finally {
      setDetailData((currentData) => ({ ...currentData, isLoadingOffers: false }));
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
      const issues = await getJobIssues(selectedJob.id);
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
      const assignments = await getJobAssignments(job.id);
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
      const checklistRun = await getChecklistRun(job.id);
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
    setDetailData((currentData) => ({
      ...currentData, isLoadingChecklistCapability: true, hasChecklistCapabilityError: false,
    }));
    try {
      const checklistCapability = await getChecklistCapability(job.id);
      setDetailData((currentData) => ({ ...currentData, checklistCapability }));
    } catch {
      setDetailData((currentData) => ({ ...currentData, hasChecklistCapabilityError: true }));
    } finally {
      setDetailData((currentData) => ({ ...currentData, isLoadingChecklistCapability: false }));
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
    if (view !== "offer-cleaners") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingCleaners(true);
    setHasCleanerError(false);

    async function loadCleaners() {
      try {
        const cleaners = await getCleaners();

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
    selectedJobIdRef.current = job.id;
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
    checklistRunCreateInFlight.current = false;
    checklistCapabilityInFlight.current = false;
    selectedJobIdRef.current = null;
    checklistRunRequestId.current += 1;
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

    try {
      const updatedJob = await action(selectedJob);
      updateSelectedJob(updatedJob);
      return updatedJob;
    } catch (error) {
      if (error.job) {
        updateSelectedJob(error.job);
      }

      throw error;
    }
  }

  async function assignCleaner(offer) {
    const updatedJob = await updateJob((job) =>
      isAssignmentAwareJob(job)
        ? assignInterestedCleaner(job.id, offer.id)
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
    const updatedJob = await updateJob((job) => completeInProgressJob(job.id));
    if (updatedJob) await refreshChecklistCapability(updatedJob);
    return updatedJob;
  }

  async function approveChecklistRun() {
    return updateJob(async (job) => {
      const result = await approveChecklistRunRequest(job.id);
      return { ...job, operationalStatus: result.operationalStatus };
    });
  }

  async function saveJobPrices(prices) {
    return updateJob((job) => updateJobPrices(job.id, prices));
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

  async function createChecklistRun() {
    if (!selectedJob || checklistRunCreateInFlight.current) {
      return detailData.checklistRun;
    }

    checklistRunCreateInFlight.current = true;
    setDetailData((currentData) => ({
      ...currentData,
      isCreatingChecklistRun: true,
      hasCreateChecklistRunError: false,
    }));

    try {
      const checklistRun = await createChecklistRunRequest(selectedJob.id);
      setDetailData((currentData) => ({ ...currentData, checklistRun }));
      return checklistRun;
    } catch (error) {
      setDetailData((currentData) => ({ ...currentData, hasCreateChecklistRunError: true }));
      throw error;
    } finally {
      checklistRunCreateInFlight.current = false;
      setDetailData((currentData) => ({ ...currentData, isCreatingChecklistRun: false }));
    }
  }

  async function issueChecklistCapability(cleanerId) {
    if (!selectedJob || checklistCapabilityInFlight.current) return null;
    checklistCapabilityInFlight.current = true;
    setDetailData((currentData) => ({
      ...currentData, isIssuingChecklistCapability: true, hasIssueChecklistCapabilityError: false,
    }));
    try {
      const result = await issueChecklistCapabilityRequest({ jobId: selectedJob.id, cleanerId });
      setDetailData((currentData) => ({ ...currentData, checklistCapability: result.capability }));
      return result.url;
    } catch (error) {
      setDetailData((currentData) => ({ ...currentData, hasIssueChecklistCapabilityError: true }));
      throw error;
    } finally {
      checklistCapabilityInFlight.current = false;
      setDetailData((currentData) => ({ ...currentData, isIssuingChecklistCapability: false }));
    }
  }

  async function revokeChecklistCapability() {
    if (!selectedJob || checklistCapabilityInFlight.current) return null;
    checklistCapabilityInFlight.current = true;
    setDetailData((currentData) => ({
      ...currentData, isRevokingChecklistCapability: true, hasRevokeChecklistCapabilityError: false,
    }));
    try {
      const checklistCapability = await revokeChecklistCapabilityRequest(selectedJob.id);
      setDetailData((currentData) => ({ ...currentData, checklistCapability }));
      return checklistCapability;
    } catch (error) {
      setDetailData((currentData) => ({ ...currentData, hasRevokeChecklistCapabilityError: true }));
      throw error;
    } finally {
      checklistCapabilityInFlight.current = false;
      setDetailData((currentData) => ({ ...currentData, isRevokingChecklistCapability: false }));
    }
  }

  function recordOffersSent(count, updatedJob) {
    updateSelectedJob(updatedJob);
    setOffersSentCount(count);
  }

  return {
    job: selectedJob,
    detail: {
      offers: detailData.offers,
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
      offersSentCount,
      availableCleaners,
      isLoadingCleaners,
      hasCleanerError,
      clearOffersSentCount: () => setOffersSentCount(null),
      recordOffersSent,
      createCleanerOfferLink,
    },
    actions: {
      assignCleaner,
      removeCleanerAssignment,
      replaceCleanerAssignment,
      startCleaning,
      completeCleaning,
      approveChecklistRun,
      saveJobPrices,
      saveDataProvenance,
      archive,
      restore,
      resolveJobIssue,
      createChecklistRun,
      issueChecklistCapability,
      revokeChecklistCapability,
    },
    openJob,
    closeJob,
    prepareJobDetailRefresh,
  };
}
