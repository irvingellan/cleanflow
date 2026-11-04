import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as defaultService from "./cleanerHubService.js";
import { buildCleanerAgenda, freshnessFor } from "./cleanerAgendaModel.js";

const systemClock = () => new Date();
const configuredInterval = Number(import.meta.env?.VITE_CLEANER_HUB_VERIFY_INTERVAL_MS);
export const serverVerifyIntervalMs = Number.isInteger(configuredInterval) && configuredInterval >= 2000 ? configuredInterval : 60000;

function fingerprint(entries) {
  return entries.map((entry) => `${entry.id}:${entry.syncedAt?.toMillis?.() ?? entry.atMs ?? ""}`).sort().join("|");
}
const emptyAgenda = { entries: [], hasSnapshot: false, fromCache: false, error: null, lastVerifiedAt: null };

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
  const wasLive = useRef(false);

  useEffect(() => service.subscribeCleanerSession(setSession), [service]);

  useEffect(() => {
    const reconnect = () => service.reconnectAgenda?.().catch(() => undefined);
    const update = () => {
      const isOnline = browserOnline();
      setOnline(isOnline);
      if (isOnline) reconnect();
    };
    const resume = () => { if (document.visibilityState === "visible" && browserOnline()) reconnect(); };
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
  const { uid, organizationId, cleanerId } = session;

  useEffect(() => {
    if (!signedIn) {
      setAgenda(emptyAgenda);
      setMembership({ state: "loading" });
      return undefined;
    }
    const scope = { uid, organizationId, cleanerId };
    let retryTimer;
    const stopMembership = service.subscribeMembership(scope, setMembership);
    const stopAgenda = service.subscribeAgenda(
      scope,
      ({ entries, fromCache }) => setAgenda((previous) => ({
        entries,
        hasSnapshot: true,
        fromCache,
        error: null,
        lastVerifiedAt: fromCache ? previous.lastVerifiedAt : clock(),
      })),
      (code) => {
        setAgenda((previous) => ({ ...previous, error: code }));
        // Firestore ends a listener after an error; reopen it with backoff while
        // keeping the last confirmed entries (labelled stale) on screen.
        retryTimer = setTimeout(() => setAttempt((value) => value + 1), Math.min(30000, 2000 * 2 ** Math.min(attempt, 4)));
      },
    );
    return () => {
      clearTimeout(retryTimer);
      stopMembership();
      stopAgenda();
    };
  }, [signedIn, uid, organizationId, cleanerId, service, clock, attempt]);

  // Sticky until the page reloads: the notice must survive the sign-out it triggers.
  const [revoked, setRevoked] = useState(false);
  useEffect(() => {
    if (membership.state !== "revoked") return;
    setRevoked(true);
    setAgenda(emptyAgenda);
    service.signOutCleaner().catch(() => undefined);
  }, [membership.state, service]);

  // Defense in depth for long-lived mobile connections: while visible, re-check
  // membership and agenda directly on the server. A mismatch replaces the screen
  // with the server answer and reconnects the stream; a failure marks it stale.
  useEffect(() => {
    if (!signedIn || membership.state !== "active") return undefined;
    let cancelled = false;
    const scope = { uid, organizationId, cleanerId };
    const check = async () => {
      if (!service.verifyFromServer || document.visibilityState !== "visible" || !browserOnline()) return;
      try {
        const result = await service.verifyFromServer(scope);
        if (cancelled) return;
        if (!result.active) {
          setMembership({ state: "revoked" });
          return;
        }
        setAgenda((previous) => {
          if (previous.hasSnapshot && !previous.fromCache && !previous.error && fingerprint(previous.entries) === fingerprint(result.entries)) {
            return { ...previous, lastVerifiedAt: clock() };
          }
          service.reconnectAgenda?.().catch(() => undefined);
          return { entries: result.entries, hasSnapshot: true, fromCache: false, error: null, lastVerifiedAt: clock() };
        });
      } catch (error) {
        if (!cancelled) setAgenda((previous) => ({ ...previous, error: error?.code || "verify-failed" }));
      }
    };
    const timer = setInterval(check, serverVerifyIntervalMs);
    const resume = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [signedIn, membership.state, uid, organizationId, cleanerId, service, clock]);

  const freshness = freshnessFor({ ...agenda, online });
  useEffect(() => { if (freshness.state === "live") setAttempt(0); }, [freshness.state]);
  // Watchdog: while the phone is online but the agenda is not confirmed, keep
  // asking Firestore to reconnect instead of waiting on its long backoff.
  useEffect(() => {
    if (freshness.state !== "stale" || !online || !signedIn) return undefined;
    const timer = setInterval(() => service.reconnectAgenda?.().catch(() => undefined), 10000);
    return () => clearInterval(timer);
  }, [freshness.state, online, signedIn, service]);
  // Remember when the agenda was last known to be in sync, for honest stale labels.
  useEffect(() => {
    if (freshness.state === "live") wasLive.current = true;
    else if (freshness.state === "stale" && wasLive.current) {
      wasLive.current = false;
      setAgenda((previous) => ({ ...previous, lastVerifiedAt: clock() }));
    }
  }, [freshness.state, clock]);

  const schedule = useMemo(() => buildCleanerAgenda(revoked ? [] : agenda.entries, { now: clock() }), [agenda.entries, revoked, clock]);

  const redeem = useCallback((code) => service.redeemAccessCode(code), [service]);
  const signOut = useCallback(async () => {
    setAgenda(emptyAgenda);
    await service.signOutCleaner();
  }, [service]);

  return {
    session,
    membership,
    revoked,
    entries: revoked ? [] : agenda.entries,
    schedule,
    freshness,
    redeem,
    signOut,
    openChecklist: service.openMyChecklist,
    respondToOffer: service.respondToMyOffer,
  };
}
