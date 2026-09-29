import { useEffect, useMemo, useState } from "react";
import {
  getManagerOperationEvents,
  getManagerPageLoadEvents,
  groupRecentJobDetailVisits,
  summarizeManagerOperationEvents,
  summarizeManagerPageLoadEvents,
} from "./managerPageLoadDiagnosticsService.js";

export function useManagerPageLoadDiagnostics() {
  const [windowDays, setWindowDays] = useState(7);
  const [events, setEvents] = useState([]);
  const [operationEvents, setOperationEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [operationIsLoading, setOperationIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [operationHasError, setOperationHasError] = useState(false);
  const [pageFilter, setPageFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setHasError(false);
    setOperationIsLoading(true);
    setOperationHasError(false);
    getManagerPageLoadEvents({ windowDays })
      .then((loadedEvents) => {
        if (current) setEvents(loadedEvents);
      })
      .catch(() => {
        if (current) setHasError(true);
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    getManagerOperationEvents({ windowDays })
      .then((loadedEvents) => {
        if (current) setOperationEvents(loadedEvents);
      })
      .catch(() => {
        if (current) setOperationHasError(true);
      })
      .finally(() => {
        if (current) setOperationIsLoading(false);
      });
    return () => { current = false; };
  }, [reloadKey, windowDays]);

  const filteredEvents = useMemo(() => events.filter((event) => (
    (pageFilter === "all" || event.page === pageFilter)
      && (userFilter === "all" || event.uid === userFilter)
      && (deviceFilter === "all" || `${event.browser}/${event.platform}` === deviceFilter)
  )), [deviceFilter, events, pageFilter, userFilter]);

  const filteredOperationEvents = useMemo(() => operationEvents.filter((event) => (
    (pageFilter === "all" || event.page === pageFilter)
      && (userFilter === "all" || event.uid === userFilter)
      && (deviceFilter === "all" || `${event.browser}/${event.platform}` === deviceFilter)
  )), [deviceFilter, operationEvents, pageFilter, userFilter]);

  const summary = useMemo(() => summarizeManagerPageLoadEvents(filteredEvents), [filteredEvents]);
  const operationSummary = useMemo(() => summarizeManagerOperationEvents(filteredOperationEvents), [filteredOperationEvents]);
  const jobDetailVisits = useMemo(() => groupRecentJobDetailVisits(filteredOperationEvents), [filteredOperationEvents]);
  const users = useMemo(() => [...new Set([...events, ...operationEvents].map((event) => event.uid).filter(Boolean))].sort(), [events, operationEvents]);
  const devices = useMemo(() => [...new Set([...events, ...operationEvents].map((event) => `${event.browser}/${event.platform}`))].sort(), [events, operationEvents]);

  return {
    windowDays,
    setWindowDays,
    pageFilter,
    setPageFilter,
    userFilter,
    setUserFilter,
    deviceFilter,
    setDeviceFilter,
    events: filteredEvents,
    summary,
    operationEvents: filteredOperationEvents,
    operationSummary,
    jobDetailVisits,
    users,
    devices,
    isLoading,
    hasError,
    operationIsLoading,
    operationHasError,
    refresh: () => setReloadKey((key) => key + 1),
  };
}
