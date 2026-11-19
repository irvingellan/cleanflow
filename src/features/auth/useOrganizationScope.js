import { useEffect, useState } from "react";
import {
  currentOrganizationId,
  defaultOrganizationId,
  organizationIdFromClaims,
  resetCurrentOrganizationId,
  setCurrentOrganizationId,
} from "../../services/organization/currentOrganization.js";
import { clearJobPhotoCountCache } from "../jobs/jobPhotoCountService.js";
import { recordManagerAccessDiagnostic } from "./managerAccessDiagnostics.js";

// A valid session answers from memory. This only bounds a token refresh that
// stalls, so the account is never held on the loading screen by this step.
export const organizationScopeDeadlineMs = 4_000;

const signedOut = { uid: null, organizationId: defaultOrganizationId };

/**
 * Selects the organization of the signed-in account from its token, before any
 * organization data is read. The claim only selects: the membership document
 * and the Rules still decide access. An account without the claim, a failed token
 * read, or an account without a token reader use the default organization.
 */
export function useOrganizationScope(authUser) {
  const uid = authUser?.uid || null;
  const [scope, setScope] = useState(signedOut);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // A switch can go straight from one signed-in account to another.
    clearJobPhotoCountCache();
    if (!uid) {
      resetCurrentOrganizationId();
      setScope((previous) => (previous.uid === null ? previous : signedOut));
      return undefined;
    }

    // Local sessions without a token reader have no organization claim.
    if (typeof authUser.getIdTokenResult !== "function") {
      resetCurrentOrganizationId();
      setScope({ uid, organizationId: defaultOrganizationId });
      return undefined;
    }

    let active = true;
    let reported = false;
    const startedAt = Date.now();
    const select = (organizationId) => {
      if (!active) return;
      setCurrentOrganizationId(organizationId);
      const selected = currentOrganizationId();
      setScope((previous) => (
        previous.uid === uid && previous.organizationId === selected ? previous : { uid, organizationId: selected }
      ));
    };
    const useDefaultAfterError = () => {
      if (!active) return;
      if (!reported) recordManagerAccessDiagnostic("auth_restore_error", { durationMs: Date.now() - startedAt, reason: "unknown" });
      select(defaultOrganizationId);
    };
    const deadline = setTimeout(() => {
      if (!active) return;
      reported = true;
      recordManagerAccessDiagnostic("auth_restore_error", { durationMs: Date.now() - startedAt, reason: "timeout" });
      // A pending read can still resolve to another company. Let the user retry
      // without opening the default company's membership in the meantime.
      setScope({ uid, organizationId: null, status: "error" });
    }, organizationScopeDeadlineMs);

    Promise.resolve()
      .then(() => active && authUser.getIdTokenResult())
      .then(
        // A token that arrives after the deadline still selects the company.
        (result) => { clearTimeout(deadline); select(organizationIdFromClaims(result?.claims)); },
        () => { clearTimeout(deadline); useDefaultAfterError(); },
      );

    return () => {
      active = false;
      clearTimeout(deadline);
    };
    // The selection belongs to the account, not to the user object's identity.
  }, [uid, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (uid && scope.uid === uid && scope.status === "error") {
    const retry = () => {
      setScope(signedOut);
      setAttempt(value => value + 1);
    };
    return { ready: false, status: "error", retry };
  }
  return { ready: uid !== null && scope.uid === uid };
}
