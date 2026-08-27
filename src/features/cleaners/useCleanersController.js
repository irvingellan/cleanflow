import { useEffect, useState } from "react";
import {
  createCleaner,
  getAllCleaners,
  updateCleaner,
} from "./cleanerService.js";

/**
 * Owns Cleaner directory and profile state. The application shell still owns
 * the current screen and cross-feature navigation origins.
 */
export function useCleanersController({ view }) {
  const [directoryCleaners, setDirectoryCleaners] = useState([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [hasDirectoryError, setHasDirectoryError] = useState(false);
  const [selectedCleaner, setSelectedCleaner] = useState(null);
  const [savedCleaner, setSavedCleaner] = useState(null);

  useEffect(() => {
    if (view !== "cleaner-list") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingDirectory(true);
    setHasDirectoryError(false);

    async function loadDirectoryCleaners() {
      try {
        const cleaners = await getAllCleaners();

        if (isCurrent) {
          setDirectoryCleaners(cleaners);
        }
      } catch {
        if (isCurrent) {
          setHasDirectoryError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDirectory(false);
        }
      }
    }

    loadDirectoryCleaners();

    return () => {
      isCurrent = false;
    };
  }, [view]);

  function clearCleaner() {
    setSelectedCleaner(null);
    setSavedCleaner(null);
  }

  function openCleaner(cleaner) {
    setSelectedCleaner(cleaner);
    setSavedCleaner(null);
  }

  function clearSavedCleaner() {
    setSavedCleaner(null);
  }

  async function saveCleaner(cleaner, values) {
    const savedProfile = cleaner
      ? await updateCleaner(cleaner.id, values)
      : await createCleaner(values);

    if (!cleaner) {
      const createdCleaner = { ...savedProfile, wasCreated: true };
      setSavedCleaner(createdCleaner);
      return createdCleaner;
    }

    // Preserve the existing document ID and local legacy fields while reflecting the edit.
    const updatedCleaner = { ...cleaner, ...savedProfile };
    setSelectedCleaner(updatedCleaner);
    setDirectoryCleaners((currentCleaners) =>
      currentCleaners.map((currentCleaner) =>
        currentCleaner.id === updatedCleaner.id
          ? { ...currentCleaner, ...updatedCleaner }
          : currentCleaner,
      ),
    );

    const savedUpdate = { ...updatedCleaner, wasCreated: false };
    setSavedCleaner(savedUpdate);
    return savedUpdate;
  }

  return {
    directory: {
      cleaners: directoryCleaners,
      isLoading: isLoadingDirectory,
      hasError: hasDirectoryError,
    },
    profile: {
      selectedCleaner,
      savedCleaner,
      clearCleaner,
      openCleaner,
      clearSavedCleaner,
      saveCleaner,
    },
  };
}
