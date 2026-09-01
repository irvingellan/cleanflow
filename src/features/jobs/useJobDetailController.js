import { useEffect, useState } from "react";
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
  const [selectedOffer, setSelectedOffer] = useState(null);

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

  useEffect(() => {
    if (view === "job-detail" && selectedJob) {
      refreshOffers();
      refreshIssues();
      refreshAssignments();
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
    setSelectedJob(updatedJob);
    onJobUpdated(updatedJob);
  }

  function openJob(job) {
    setSelectedJob(job);
    setDetailData({
      ...emptyDetailData(),
      isLoadingOffers: true,
      isLoadingIssues: true,
      isLoadingAssignments: isAssignmentAwareJob(job),
    });
    setSelectedOffer(null);
  }

  function closeJob() {
    setSelectedJob(null);
    setDetailData(emptyDetailData());
    setSelectedOffer(null);
  }

  function prepareJobDetailRefresh() {
    setDetailData({
      ...emptyDetailData(),
      isLoadingOffers: true,
      isLoadingIssues: true,
      isLoadingAssignments: isAssignmentAwareJob(selectedJob),
    });
    setSelectedOffer(null);
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
  }

  async function removeCleanerAssignment(assignmentId) {
    const updatedJob = await updateJob((job) =>
      removeAssignment(job.id, assignmentId, actorUid),
    );

    if (updatedJob) {
      await refreshAssignments(updatedJob);
    }
  }

  async function replaceCleanerAssignment(assignmentId, replacementOfferId) {
    const updatedJob = await updateJob((job) =>
      replaceAssignment(job.id, assignmentId, replacementOfferId, actorUid),
    );

    if (updatedJob) {
      await refreshAssignments(updatedJob);
    }
  }

  async function startCleaning() {
    return updateJob((job) => startAssignedJob(job.id));
  }

  async function completeCleaning() {
    return updateJob((job) => completeInProgressJob(job.id));
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

  async function createCleanerOfferLink(offer) {
    if (!selectedJob) {
      throw new Error("No job selected.");
    }

    return createPublicOfferLink({
      jobId: selectedJob.id,
      cleanerId: offer.cleanerId,
    });
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
    },
    offerFlow: {
      offersSentCount,
      selectedOffer,
      availableCleaners,
      isLoadingCleaners,
      hasCleanerError,
      clearOffersSentCount: () => setOffersSentCount(null),
      setSelectedOffer,
      recordOffersSent,
      createCleanerOfferLink,
    },
    actions: {
      assignCleaner,
      removeCleanerAssignment,
      replaceCleanerAssignment,
      startCleaning,
      completeCleaning,
      resolveJobIssue,
    },
    openJob,
    closeJob,
    prepareJobDetailRefresh,
  };
}
