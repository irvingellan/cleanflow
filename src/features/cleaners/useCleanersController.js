import { useEffect, useState } from "react";
import {
  createCleaner,
  archiveCleaner,
  getAllCleaners,
  updateCleaner,
  updateCleanerDataProvenance,
  restoreCleaner,
} from "./cleanerService.js";

/**
 * Owns Cleaner directory and profile state. The application shell still owns
 * the current screen and cross-feature navigation origins.
 */
export function useCleanersController({ view, actorUid, includeArchived = false }) {
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
        const cleaners = await getAllCleaners({ includeArchived });

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
  }, [view, includeArchived]);

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

  async function saveDataProvenance(cleaner, dataProvenance) {
    const cleanerUpdate = await updateCleanerDataProvenance(
      cleaner.id,
      dataProvenance,
      actorUid,
    );
    const updatedCleaner = { ...cleaner, ...cleanerUpdate };

    setSelectedCleaner(updatedCleaner);
    setDirectoryCleaners((currentCleaners) =>
      currentCleaners.map((currentCleaner) =>
        currentCleaner.id === updatedCleaner.id
          ? updatedCleaner
          : currentCleaner,
      ),
    );

    return updatedCleaner;
  }

  async function archive(cleaner) {
    await archiveCleaner(cleaner.id, actorUid);
    setDirectoryCleaners((current) => current.filter((item) => item.id !== cleaner.id));
  }

  async function restore(cleaner) {
    await restoreCleaner(cleaner.id, actorUid);
    const restored = { ...cleaner, archivedAt: null };
    setSelectedCleaner(restored);
    setDirectoryCleaners((current) => current.map((item) => item.id === cleaner.id ? restored : item));
    return restored;
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
      saveDataProvenance,
      archive,
      restore,
    },
  };
}
