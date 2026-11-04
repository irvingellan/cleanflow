import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as defaultService from "./cleanerHubService.js";
import { buildCleanerAgenda, freshnessFor } from "./cleanerAgendaModel.js";

const emptyAgenda = { entries: [], hasSnapshot: false, fromCache: false, error: null, lastVerifiedAt: null };

function browserOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * Session, membership and live agenda for the signed-in cleaner. Private data
 * is dropped as soon as the membership is revoked or the session ends.
 */
export function useCleanerHub({ service = defaultService, clock = () => new Date() } = {}) {
  const [session, setSession] = useState({ status: "loading" });
  const [membership, setMembership] = useState({ state: "loading" });
  const [agenda, setAgenda] = useState(emptyAgenda);
  const [online, setOnline] = useState(browserOnline);
  const wasLive = useRef(false);

  useEffect(() => service.subscribeCleanerSession(setSession), [service]);

  useEffect(() => {
    const update = () => setOnline(browserOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const signedIn = session.status === "signed-in";
  const { uid, organizationId, cleanerId } = session;

  useEffect(() => {
    if (!signedIn) {
      setAgenda(emptyAgenda);
      setMembership({ state: "loading" });
      return undefined;
    }
    const scope = { uid, organizationId, cleanerId };
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
      (code) => setAgenda((previous) => ({ ...previous, error: code })),
    );
    return () => {
      stopMembership();
      stopAgenda();
    };
  }, [signedIn, uid, organizationId, cleanerId, service, clock]);

  const revoked = membership.state === "revoked";
  useEffect(() => {
    if (!revoked) return;
    setAgenda(emptyAgenda);
    service.signOutCleaner().catch(() => undefined);
  }, [revoked, service]);

  const freshness = freshnessFor({ ...agenda, online });
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
