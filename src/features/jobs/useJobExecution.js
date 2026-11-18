import { useEffect, useState } from "react";

/**
 * State of the start and completion controls in Job Detail's Checklist section. The completion controls reset
 * when another Job is shown.
 */
export function useJobExecution({ job, onStartCleaning, onCompleteCleaning, currentJobIdRef }) {
  const [isStartingCleaning, setIsStartingCleaning] = useState(false);
  const [hasStartCleaningError, setHasStartCleaningError] = useState(false);
  const [isCompletingCleaning, setIsCompletingCleaning] = useState(false);
  const [hasCompleteCleaningError, setHasCompleteCleaningError] = useState(false);
  const [isCompletionConfirmationVisible, setIsCompletionConfirmationVisible] = useState(false);

  useEffect(() => {
    setIsCompletionConfirmationVisible(false);
    setIsCompletingCleaning(false);
    setHasCompleteCleaningError(false);
  }, [job.id]);

  async function startCleaning() {
    setIsStartingCleaning(true);
    setHasStartCleaningError(false);

    try {
      await onStartCleaning();
    } catch {
      setHasStartCleaningError(true);
    } finally {
      setIsStartingCleaning(false);
    }
  }

  async function completeCleaning() {
    const jobId = job.id;
    setIsCompletingCleaning(true);
    setHasCompleteCleaningError(false);

    try {
      await onCompleteCleaning();
      if (currentJobIdRef.current === jobId) setIsCompletionConfirmationVisible(false);
    } catch {
      if (currentJobIdRef.current === jobId) setHasCompleteCleaningError(true);
    } finally {
      if (currentJobIdRef.current === jobId) setIsCompletingCleaning(false);
    }
  }

  return {
    isStartingCleaning, hasStartCleaningError, isCompletingCleaning, hasCompleteCleaningError,
    isCompletionConfirmationVisible, setIsCompletionConfirmationVisible, startCleaning, completeCleaning,
  };
}
