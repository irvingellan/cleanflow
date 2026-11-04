# Notification reliability V1 — engineering review

## State and source

Functional-only local candidate, branched from separately verified deployed Hosting source `b7b0eeac5374a8ffb072972c671f8803b680a1a0`; it is not a merge of main, V2/V3 or Intake WIP. Canonical source inventory is `WORKTREE_RELEASE_CANDIDATE_REGISTRY.md`; no competing registry was created. The Production read authorization was limited to manager membership, device health and notification outcome metadata. No tokens, contacts, Job/Property data, photos or customer contents were read. Private incident projections remain outside Git.

Production metadata at the recorded read remained 31 ACTIVE Node22 Functions, maxInstances20, and Hosting b7b0eea. The local candidate introduces one additional manager-only callable; this is not a claim of 32 deployed Functions. No cloud resource, operational record, browser registration, permission, provider or scheduler was changed. FCM remains configured; OneSignal cutover remains parked.

## What the incident evidence establishes

ACCOUNT ATTRIBUTION: two active manager memberships were observed; this does not identify physical users or prove that each browser belongs to a distinct person.

DEVICE/SESSION ATTRIBUTION: an inactive iOS/standalone registration has an invalidation timestamp and a registration-error health snapshot. A different iOS/standalone registration is active, but its health snapshot is older. Recent desktop activity is separate. Device health is a recorded observation, not present OS settings or a display receipt.

HUMAN ATTRIBUTION: UNKNOWN. Firebase UID, account ownership and coarse browser metadata alone cannot establish who used a device. Do not state that a named person experienced an event merely from account attribution.

The inactive registration is currently ineligible: CONFIRMED. Source writes invalidatedAt following conclusive invalid-token provider responses, so conclusive rejection is LIKELY; the exact provider error for this event and why the token became invalid are NOT PROVEN. An earlier self-test was provider-accepted, which does not demonstrate later receipt/display. Same-account versus different-account physical usage, token collision, token ownership and phone settings remain unproven; raw tokens were intentionally not inspected.

Reminder history includes provider-accepted and partial aggregate outcomes. Aggregate counts cannot identify the phone that displayed a notification. A narrow proximate operational-trigger log window contains HTTP200/INFO metadata, but no safe per-recipient rejection result. It is not an exact event-to-device correlation. No event backfill, test push or broader operational read was performed to fill those gaps. A malformed first Logging field projection was a query error, not evidence of an application or Logging service outage.

## Delivery-chain evidence and limits

| Step | Existing evidence | Limit |
|---|---|---|
| Business event / durable outbox | Existing event/claim services and synthetic integration tests | No unrelated real Jobs or event payloads read |
| Membership / device eligibility | Server membership and active-registration selection; narrow live metadata | Account is not physical identity |
| Message / FCM request | Existing bounded transport and ordered response handling | No real send in this run |
| Accepted / rejected / UNKNOWN | Existing outcomes; conservative new normalizer | Aggregate acceptance is not per-phone delivery |
| Browser/worker receipt | Foreground callback exists in source | No durable universal browser receipt |
| OS display / open | Not established by these records | Never inferred from permission or provider acceptance |
| Recoverable in-app record | Existing durable outboxes/audits with bounded diagnostics | No complete manager/cleaner inbox exists |

## Implemented functional changes

- One absolute15s enrollment budget, actual Auth-session/generation guards, serialization behind dispatched SDK/writes, passive coalescing and explicit retry recovery. Late operations cannot update current health or dispatch a new stale enrollment.
- Exact messaging worker script/scope validation; headless readiness separates installation context, permission, worker, enrollment and UNKNOWN delivery. No CSS/layout/copy redesign.
- Visible/online/already-granted lifecycle refresh with60s cooldown, coalescing and cleanup guards. No unsolicited prompt or push.
- Server revisioned enrollment and exact owner/org/token/revision sign-out cleanup, bounded5s. No browser SDK token deletion during logout. Legacy missing revision safely skips cleanup.
- Conclusive invalidated cached token marker enables at most one bounded SDK rotation per attempt. Generic failure, timeout and ambiguous send never retry or switch providers. Historical invalidation remains recorded.
- All invalidators guard the exact registration revision. Reminders reuse15s FCM/5s cleanup bounds; known provider outcomes survive audit failure without another send. Durable claims stay consumed on ambiguous/lost outcomes.
- Safe allowlisted health stage/code and diagnostics exposing nullable outcomes, current-device audits and explicit unordered/global sample caps. No fabricated complete history or inbox.

Independent review additionally required failed-Auth-signout recovery and ordering of legacy invalidation after sign-out. Regressions and final verification receipts are in the local validation companion. No new visual interface or generic notification platform was introduced.

## Integration contract for the visual owner and Cleaner Hub

Consumers may render headless readiness and existing diagnostic projections without provider calls during render. Keep UNKNOWN distinct from failed/unpaid/not delivered. A safe history presentation must expose sample completeness and cannot label a capped global sample the full inbox. Current manager services cannot be reused as cleaner authorization: authenticated cleaner identity, organization relation and allowlisted recipient projection require their own scoped contract before backend integration. Do not use demo/localStorage Hub history as delivered or persisted Production evidence.

## Remaining limits / release decision

This is READY FOR FUNCTIONAL REVIEW only after the final test receipt, not a Production rollout approval or proof the real phone incident is resolved. No closed-browser external Auth-loss cleanup, global cross-account token-transfer policy, universal receipt/display/open tracking, backfill or scheduler replay was built. An already dispatched request cannot be remotely cancelled by a local deadline; exact revisions and serialization bound the effects, while ambiguous outcomes remain UNKNOWN.

A later authorized release must stage the registration/deactivation callable before the client and coordinate every invalidation/transport surface. Review runtime/maxInstances, current Production configuration and maintenance gates afresh; do not deploy this whole worktree or run an all-Functions command based on this report. Physical installed-iPhone permission/token refresh and actual notification display require an explicitly authorized device test. Back up unpreserved commits to an owner-selected private off-device destination; this run did not upload source or create a new provider/account.
