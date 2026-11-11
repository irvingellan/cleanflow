import { useEffect, useState } from "react";
import { subscribeToAuthState } from "./authService.js";
import { recordManagerAccessDiagnostic } from "./managerAccessDiagnostics.js";

export const managerAuthDeadlineMs = 12_000;

export function useInitialManagerSession(enabled) {
  const [authUser, setAuthUser] = useState(undefined);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(1);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    let resolved = false;
    let reported = false;
    let startedAt = Date.now();
    let timer;
    let sawOffline = navigator.onLine === false;
    let recovered = false;

    function expire(force) {
      if (!active || resolved || reported || (force !== true && Date.now() - startedAt < managerAuthDeadlineMs)) return;
      reported = true;
      const offline = navigator.onLine === false;
      setStatus(offline ? "offline" : "error");
      recordManagerAccessDiagnostic("auth_restore_timeout", {
        attempt, durationMs: Date.now() - startedAt, reason: offline ? "offline" : "timeout",
      });
    }

    function start(reason) {
      startedAt = Date.now();
      reported = false;
      clearTimeout(timer);
      setStatus(navigator.onLine === false ? "offline" : "loading");
      recordManagerAccessDiagnostic("auth_restore_started", { attempt, reason });
      timer = setTimeout(() => expire(true), managerAuthDeadlineMs);
    }

    function onOffline() {
      if (!resolved) {
        sawOffline = true;
        setStatus("offline");
      }
    }

    function onOnline() {
      if (resolved || !sawOffline || recovered || navigator.onLine === false) return;
      recovered = true;
      // Keep the Firebase observer subscribed: it can settle on its own after
      // reconnecting. This is one new UI window, not a new sign-in request.
      start("online");
    }

    const onVisible = () => { if (document.visibilityState === "visible") expire(); };
    start(attempt > 1 ? "manual" : undefined);
    let stop = () => {};
    try {
      stop = subscribeToAuthState((next) => {
        if (!active || next === undefined) return;
        if (!resolved) {
          recordManagerAccessDiagnostic("auth_restore_resolved", {
            attempt, durationMs: Date.now() - startedAt,
          });
        }
        resolved = true;
        clearTimeout(timer);
        setAuthUser(next);
        setStatus("resolved");
      });
    } catch {
      reported = true;
      clearTimeout(timer);
      setStatus("error");
      recordManagerAccessDiagnostic("auth_restore_error", { attempt, reason: "unknown" });
    }
    window.addEventListener("pageshow", expire);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      stop();
      window.removeEventListener("pageshow", expire);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, attempt]);

  return {
    authUser,
    status,
    retry: () => {
      if (status !== "offline" && status !== "error") return;
      setAttempt((value) => value + 1);
    },
  };
}
