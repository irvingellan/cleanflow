import { useCallback, useEffect, useRef, useState } from "react";
import { recordManagerAccessDiagnostic } from "../auth/managerAccessDiagnostics.js";
import { getOperationalDashboard } from "./dashboardService.js";

export const dashboardLoadDeadlineMs = 20_000;
const recoveryDelayMs = 500;
const transientReasons = new Set(["timeout", "unavailable", "deadline-exceeded", "offline", "firestore-unknown"]);
const knownErrors = new Set([
  "unavailable", "deadline-exceeded", "permission-denied", "unauthenticated", "resource-exhausted",
  "failed-precondition",
]);

function isOffline() {
  return navigator.onLine === false;
}

function canRecoverNow() {
  return !isOffline() && document.visibilityState !== "hidden";
}

function errorReason(error) {
  const code = typeof error?.code === "string" ? error.code.replace(/^firestore\//, "") : "";
  // Firestore Lite uses this code when a browser fetch fails before it receives
  // an HTTP status. Generic application exceptions must not replay the read.
  if (code === "unknown" && error.name === "FirebaseError") return "firestore-unknown";
  return knownErrors.has(code) ? code : "unknown";
}

export function useDashboardController({ view }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadRef = useRef(null);

  const cancelLoad = useCallback(() => {
    const load = loadRef.current;
    loadRef.current = null;
    if (!load) return;
    clearTimeout(load.recoveryTimer);
    load.attempt?.stop();
  }, []);

  const refresh = useCallback(() => {
    if (view !== "dashboard") return Promise.resolve();
    cancelLoad();
    const load = { count: 0, canRecover: true, waitingToRecover: false, attempt: null };
    loadRef.current = load;

    function startAttempt(recoveryReason) {
      if (loadRef.current !== load) return Promise.resolve();
      clearTimeout(load.recoveryTimer);
      load.waitingToRecover = false;
      if (recoveryReason && !canRecoverNow()) {
        load.waitingToRecover = true;
        return Promise.resolve();
      }
      if (isOffline()) {
        load.waitingToRecover = load.canRecover;
        setIsLoading(false);
        setHasError(true);
        recordManagerAccessDiagnostic("dashboard_load_error", { reason: "offline", attempt: load.count });
        return Promise.resolve();
      }

      const number = ++load.count;
      if (recoveryReason) {
        // Keep the existing recovery controls visible while the one retry runs.
        load.canRecover = false;
        recordManagerAccessDiagnostic("dashboard_recovery", { attempt: number, reason: recoveryReason });
      } else {
        setIsLoading(true);
        setHasError(false);
      }
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const expiresAt = startedAt + dashboardLoadDeadlineMs;
        const pendingPhases = new Map();
        const attempt = {
          stop() {
            clearTimeout(attempt.timer);
            load.attempt = null;
            resolve();
          },
          checkDeadline() {
            if (Date.now() >= expiresAt) finish("timeout");
          },
          offline() {
            if (isOffline()) finish("offline");
          },
        };
        load.attempt = attempt;
        const isCurrent = () => loadRef.current === load && load.attempt === attempt;
        const isActive = () => isCurrent() && Date.now() < expiresAt;

        function finish(failure, data) {
          if (!isCurrent()) return;
          // A suspended browser may deliver the response before the overdue timer.
          const reason = Date.now() >= expiresAt ? "timeout" : failure;
          attempt.stop();
          setIsLoading(false);
          setHasError(Boolean(reason));
          const durationMs = Date.now() - startedAt;
          if (!reason) {
            setDashboardData(data);
            recordManagerAccessDiagnostic("dashboard_load_ready", { attempt: number, durationMs });
            return;
          }

          const stage = reason === "timeout" ? "dashboard_load_timeout" : "dashboard_load_error";
          const pending = pendingPhases.size ? pendingPhases.keys() : [undefined];
          for (const phase of pending) {
            recordManagerAccessDiagnostic(stage, { attempt: number, durationMs, phase, reason });
          }
          if (!load.canRecover || !transientReasons.has(reason)) return;
          if (!canRecoverNow()) load.waitingToRecover = true;
          else load.recoveryTimer = setTimeout(() => { void startAttempt("auto"); }, recoveryDelayMs);
        }

        function onPhase(phase, state, error) {
          if (!isActive()) return;
          const now = Date.now();
          if (state === "started") {
            pendingPhases.set(phase, now);
            recordManagerAccessDiagnostic("dashboard_phase_started", {
              attempt: number, phase, durationMs: now - startedAt,
            });
          } else {
            const phaseStartedAt = pendingPhases.get(phase) ?? now;
            pendingPhases.delete(phase);
            recordManagerAccessDiagnostic("dashboard_phase_completed", {
              attempt: number, phase, durationMs: now - phaseStartedAt,
              ...(state === "error" ? { reason: errorReason(error) } : {}),
            });
          }
        }

        attempt.timer = setTimeout(() => finish("timeout"), dashboardLoadDeadlineMs);
        // The SDK reads cannot be canceled; only this generation may publish state.
        Promise.resolve().then(() => {
          if (!isActive()) return undefined;
          recordManagerAccessDiagnostic("dashboard_load_started", { attempt: number });
          return getOperationalDashboard({ isActive, onPhase });
        }).then(
          (data) => finish(undefined, data),
          (error) => finish(errorReason(error)),
        );
      });
    }

    load.onWake = (reason) => {
      load.attempt?.checkDeadline();
      if (load.waitingToRecover && canRecoverNow()) void startAttempt(reason);
    };
    return startAttempt();
  }, [view, cancelLoad]);

  useEffect(() => {
    if (view === "dashboard") {
      void refresh();
    }
    return cancelLoad;
  }, [view, refresh, cancelLoad]);

  useEffect(() => {
    if (view !== "dashboard") return undefined;
    const onPageShow = () => loadRef.current?.onWake("pageshow");
    const onOnline = () => loadRef.current?.onWake("online");
    const onOffline = () => loadRef.current?.attempt?.offline();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadRef.current?.onWake("visible");
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [view]);

  return { dashboardData, isLoading, hasError, refresh };
}
