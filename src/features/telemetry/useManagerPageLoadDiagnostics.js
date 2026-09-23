import { useEffect, useMemo, useState } from "react";
import { getManagerPageLoadEvents, summarizeManagerPageLoadEvents } from "./managerPageLoadDiagnosticsService.js";

export function useManagerPageLoadDiagnostics() {
  const [windowDays, setWindowDays] = useState(7);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [pageFilter, setPageFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setHasError(false);
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
    return () => { current = false; };
  }, [reloadKey, windowDays]);

  const filteredEvents = useMemo(() => events.filter((event) => (
    (pageFilter === "all" || event.page === pageFilter)
      && (userFilter === "all" || event.uid === userFilter)
      && (deviceFilter === "all" || `${event.browser}/${event.platform}` === deviceFilter)
  )), [deviceFilter, events, pageFilter, userFilter]);

  const summary = useMemo(() => summarizeManagerPageLoadEvents(filteredEvents), [filteredEvents]);
  const users = useMemo(() => [...new Set(events.map((event) => event.uid).filter(Boolean))].sort(), [events]);
  const devices = useMemo(() => [...new Set(events.map((event) => `${event.browser}/${event.platform}`))].sort(), [events]);

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
    users,
    devices,
    isLoading,
    hasError,
    refresh: () => setReloadKey((key) => key + 1),
  };
}
