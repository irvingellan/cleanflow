import { useEffect, useMemo, useRef, useState } from "react";
import { cleanerPushCanEnable, cleanerPushPairingReference, enableCleanerPush, inspectCleanerPush, refreshCleanerPush } from "./cleanerPushService.js";

const resumeIntervalMs = 60_000;
const refreshIntervalMs = 15 * 60_000;

export function useCleanerNotificationSettings({ session, active, platform, displayMode, language }) {
  const [result, setResult] = useState({ sessionId: null, state: "checking" });
  const current = useRef(null);
  const options = useMemo(() => ({ platform, standalone: displayMode === "standalone", language }), [platform, displayMode, language]);
  useEffect(() => {
    if (!active) return undefined;
    const context = { session, operation: 0, busy: false };
    current.current = context;
    let lastResume = Date.now();
    let lastRefresh = 0;
    const update = async (action) => {
      if (current.current !== context || context.busy) return;
      const operation = ++context.operation;
      const state = await action(session, options).catch(() => "error");
      if (current.current === context && context.operation === operation) setResult({ sessionId: session.sessionId, state });
    };
    void update(inspectCleanerPush);
    const resume = (event) => {
      const now = Date.now();
      if (document.visibilityState === "hidden" || (event.type !== "online" && now - lastResume < resumeIntervalMs)) return;
      lastResume = now;
      if (now - lastRefresh > refreshIntervalMs && globalThis.Notification?.permission === "granted") {
        lastRefresh = now;
        void update(refreshCleanerPush);
      } else {
        void update(inspectCleanerPush);
      }
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      if (current.current === context) current.current = null;
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [active, options, session]);

  async function act(action) {
    const context = current.current;
    if (!context || context.session !== session || context.busy) return;
    context.busy = true;
    const operation = ++context.operation;
    setResult({ sessionId: session.sessionId, state: "checking" });
    try {
      const state = await action(session, options).catch(() => "error");
      if (current.current === context && context.operation === operation) setResult({ sessionId: session.sessionId, state });
    } finally {
      context.busy = false;
    }
  }

  return {
    state: active && result.sessionId === session.sessionId ? result.state : "checking",
    pairingReference: active && result.sessionId === session.sessionId && result.state === "pilot-ineligible"
      ? cleanerPushPairingReference(session) : null,
    canEnable: active && cleanerPushCanEnable(session),
    enable: () => act(enableCleanerPush),
    recheck: () => act(inspectCleanerPush),
  };
}
