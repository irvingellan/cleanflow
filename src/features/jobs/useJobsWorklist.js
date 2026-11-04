import { useEffect, useRef, useState } from "react";
import { getAllCleaners } from "../cleaners/cleanerService.js";
import { getJobs } from "./jobService.js";
import { createJobListFilters } from "./jobListFilters.js";

function initialPageCursors() {
  return {
    activeCursor: null,
    completedCursor: null,
    activeExhausted: false,
    completedExhausted: false,
  };
}

function mergeJobs(currentJobs, incomingJobs) {
  return [
    ...new Map([...currentJobs, ...incomingJobs].map((job) => [job.id, job])).values(),
  ];
}

/**
 * Owns the bounded Jobs worklist. Navigation stays in the application shell so
 * Dashboard and detail-origin behavior remain explicit at the integration boundary.
 */
export function useJobsWorklist({ view, detailPaneActive = false, preserveLoadedJobs = false, includeArchived = false }) {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [filters, setFilters] = useState(createJobListFilters);
  const [cleaners, setCleaners] = useState([]);
  const [pageCursors, setPageCursors] = useState(initialPageCursors);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const requestGeneration = useRef(0);
  const loadedQuery = useRef(null);
  const loadingMoreRequest = useRef(null);
  const previousViewRef = useRef(view);
  const isEnteringJobList =
    view === "job-list" && previousViewRef.current !== "job-list";
  const isWorklistLoading = isLoading || isEnteringJobList;

  useEffect(() => {
    previousViewRef.current = view;
    const generation = ++requestGeneration.current;
    const isCurrent = () => requestGeneration.current === generation;
    const cancel = () => { requestGeneration.current += 1; };
    loadingMoreRequest.current = null;
    setIsLoadingMore(false);

    if (view !== "job-list" && !(view === "job-detail" && detailPaneActive)) {
      setIsLoading(false);
      return cancel;
    }

    const queryKey = JSON.stringify([filters.status, filters.datePreset, includeArchived]);
    // Opening a loaded list beside a Job reuses its page and cursors. Changing
    // a server-side filter must instead start a fresh query, even in the pane.
    if (view === "job-detail" && loadedQuery.current === queryKey) {
      setIsLoading(false);
      return cancel;
    }
    const preservePage = preserveLoadedJobs && loadedQuery.current === queryKey;
    loadedQuery.current = null;
    setIsLoading(true);
    setHasError(false);
    setPageCursors(initialPageCursors());
    setHasMore(false);

    async function loadJobs() {
      try {
        const [loadedJobPage, loadedCleaners] = await Promise.all([
          getJobs(filters, { includeArchived }),
          getAllCleaners(),
        ]);

        if (isCurrent()) {
          loadedQuery.current = queryKey;
          setJobs((currentJobs) =>
            preservePage
              ? mergeJobs(currentJobs, loadedJobPage.jobs)
              : loadedJobPage.jobs,
          );
          setCleaners(loadedCleaners);
          setPageCursors(loadedJobPage.nextPageCursors);
          setHasMore(loadedJobPage.hasMore);
        }
      } catch {
        if (isCurrent()) {
          setHasError(true);
        }
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
        }
      }
    }

    loadJobs();

    return cancel;
  }, [view, detailPaneActive, filters.status, filters.datePreset, includeArchived]);

  async function loadMore() {
    if (isWorklistLoading || hasError || !hasMore || loadingMoreRequest.current) return;
    const generation = requestGeneration.current;
    const request = {};
    loadingMoreRequest.current = request;
    const isCurrent = () => requestGeneration.current === generation && loadingMoreRequest.current === request;
    setIsLoadingMore(true);

    try {
      const loadedJobPage = await getJobs(filters, { ...pageCursors, includeArchived });
      if (!isCurrent()) return;
      setJobs((currentJobs) => mergeJobs(currentJobs, loadedJobPage.jobs));
      setPageCursors(loadedJobPage.nextPageCursors);
      setHasMore(loadedJobPage.hasMore);
    } catch {
      if (isCurrent()) setHasError(true);
    } finally {
      if (isCurrent()) {
        loadingMoreRequest.current = null;
        setIsLoadingMore(false);
      }
    }
  }

  function resetPagination() {
    setPageCursors(initialPageCursors());
    setHasMore(false);
  }

  function replaceJob(updatedJob) {
    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === updatedJob.id ? updatedJob : job)),
    );
  }

  function removeJob(jobId) {
    setJobs((currentJobs) => currentJobs.filter((job) => job.id !== jobId));
  }

  return {
    jobs,
    isLoading: isWorklistLoading,
    hasError,
    filters,
    cleaners,
    hasMore,
    isLoadingMore,
    setFilters,
    resetPagination,
    loadMore,
    replaceJob,
    removeJob,
  };
}
