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
export function useJobsWorklist({ view, preserveLoadedJobs = false, includeArchived = false }) {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [filters, setFilters] = useState(createJobListFilters);
  const [cleaners, setCleaners] = useState([]);
  const [pageCursors, setPageCursors] = useState(initialPageCursors);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const queryGeneration = useRef(0);
  const previousViewRef = useRef(view);
  const isEnteringJobList =
    view === "job-list" && previousViewRef.current !== "job-list";
  const isWorklistLoading = isLoading || isEnteringJobList;

  useEffect(() => {
    previousViewRef.current = view;
    queryGeneration.current += 1;
    setIsLoadingMore(false);

    if (view !== "job-list") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoading(true);
    setHasError(false);

    async function loadJobs() {
      try {
        const [loadedJobPage, loadedCleaners] = await Promise.all([
          getJobs(filters, { includeArchived }),
          getAllCleaners(),
        ]);

        if (isCurrent) {
          setJobs((currentJobs) =>
            preserveLoadedJobs
              ? mergeJobs(currentJobs, loadedJobPage.jobs)
              : loadedJobPage.jobs,
          );
          setCleaners(loadedCleaners);
          setPageCursors(loadedJobPage.nextPageCursors);
          setHasMore(loadedJobPage.hasMore);
        }
      } catch {
        if (isCurrent) {
          setHasError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadJobs();

    return () => {
      isCurrent = false;
      queryGeneration.current += 1;
    };
  }, [view, filters.status, filters.datePreset, includeArchived]);

  async function loadMore() {
    const generation = queryGeneration.current;
    setIsLoadingMore(true);

    try {
      const loadedJobPage = await getJobs(filters, { ...pageCursors, includeArchived });
      if (generation === queryGeneration.current) {
        setJobs((currentJobs) => mergeJobs(currentJobs, loadedJobPage.jobs));
        setPageCursors(loadedJobPage.nextPageCursors);
        setHasMore(loadedJobPage.hasMore);
      }
    } catch {
      if (generation === queryGeneration.current) setHasError(true);
    } finally {
      if (generation === queryGeneration.current) setIsLoadingMore(false);
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

  function upsertJob(updatedJob) {
    setJobs((currentJobs) => mergeJobs(currentJobs, [updatedJob]));
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
    upsertJob,
  };
}
