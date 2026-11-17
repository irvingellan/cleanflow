import { useEffect, useRef, useState } from "react";
import {
  isManagerLoadDiagnosticsPath,
  isWeeklyClosePreviewPath,
} from "../../app/entryRoute.js";

/** The manager's current view and section, where a detail was opened from, and the address of the URL-entered views. */
export function useManagerNavigation() {
  const [activeSection, setActiveSection] = useState(() => (
    isManagerLoadDiagnosticsPath() ? "dev-center" : isWeeklyClosePreviewPath() ? "payouts" : "dashboard"
  ));
  const [view, setView] = useState(() => (
    isManagerLoadDiagnosticsPath() ? "load-time-diagnostics" : isWeeklyClosePreviewPath() ? "weekly-close-preview" : "dashboard"
  ));
  const homeNoticeRequest = useRef(0);
  const currentView = useRef(view);
  if (currentView.current !== view) {
    currentView.current = view;
    homeNoticeRequest.current += 1;
  }
  useEffect(() => () => { homeNoticeRequest.current += 1; }, []);
  const [jobDetailOrigin, setJobDetailOrigin] = useState("jobs");
  const [jobDetailInitialFocus, setJobDetailInitialFocus] = useState(null);
  const [jobsScrollRestore, setJobsScrollRestore] = useState(null);
  const [propertyDetailOrigin, setPropertyDetailOrigin] = useState("properties");

  useEffect(() => {
    if (view !== "load-time-diagnostics" && isManagerLoadDiagnosticsPath()) {
      window.history.replaceState(window.history.state, "", "/");
    }
    if (view !== "weekly-close-preview" && isWeeklyClosePreviewPath()) {
      window.history.replaceState(window.history.state, "", "/");
    }
  }, [view]);

  function showPropertyClientLink() {
    setView("property-link-client");
  }

  function showEditProperty() {
    setView("property-edit");
  }

  function showEditClient() {
    setView("client-edit");
  }

  return {
    activeSection,
    setActiveSection,
    view,
    setView,
    homeNoticeRequest,
    currentView,
    jobDetailOrigin,
    setJobDetailOrigin,
    jobDetailInitialFocus,
    setJobDetailInitialFocus,
    jobsScrollRestore,
    setJobsScrollRestore,
    propertyDetailOrigin,
    setPropertyDetailOrigin,
    showPropertyClientLink,
    showEditProperty,
    showEditClient,
  };
}
