import { useCallback, useEffect, useRef, useState } from "react";
import { recordManagerAccessDiagnostic } from "../auth/managerAccessDiagnostics.js";
import * as defaultService from "./cleanerHubService.js";
import { buildCleanerAgenda, freshnessFor } from "./cleanerAgendaModel.js";

const systemClock = () => new Date();
const configuredInterval = Number(import.meta.env?.VITE_CLEANER_HUB_VERIFY_INTERVAL_MS);
export const serverVerifyIntervalMs = Number.isInteger(configuredInterval) && configuredInterval >= 2000 ? configuredInterval : 60000;
export const cleanerStartupTimeoutMs = 15000;
const verificationTimeoutMs = 10000;
const maximumVerificationAgeMs = serverVerifyIntervalMs + verificationTimeoutMs;
const emptyAgenda = { entries: [], hasSnapshot: false, fromCache: false, error: null, lastVerifiedAt: null };

function fingerprint(entries) {
  return entries.map((entry) => `${entry.id}:${entry.syncedAt?.toMillis?.() ?? entry.atMs ?? ""}`).sort().join("|");
}

function browserOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function startupClock() {
  return { wall: Date.now(), monotonic: performance.now() };
}

function trackStartup(phase, attempt, onTimeout, started = startupClock()) {
  const elapsed = () => Math.max(Date.now() - started.wall, performance.now() - started.monotonic);
  const report = (outcome, reason) => recordManagerAccessDiagnostic(`cleaner_startup_${outcome}`, {
    phase, attempt, durationMs: elapsed(), reason,
  });
  const cancel = () => {
    clearTimeout(timer);
    window.removeEventListener("pageshow", restored);
    document.removeEventListener("visibilitychange", visible);
  };
  const expire = () => {
    cancel();
    report("timeout", browserOnline() ? "timeout" : "offline");
    onTimeout();
  };
  const visible = () => {
    if (document.visibilityState === "visible" && elapsed() >= cleanerStartupTimeoutMs) expire();
  };
  const restored = (event) => { if (event.persisted) visible(); };
  report("started");
  const timer = setTimeout(expire, Math.max(0, cleanerStartupTimeoutMs - elapsed()));
  window.addEventListener("pageshow", restored);
  document.addEventListener("visibilitychange", visible);
  return {
    finish(outcome, reason) {
      cancel();
      report(outcome, reason);
    },
    cancel,
  };
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
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [, refreshClock] = useState(0);
  const sessionVersion = useRef(0);
  const membershipConfirmed = useRef(false);
  const startupTimes = useRef({});
  const retryCount = useRef(0);
  const autoRetryUsed = useRef(false);
  const liveSnapshot = useRef(null);

  useEffect(() => {
    let current;
    let cancelled = false;
    let startup = trackStartup("cleaner_auth", sessionAttempt, () => {
      setSession((previous) => previous.status === "loading" ? { status: "unverified" } : previous);
    });
    const stop = service.subscribeCleanerSession((next) => {
      if (cancelled) return;
      if (startup) {
        const verified = next.status !== "unverified";
        startup.finish(verified ? "ready" : "error", verified ? undefined : browserOnline() ? "unavailable" : "offline");
        startup = null;
      }
      if (current?.status === next.status && current?.uid === next.uid
        && current?.organizationId === next.organizationId && current?.cleanerId === next.cleanerId
        && current?.sessionId === next.sessionId) return;
      current = next;
      sessionVersion.current += 1;
      membershipConfirmed.current = false;
      startupTimes.current = {};
      retryCount.current = 0;
      if (next.status !== "unverified") autoRetryUsed.current = false;
      liveSnapshot.current = null;
      setAgenda(emptyAgenda);
      setMembership({ state: "loading" });
      setSession(next);
    });
    return () => {
      cancelled = true;
      startup?.cancel();
      stop();
    };
  }, [service, sessionAttempt]);

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

  const signedIn = session.status === "signed-in";
  const retryStartup = useCallback(({ preserveFailure = false } = {}) => {
    if (!browserOnline()) return;
    if (session.status === "unverified" || session.status === "loading") {
      if (!preserveFailure) setSession({ status: "loading" });
      setSessionAttempt((value) => value + 1);
      return;
    }
    if (!signedIn) return;
    if (!preserveFailure) {
      startupTimes.current = {};
      setMembership((previous) => previous.state === "error" ? { state: "loading" } : previous);
      setAgenda((previous) => !previous.hasSnapshot ? { ...previous, error: null } : previous);
    }
    retryCount.current = 0;
    setAttempt((value) => value + 1);
    service.reconnectAgenda?.().catch(() => undefined);
  }, [service, session.status, signedIn]);

  const startupNeedsRetry = session.status === "unverified" || membership.state === "error"
    || (signedIn && !agenda.hasSnapshot && Boolean(agenda.error));
  useEffect(() => {
    const resume = () => {
      const isOnline = browserOnline();
      setOnline(isOnline);
      if (!isOnline) return;
      if (startupNeedsRetry) {
        if (!autoRetryUsed.current) {
          autoRetryUsed.current = true;
          retryStartup({ preserveFailure: true });
        }
      } else if (signedIn) {
        service.reconnectAgenda?.().catch(() => undefined);
      }
    };
    const visible = () => {
      if (document.visibilityState !== "visible") return;
      refreshClock((value) => value + 1);
      resume();
    };
    const restored = (event) => { if (event.persisted) visible(); };
    const offline = () => {
      autoRetryUsed.current = false;
      setOnline(false);
    };
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", restored);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pageshow", restored);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [service, signedIn, startupNeedsRetry, retryStartup]);

  useEffect(() => {
    if (!signedIn) return undefined;
    const version = sessionVersion.current;
    let retryTimer;
    let cancelled = false;
    const current = () => !cancelled && version === sessionVersion.current;
    // Firestore streams may remain open without a server response. Update the
    // UI at the deadline while leaving the listeners eligible to recover.
    let membershipStartup = membershipConfirmed.current ? null : trackStartup("cleaner_membership", attempt, () => {
      if (current()) setMembership((previous) => previous.state === "loading" ? { state: "error" } : previous);
    }, startupTimes.current.membership ??= startupClock());
    let agendaStartup = liveSnapshot.current !== null ? null : trackStartup("cleaner_agenda", attempt, () => {
      if (current()) setAgenda((previous) => previous.hasSnapshot ? previous : { ...previous, error: "timeout" });
    }, startupTimes.current.agenda ??= startupClock());
    const retryListeners = () => {
      if (retryTimer !== undefined) return;
      const delay = Math.min(30000, 2000 * 2 ** Math.min(retryCount.current++, 4));
      retryTimer = setTimeout(() => { if (current()) setAttempt((value) => value + 1); }, delay);
    };
    const stopMembership = service.subscribeMembership(session, (result) => {
      if (!current()) return;
      membershipStartup?.finish(result.state === "error" ? "error" : "ready", result.state === "error" ? "unavailable" : undefined);
      membershipStartup = null;
      if (result.state === "error") {
        setMembership((previous) => previous.state === "active" ? { ...previous, verificationError: true } : result);
        retryListeners();
        return;
      }
      membershipConfirmed.current = result.state === "active";
      setMembership(result);
    });
    const stopAgenda = service.subscribeAgenda(
      session,
      ({ entries, fromCache }) => {
        if (!current()) return;
        if (fromCache) {
          setAgenda((previous) => ({ ...previous, fromCache: true }));
          return;
        }
        agendaStartup?.finish("ready");
        agendaStartup = null;
        liveSnapshot.current = entries;
        setAgenda({ entries, hasSnapshot: true, fromCache: false, error: null, lastVerifiedAt: clock() });
      },
      (code) => {
        if (!current()) return;
        agendaStartup?.finish("error", code);
        agendaStartup = null;
        setAgenda((previous) => ({ ...previous, error: code }));
        retryListeners();
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      membershipStartup?.cancel();
      agendaStartup?.cancel();
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
    service.signOutCleaner(session).catch(() => undefined);
  }, [membership.state, service, session]);

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
        setMembership((previous) => previous.state === "active" && previous.verificationError
          ? { ...previous, verificationError: false } : previous);
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
    error: membership.state === "error" || membership.verificationError
      ? "membership-unavailable" : agenda.error || (!online ? "offline" : null),
    online,
    nowMs,
    maxAgeMs: maximumVerificationAgeMs,
  });
  useEffect(() => {
    if (freshness.state !== "live") return;
    retryCount.current = 0;
    autoRetryUsed.current = false;
  }, [freshness.state]);
  useEffect(() => {
    if (freshness.state !== "stale" || !online || !signedIn) return undefined;
    const timer = setInterval(() => service.reconnectAgenda?.().catch(() => undefined), 10000);
    return () => clearInterval(timer);
  }, [freshness.state, online, signedIn, service]);

  const schedule = buildCleanerAgenda(revoked || membership.state !== "active" ? [] : agenda.entries, { now });
  const redeem = useCallback((code) => service.redeemAccessCode(code), [service]);
  const signOut = useCallback(async () => {
    setAgenda(emptyAgenda);
    await service.signOutCleaner(session);
  }, [service, session]);

  return {
    session,
    membership,
    revoked,
    entries: [...schedule.today, ...schedule.upcoming, ...schedule.completed, ...schedule.offers],
    schedule,
    freshness,
    online,
    retryStartup,
    redeem,
    signOut,
    openChecklist: service.openMyChecklist,
    respondToOffer: service.respondToMyOffer,
    // Release A does not authorize private Property fields or an access window.
    // Keep the prepared UI disconnected until that server contract is approved.
    loadJobAccess: service.getMyJobAccess || null,
  };
}
