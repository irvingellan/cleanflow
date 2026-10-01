import { useCallback, useEffect, useRef, useState } from "react";
import { recordManagerAccessDiagnostic } from "./managerAccessDiagnostics.js";
import { subscribeToManagerAccess, verifyManagerAccess } from "./managerAccessService.js";

export const managerAccessDeadlineMs = 7_000;
export const managerAccessOuterDeadlineMs = 18_000;
const lifecycleDebounceMs = 250;
const lifecycleCooldownMs = 1_000;

function errorReason(error) {
  const code = String(error?.code || "").replace(/^firestore\//, "");
  return ["permission-denied", "unauthenticated", "unavailable"].includes(code) ? code : "unknown";
}

/** A deadline invalidates an attempt; it does not cancel the Firebase Promise. */
export function useManagerAccess(user) {
  const identity = `${user?.uid || ""}:${Boolean(user?.isAnonymous)}`;
  const [access, setAccess] = useState({ identity, status: "loading" });
  const retryRef = useRef(() => {});
  const retry = useCallback(() => retryRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let attempt = 0;
    let status = "loading";
    let startedAt = 0;
    let lastLifecycleRetryAt = -Infinity;
    let lastLifecycleSuppressedAt = -Infinity;
    let sessionStartedAt = 0;
    let outerDeadlineAt;
    let outerExpired = false;
    let verifying = false;
    let outerWatchdog;
    let watchdog;
    let lifecycleTimer;
    let unsubscribe = () => {};
    const subject = { uid: user?.uid, isAnonymous: user?.isAnonymous };
    const offline = () => navigator.onLine === false;
    const update = (next) => {
      status = next;
      if (!disposed) setAccess({ identity, status: next });
    };
    const stopAttempt = () => {
      generation += 1;
      verifying = false;
      clearTimeout(watchdog);
      unsubscribe();
      unsubscribe = () => {};
    };

    function clearOuterDeadline() {
      clearTimeout(outerWatchdog);
      outerDeadlineAt = undefined;
    }

    function expireSession() {
      if (disposed || outerExpired || outerDeadlineAt === undefined) return;
      outerExpired = true;
      clearOuterDeadline();
      stopAttempt();
      clearTimeout(lifecycleTimer);
      lifecycleTimer = undefined;
      recordManagerAccessDiagnostic("outer_deadline_expired", {
        attempt, durationMs: Date.now() - sessionStartedAt, reason: "timeout",
      });
      update(offline() ? "offline" : "error");
    }

    function deadlineExceeded() {
      // Resume/late Promise callbacks can run before a suspended browser's timer.
      if (outerDeadlineAt !== undefined && Date.now() >= outerDeadlineAt) expireSession();
      return outerExpired;
    }

    function ensureOuterDeadline() {
      if (deadlineExceeded()) return false;
      if (outerDeadlineAt === undefined) {
        sessionStartedAt = Date.now();
        outerDeadlineAt = sessionStartedAt + managerAccessOuterDeadlineMs;
        outerWatchdog = setTimeout(expireSession, managerAccessOuterDeadlineMs);
      }
      return true;
    }

    function startAttempt(reconnecting = false, retriesRemaining = 1) {
      stopAttempt();
      if (disposed) return;
      if (!subject.uid || subject.isAnonymous) {
        clearOuterDeadline();
        update("denied");
        return;
      }
      if (offline()) {
        update("offline");
        return;
      }
      if (!ensureOuterDeadline()) return;

      const currentGeneration = generation;
      const isCurrent = () => !disposed && generation === currentGeneration && !deadlineExceeded();
      const currentAttempt = ++attempt;
      startedAt = Date.now();
      verifying = true;
      update(reconnecting ? "reconnecting" : "loading");
      recordManagerAccessDiagnostic("access_verification_started", { attempt: currentAttempt });

      function fail(reason, stage) {
        if (!isCurrent()) return;
        recordManagerAccessDiagnostic(stage, {
          attempt: currentAttempt, durationMs: Date.now() - startedAt, reason,
        });
        stopAttempt();
        // A listener failure after authorization starts a new bounded recovery,
        // but lifecycle/automatic retries share any still-unresolved deadline.
        ensureOuterDeadline();
        if (offline()) update("offline");
        else if (retriesRemaining > 0) startAttempt(true, retriesRemaining - 1);
        else update("error");
      }

      watchdog = setTimeout(() => fail("timeout", "verification_timeout"), managerAccessDeadlineMs);
      void Promise.resolve().then(() => {
        if (isCurrent()) return verifyManagerAccess(subject);
      }).then((allowed) => {
        if (!isCurrent()) return;
        clearTimeout(watchdog);
        verifying = false;
        recordManagerAccessDiagnostic(allowed ? "server_membership_confirmed" : "access_denied", {
          attempt: currentAttempt, durationMs: Date.now() - startedAt,
        });
        update(allowed ? "allowed" : "denied");
        if (!allowed) {
          clearOuterDeadline();
          return;
        }
        if (reconnecting) recordManagerAccessDiagnostic("recovered_after_retry", { attempt: currentAttempt });

        let cacheSeen = false;
        const stopListener = subscribeToManagerAccess(subject, (stillAllowed) => {
          if (!isCurrent()) return;
          update(stillAllowed ? "allowed" : "denied");
          if (!stillAllowed) recordManagerAccessDiagnostic("access_denied", { attempt: currentAttempt });
        }, (error) => fail(errorReason(error), "listener_error"), () => {
          if (isCurrent() && !cacheSeen) {
            cacheSeen = true;
            recordManagerAccessDiagnostic("cache_snapshot_seen", { attempt: currentAttempt });
          }
        });
        if (isCurrent()) {
          unsubscribe = stopListener;
          // A synchronous listener failure must not reset the unresolved budget.
          clearOuterDeadline();
        } else stopListener();
      }).catch((error) => fail(errorReason(error), "verification_error"));
    }

    function lifecycleRetry(reason) {
      if (disposed || status === "allowed" || status === "denied" || lifecycleTimer) return;
      const now = Date.now();
      if (deadlineExceeded() || verifying) {
        if (now - lastLifecycleSuppressedAt >= lifecycleCooldownMs) {
          lastLifecycleSuppressedAt = now;
          recordManagerAccessDiagnostic("lifecycle_retry_suppressed", { attempt, reason });
        }
        return;
      }
      const delay = Math.max(lifecycleDebounceMs,
        startedAt + lifecycleCooldownMs - now, lastLifecycleRetryAt + lifecycleCooldownMs - now);
      lifecycleTimer = setTimeout(() => {
        lifecycleTimer = undefined;
        if (disposed || status === "allowed" || status === "denied" || verifying || deadlineExceeded()) return;
        const now = Date.now();
        lastLifecycleRetryAt = now;
        recordManagerAccessDiagnostic("lifecycle_retry", { attempt, reason });
        startAttempt(true);
      }, delay);
    }
    const onPageShow = () => lifecycleRetry("pageshow");
    const onOnline = () => lifecycleRetry("online");
    const onVisible = () => {
      if (document.visibilityState === "visible") lifecycleRetry("visible");
    };
    retryRef.current = () => {
      clearTimeout(lifecycleTimer);
      lifecycleTimer = undefined;
      clearOuterDeadline();
      outerExpired = false;
      recordManagerAccessDiagnostic("manual_retry", { attempt, reason: "manual" });
      startAttempt(true);
    };

    recordManagerAccessDiagnostic("auth_resolved");
    startAttempt();
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      retryRef.current = () => {};
      stopAttempt();
      clearOuterDeadline();
      clearTimeout(lifecycleTimer);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [identity]);

  // Do not show the previous user's operational UI even for the render before effect cleanup.
  return { status: access.identity === identity ? access.status : "loading", retry };
}
