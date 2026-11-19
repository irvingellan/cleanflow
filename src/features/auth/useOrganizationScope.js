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
 * and the Rules still decide access. An account without the claim, a failed or
 * a stalled token read all use the default organization.
 */
export function useOrganizationScope(authUser) {
  const uid = authUser?.uid || null;
  const [scope, setScope] = useState(signedOut);

  useEffect(() => {
    if (!uid) {
      resetCurrentOrganizationId();
      // Session caches that are not keyed by organization end with the session.
      clearJobPhotoCountCache();
      setScope((previous) => (previous.uid === null ? previous : signedOut));
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
    const fallBack = (reason) => {
      if (!active || reported) return;
      reported = true;
      recordManagerAccessDiagnostic("auth_restore_error", { durationMs: Date.now() - startedAt, reason });
      select(defaultOrganizationId);
    };
    const deadline = setTimeout(() => fallBack("timeout"), organizationScopeDeadlineMs);

    Promise.resolve()
      .then(() => authUser.getIdTokenResult())
      .then(
        // A token that arrives after the deadline still corrects the selection.
        (result) => { clearTimeout(deadline); select(organizationIdFromClaims(result?.claims)); },
        () => { clearTimeout(deadline); fallBack("unknown"); },
      );

    return () => {
      active = false;
      clearTimeout(deadline);
    };
    // The selection belongs to the account, not to the user object's identity.
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready: uid !== null && scope.uid === uid };
}
