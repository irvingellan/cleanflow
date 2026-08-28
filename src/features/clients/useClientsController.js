import { useEffect, useState } from "react";
import { getClientJobHistory } from "../jobs/jobService.js";
import { getPropertiesForClient } from "../properties/propertyService.js";
import { createClient, getClients } from "./clientService.js";

function emptyClientDetail() {
  return {
    properties: [],
    isLoadingProperties: false,
    hasPropertiesError: false,
    jobHistory: null,
    hasJobHistoryError: false,
  };
}

/**
 * Owns Client data and its explicit Property/Job read-model integration.
 * The application shell owns Client-to-Property/Job navigation origins.
 */
export function useClientsController({ view }) {
  const [clients, setClients] = useState([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [hasDirectoryError, setHasDirectoryError] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [detail, setDetail] = useState(emptyClientDetail);

  useEffect(() => {
    if (view !== "client-list") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingDirectory(true);
    setHasDirectoryError(false);

    async function loadClients() {
      try {
        const loadedClients = await getClients();

        if (isCurrent) {
          setClients(loadedClients);
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

    loadClients();

    return () => {
      isCurrent = false;
    };
  }, [view]);

  useEffect(() => {
    if (view !== "client-detail" || !selectedClient) {
      return undefined;
    }

    let isCurrent = true;
    setDetail({
      ...emptyClientDetail(),
      isLoadingProperties: true,
    });

    async function loadClientDetail() {
      let linkedProperties = [];
      let hasPropertiesError = false;

      try {
        linkedProperties = await getPropertiesForClient(selectedClient.id);
      } catch {
        hasPropertiesError = true;
      }

      if (isCurrent) {
        setDetail((currentDetail) => ({
          ...currentDetail,
          properties: linkedProperties,
          isLoadingProperties: false,
          hasPropertiesError,
        }));
      }

      try {
        const jobHistory = await getClientJobHistory(
          selectedClient.id,
          hasPropertiesError ? [] : linkedProperties.map((property) => property.id),
        );

        if (isCurrent) {
          setDetail((currentDetail) => ({ ...currentDetail, jobHistory }));
        }
      } catch {
        if (isCurrent) {
          setDetail((currentDetail) => ({ ...currentDetail, hasJobHistoryError: true }));
        }
      }
    }

    loadClientDetail();

    return () => {
      isCurrent = false;
    };
  }, [view, selectedClient]);

  function clearClient() {
    setSelectedClient(null);
    setDetail(emptyClientDetail());
  }

  function openClient(client) {
    setSelectedClient(client);
  }

  async function saveClient(values) {
    const client = await createClient(values);
    setClients((currentClients) => [...currentClients, client]);
    return client;
  }

  return {
    directory: {
      clients,
      isLoading: isLoadingDirectory,
      hasError: hasDirectoryError,
    },
    detail: {
      selectedClient,
      ...detail,
      clearClient,
      openClient,
    },
    saveClient,
  };
}
