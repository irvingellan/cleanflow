import { useEffect, useRef } from "react";
import { recordManagerPageLoad } from "./managerPageLoadService.js";

const pageByView = {
  dashboard: "dashboard",
  "job-list": "jobs",
  "property-list": "properties",
  "client-list": "clients",
  "cleaner-list": "cleaners",
  "payout-list": "payouts",
};

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function nextFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") return globalThis.requestAnimationFrame(callback);
  return setTimeout(callback, 0);
}

function cancelFrame(identifier) {
  if (typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(identifier);
  else clearTimeout(identifier);
}

/** Records one completed manager page entry after its main loading state settles. */
export function useManagerPageLoadTelemetry({ user, view, pageStates }) {
  const cycleRef = useRef(null);

  useEffect(() => {
    const page = pageByView[view];
    if (!page || !user?.uid || user.isAnonymous) {
      cycleRef.current = null;
      return undefined;
    }

    const cycle = { page, startedAt: now(), reported: false };
    cycleRef.current = cycle;
    return () => {
      if (cycleRef.current === cycle) cycleRef.current = null;
    };
  }, [user?.isAnonymous, user?.uid, view]);

  const page = pageByView[view];
  const state = page ? pageStates?.[page] : null;

  useEffect(() => {
    const cycle = cycleRef.current;
    if (!cycle || cycle.page !== page || cycle.reported || state?.isLoading) return undefined;

    const dataDurationMs = now() - cycle.startedAt;
    const frame = nextFrame(() => {
      if (cycleRef.current !== cycle || cycle.reported) return;
      cycle.reported = true;
      // This is intentionally not awaited: a diagnostic write must never delay the page.
      void recordManagerPageLoad({
        page: cycle.page,
        durationMs: now() - cycle.startedAt,
        dataDurationMs,
        result: state?.hasError ? "error" : "success",
        uid: user.uid,
      });
    });

    return () => cancelFrame(frame);
  }, [page, state?.hasError, state?.isLoading, user?.uid]);
}
