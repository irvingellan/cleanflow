import { useEffect, useState } from "react";

const loading = { data: null, isLoading: true, errorKind: null };

function permanentlyUnavailable(error) {
  return error?.retryable === false || error?.status === 404 || error?.status === 410;
}

export function usePortalRead(load) {
  const [state, setState] = useState(loading);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let generation = 0;
    let controller;
    let unavailable = false;
    let suspended = document.visibilityState === "hidden";
    let resumedFromVisibility = false;

    function abort() {
      generation += 1;
      controller?.abort();
    }

    async function read(fromVisibility = false) {
      if (unavailable || document.visibilityState === "hidden") return;
      abort();
      resumedFromVisibility = fromVisibility;
      const expected = generation;
      controller = new AbortController();
      setState((current) => current.data ? current : loading);
      try {
        const data = await load(controller.signal);
        if (generation === expected) setState({ data, isLoading: false, errorKind: null });
      } catch (error) {
        if (generation !== expected) return;
        if (permanentlyUnavailable(error)) {
          unavailable = true;
          setState({ data: null, isLoading: false, errorKind: "permanent" });
        } else {
          setState((current) => current.data ? current : { data: null, isLoading: false, errorKind: "retryable" });
        }
      } finally {
        if (generation === expected) resumedFromVisibility = false;
      }
    }

    function hide() {
      suspended = true;
      resumedFromVisibility = false;
      abort();
    }

    function visibility() {
      if (document.visibilityState === "hidden") hide();
      else if (document.visibilityState === "visible" && suspended) {
        suspended = false;
        void read(true);
      }
    }

    function show(event) {
      if (!event.persisted || document.visibilityState === "hidden") return;
      // Some resumes announce both events while the same read is in flight.
      if (resumedFromVisibility) return;
      suspended = false;
      void read();
    }

    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    document.addEventListener("visibilitychange", visibility);
    if (!suspended) void read();
    return () => {
      abort();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, attempt]);

  return { ...state, retry: () => setAttempt((current) => current + 1) };
}
