import { useCallback, useEffect, useRef, useState } from "react";
import * as defaultService from "./cleanerHubService.js";
import { buildCleanerAgenda, freshnessFor } from "./cleanerAgendaModel.js";

const systemClock = () => new Date();
const configuredInterval = Number(import.meta.env?.VITE_CLEANER_HUB_VERIFY_INTERVAL_MS);
export const serverVerifyIntervalMs = Number.isInteger(configuredInterval) && configuredInterval >= 2000 ? configuredInterval : 60000;
const verificationTimeoutMs = 10000;
const maximumVerificationAgeMs = serverVerifyIntervalMs + verificationTimeoutMs;
const emptyAgenda = { entries: [], hasSnapshot: false, fromCache: false, error: null, lastVerifiedAt: null };

function fingerprint(entries) {
  return entries.map((entry) => `${entry.id}:${entry.syncedAt?.toMillis?.() ?? entry.atMs ?? ""}`).sort().join("|");
}

function browserOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * Session, membership and live agenda for the signed-in cleaner. Private data
 * is dropped as soon as the membership is revoked or the session ends.
 */
export function useCleanerHub({ service = defaultService, clock = systemClock } = {}) {
  const [session, setSession] = useState({ status: "loading" });
  const [membership, setMembership] = useState({ state: "loading" });
  const [agenda, setAgenda] = useState(emptyAgenda);
  const [online, setOnline] = useState(browserOnline);
  const [attempt, setAttempt] = useState(0);
  const [, refreshClock] = useState(0);
  const sessionVersion = useRef(0);
  const liveSnapshot = useRef(null);

  useEffect(() => {
    let current;
    return service.subscribeCleanerSession((next) => {
      if (current?.status === next.status && current?.uid === next.uid
        && current?.organizationId === next.organizationId && current?.cleanerId === next.cleanerId
        && current?.sessionId === next.sessionId) return;
      current = next;
      sessionVersion.current += 1;
      liveSnapshot.current = null;
      setAgenda(emptyAgenda);
      setMembership({ state: "loading" });
      setSession(next);
    });
  }, [service]);

  useEffect(() => {
    const worker = navigator.serviceWorker;
    if (!worker) return undefined;
    let listening = true;
    const ready = { type: "CLEANFLOW_UPDATE_CLIENT_READY" };
    const acknowledge = (event) => {
      if (event.data?.type === "CLEANFLOW_UPDATE_AVAILABLE") event.source?.postMessage(ready);
    };
    // Acknowledge before the root worker's fallback reload. A normal reopen
    // loads the fresh document without interrupting access-code redemption.
    worker.addEventListener("message", acknowledge);
    worker.ready.then((registration) => {
      if (listening) registration.active?.postMessage(ready);
    }).catch(() => undefined);
    return () => {
      listening = false;
      worker.removeEventListener("message", acknowledge);
    };
  }, []);

  useEffect(() => {
    const reconnect = () => service.reconnectAgenda?.().catch(() => undefined);
    const update = () => {
      const isOnline = browserOnline();
      setOnline(isOnline);
      if (isOnline) reconnect();
    };
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      refreshClock((value) => value + 1);
      update();
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [service]);

  const signedIn = session.status === "signed-in";

  useEffect(() => {
    if (!signedIn) return undefined;
    const version = sessionVersion.current;
    let retryTimer;
    let cancelled = false;
    const stopMembership = service.subscribeMembership(session, (result) => {
      if (cancelled || version !== sessionVersion.current) return;
      if (result.state === "error") {
        setMembership((previous) => previous.state === "active" ? previous : result);
        setAgenda((previous) => ({ ...previous, error: "membership-unavailable" }));
        return;
      }
      setMembership(result);
    });
    const stopAgenda = service.subscribeAgenda(
      session,
      ({ entries, fromCache }) => {
        if (cancelled || version !== sessionVersion.current) return;
        if (fromCache) {
          setAgenda((previous) => ({ ...previous, fromCache: true }));
          return;
        }
        liveSnapshot.current = entries;
        setAgenda({ entries, hasSnapshot: true, fromCache: false, error: null, lastVerifiedAt: clock() });
      },
      (code) => {
        if (cancelled || version !== sessionVersion.current) return;
        setAgenda((previous) => ({ ...previous, error: code }));
        // Firestore ends a listener after an error. Keep the last confirmed list
        // labelled stale and reopen the listener with backoff.
        retryTimer = setTimeout(() => setAttempt((value) => value + 1), Math.min(30000, 2000 * 2 ** Math.min(attempt, 4)));
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      stopMembership();
      stopAgenda();
    };
  }, [signedIn, session, service, clock, attempt]);

  // Sticky until the page reloads: the notice must survive the sign-out it triggers.
  const [revoked, setRevoked] = useState(false);
  useEffect(() => {
    if (membership.state !== "revoked") return;
    setRevoked(true);
    setAgenda(emptyAgenda);
    service.signOutCleaner().catch(() => undefined);
  }, [membership.state, service]);

  useEffect(() => {
    if (!signedIn || membership.state !== "active" || !service.verifyFromServer) return undefined;
    const version = sessionVersion.current;
    let cancelled = false;
    let checking = false;
    let deadline;
    const check = async () => {
      if (checking || document.visibilityState !== "visible" || !browserOnline()) return;
      checking = true;
      const snapshotAtStart = liveSnapshot.current;
      try {
        const timeout = new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error("Agenda verification timed out.")), verificationTimeoutMs);
        });
        const result = await Promise.race([service.verifyFromServer(session), timeout]);
        if (cancelled || version !== sessionVersion.current) return;
        if (!result.active) {
          setMembership({ state: "revoked" });
          return;
        }
        if (liveSnapshot.current !== snapshotAtStart) return;
        if (fingerprint(snapshotAtStart || []) !== fingerprint(result.entries)) service.reconnectAgenda?.().catch(() => undefined);
        setAgenda({ entries: result.entries, hasSnapshot: true, fromCache: false, error: null, lastVerifiedAt: clock() });
      } catch (error) {
        if (!cancelled && version === sessionVersion.current && liveSnapshot.current === snapshotAtStart) {
          setAgenda((previous) => ({ ...previous, error: error?.code || "verify-failed" }));
        }
      } finally {
        clearTimeout(deadline);
        checking = false;
      }
    };
    const timer = setInterval(check, serverVerifyIntervalMs);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(deadline);
      document.removeEventListener("visibilitychange", check);
    };
  }, [signedIn, membership.state, session, service, clock]);

  const now = clock();
  const nowMs = now.getTime();
  const staleAt = (agenda.lastVerifiedAt?.getTime() ?? 0) + maximumVerificationAgeMs;
  const nextExpiry = agenda.entries.reduce((next, { offerExpiresAtMs }) => (
    offerExpiresAtMs > nowMs ? Math.min(offerExpiresAtMs, next) : next
  ), Infinity);
  useEffect(() => {
    if (!signedIn) return undefined;
    const delay = Math.min(60000, nextExpiry - nowMs, staleAt > nowMs ? staleAt - nowMs : Infinity);
    const timer = setTimeout(() => refreshClock((value) => value + 1), delay);
    return () => clearTimeout(timer);
  }, [signedIn, nextExpiry, nowMs, staleAt]);

  const freshness = freshnessFor({
    ...agenda,
    hasSnapshot: membership.state === "active" && agenda.hasSnapshot,
    error: membership.state === "error" ? "membership-unavailable" : agenda.error,
    online,
    nowMs,
    maxAgeMs: maximumVerificationAgeMs,
  });
  useEffect(() => { if (freshness.state === "live") setAttempt(0); }, [freshness.state]);
  useEffect(() => {
    if (freshness.state !== "stale" || !online || !signedIn) return undefined;
    const timer = setInterval(() => service.reconnectAgenda?.().catch(() => undefined), 10000);
    return () => clearInterval(timer);
  }, [freshness.state, online, signedIn, service]);

  const schedule = buildCleanerAgenda(revoked || membership.state !== "active" ? [] : agenda.entries, { now });
  const redeem = useCallback((code) => service.redeemAccessCode(code), [service]);
  const signOut = useCallback(async () => {
    setAgenda(emptyAgenda);
    await service.signOutCleaner();
  }, [service]);

  return {
    session,
    membership,
    revoked,
    entries: [...schedule.today, ...schedule.upcoming, ...schedule.completed, ...schedule.offers],
    schedule,
    freshness,
    redeem,
    signOut,
    openChecklist: service.openMyChecklist,
    respondToOffer: service.respondToMyOffer,
  };
}
