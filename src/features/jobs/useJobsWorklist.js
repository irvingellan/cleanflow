import { useEffect, useState } from "react";
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
export function useJobsWorklist({ view }) {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [filters, setFilters] = useState(createJobListFilters);
  const [cleaners, setCleaners] = useState([]);
  const [pageCursors, setPageCursors] = useState(initialPageCursors);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    if (view !== "job-list") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoading(true);
    setHasError(false);

    async function loadJobs() {
      try {
        const [loadedJobPage, loadedCleaners] = await Promise.all([
          getJobs(filters),
          getAllCleaners(),
        ]);

        if (isCurrent) {
          setJobs(loadedJobPage.jobs);
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
    };
  }, [view, filters.status, filters.datePreset]);

  async function loadMore() {
    setIsLoadingMore(true);

    try {
      const loadedJobPage = await getJobs(filters, pageCursors);
      setJobs((currentJobs) => mergeJobs(currentJobs, loadedJobPage.jobs));
      setPageCursors(loadedJobPage.nextPageCursors);
      setHasMore(loadedJobPage.hasMore);
    } catch {
      setHasError(true);
    } finally {
      setIsLoadingMore(false);
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

  return {
    jobs,
    isLoading,
    hasError,
    filters,
    cleaners,
    hasMore,
    isLoadingMore,
    setFilters,
    resetPagination,
    loadMore,
    replaceJob,
  };
}
