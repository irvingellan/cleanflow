import { useEffect, useMemo, useRef, useState } from "react";
import { cleanerMessagingWorkerPath, cleanerPushReceiptEvent } from "./cleanerPushBinding.js";
import {
  cleanerPushCanEnable, cleanerPushPairingReference, enableCleanerPush, inspectCleanerPush, refreshCleanerPush, sendCleanerPushSelfTest,
  syncCleanerPushReceipts,
} from "./cleanerPushService.js";

const resumeIntervalMs = 60_000;
const refreshIntervalMs = 15 * 60_000;

export function useCleanerNotificationSettings({ session, active, platform, displayMode, language }) {
  const [result, setResult] = useState({ sessionId: null, state: "checking" });
  const [test, setTest] = useState({ sessionId: null, state: null });
  const [receiptStatus, setReceiptStatus] = useState(null);
  const current = useRef(null);
  const options = useMemo(() => ({ platform, standalone: displayMode === "standalone", language }), [platform, displayMode, language]);
  useEffect(() => {
    if (!active) return undefined;
    let syncing = false;
    let syncAgain = false;
    const syncReceipts = async () => {
      if (current.current !== context) return;
      syncAgain = true;
      if (syncing) return;
      syncing = true;
      while (syncAgain && current.current === context) {
        syncAgain = false;
        const latestTest = await syncCleanerPushReceipts(session).catch(() => undefined);
        if (latestTest !== undefined && current.current === context) {
          setReceiptStatus({ sessionId: session.sessionId, latestTest });
        }
      }
      syncing = false;
    };
    const context = { session, operation: 0, busy: false, syncReceipts, sendingTest: false, testWentHidden: false };
    current.current = context;
    let lastResume = Date.now();
    let lastRefresh = 0;
    const update = async (action) => {
      if (current.current !== context || context.busy) return;
      const operation = ++context.operation;
      const state = await action(session, options).catch(() => "error");
      if (current.current === context && context.operation === operation) setResult({ sessionId: session.sessionId, state });
    };
    void syncReceipts();
    void update(refreshCleanerPush);
    const resume = (event) => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        if (context.sendingTest) context.testWentHidden = true;
        return;
      }
      if (event.type === "visibilitychange" || event.type === "online") void syncReceipts();
      if (event.type !== "online" && now - lastResume < resumeIntervalMs) return;
      lastResume = now;
      if (now - lastRefresh > refreshIntervalMs && globalThis.Notification?.permission === "granted") {
        lastRefresh = now;
        void update(refreshCleanerPush).then(syncReceipts);
      } else {
        void update(inspectCleanerPush);
      }
    };
    const onReceipt = (event) => {
      if (event.data?.type === cleanerPushReceiptEvent
        && event.source?.scriptURL === new URL(cleanerMessagingWorkerPath, window.location.origin).href) void syncReceipts();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    navigator.serviceWorker?.addEventListener?.("message", onReceipt);
    return () => {
      if (current.current === context) current.current = null;
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      navigator.serviceWorker?.removeEventListener?.("message", onReceipt);
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
    recheck: () => { void current.current?.syncReceipts(); return act(refreshCleanerPush); },
    testState: active && test.sessionId === session.sessionId ? test.state : null,
    testRetryAfterSeconds: test.retryAfterSeconds ?? 60,
    latestTest: active && receiptStatus?.sessionId === session.sessionId ? receiptStatus.latestTest : null,
    test: async () => {
      const context = current.current;
      if (!context || context.session !== session || context.sendingTest) return;
      context.sendingTest = true;
      context.testWentHidden = false;
      setTest({ sessionId: session.sessionId, state: "sending" });
      const outcome = await sendCleanerPushSelfTest(session).catch((error) => {
        const interrupted = error?.name === "AbortError" || error instanceof TypeError
          || ["functions/internal", "functions/unavailable", "functions/deadline-exceeded", "functions/cancelled"].includes(error?.code);
        const appWasHidden = context.testWentHidden || document.visibilityState === "hidden";
        return { state: interrupted && appWasHidden ? "interrupted" : "error" };
      });
      context.sendingTest = false;
      if (current.current === context) {
        setTest({ sessionId: session.sessionId, state: outcome?.state || "error", retryAfterSeconds: outcome?.retryAfterSeconds });
        if (document.visibilityState !== "hidden") void context.syncReceipts();
      }
    },
  };
}
