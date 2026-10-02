import { useCallback, useEffect, useRef, useState } from "react";
import { getOperationalDashboard } from "./dashboardService.js";

export const dashboardLoadDeadlineMs = 20_000;

export function useDashboardController({ view }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const attemptRef = useRef(null);

  const cancelAttempt = useCallback(() => {
    const attempt = attemptRef.current;
    attemptRef.current = null;
    if (attempt) {
      clearTimeout(attempt.timer);
      attempt.resolve();
    }
  }, []);

  const refresh = useCallback(() => {
    if (view !== "dashboard") return Promise.resolve();
    cancelAttempt();
    setIsLoading(true);
    setHasError(false);

    return new Promise((resolve) => {
      const attempt = { expiresAt: Date.now() + dashboardLoadDeadlineMs, resolve };
      attemptRef.current = attempt;
      const finish = (failed, data) => {
        if (attemptRef.current !== attempt) return;
        // A suspended browser may deliver the response before the overdue timer.
        const expired = Date.now() >= attempt.expiresAt;
        cancelAttempt();
        if (!failed && !expired) setDashboardData(data);
        setHasError(failed || expired);
        setIsLoading(false);
      };
      attempt.expire = () => {
        if (Date.now() >= attempt.expiresAt) finish(true);
      };
      attempt.timer = setTimeout(() => finish(true), dashboardLoadDeadlineMs);
      // The SDK reads cannot be cancelled; only this generation may publish state.
      Promise.resolve().then(() => {
        if (attemptRef.current === attempt) return getOperationalDashboard();
        return undefined;
      }).then(
        (data) => finish(false, data),
        () => finish(true),
      );
    });
  }, [view, cancelAttempt]);

  useEffect(() => {
    if (view === "dashboard") {
      void refresh();
    }
    return cancelAttempt;
  }, [view, refresh, cancelAttempt]);

  useEffect(() => {
    if (view !== "dashboard") return undefined;
    const checkDeadline = () => attemptRef.current?.expire();
    window.addEventListener("pageshow", checkDeadline);
    document.addEventListener("visibilitychange", checkDeadline);
    return () => {
      window.removeEventListener("pageshow", checkDeadline);
      document.removeEventListener("visibilitychange", checkDeadline);
    };
  }, [view]);

  return { dashboardData, isLoading, hasError, refresh };
}
