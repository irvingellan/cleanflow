# Notification reliability V1 — functional-only contract

Issue #85 coordinates #83/#46/#39/#55/#54/#84. This implementation is local-only,
based on the separately verified Production source b7b0eeac5374a8ffb072972c671f8803b680a1a0.
It does not integrate other feature lines or authorize release/provider changes.

The target is bounded registration/recovery, truthful channel diagnostics and
consistent conservative FCM outcomes. Existing committed operational events stay
the durable business evidence; provider acceptance is never receipt/display/open.
Account attribution, device/session attribution and physical-person attribution
remain separate. Browser metadata or Firebase UID alone cannot identify a person.

## Binding boundaries

- No Production deployment/write, real push, scheduler invocation, registration,
  Rules/index/billing/secret/IAM change, merge, rebase, public push or visual design.
- Claude owns all CSS/layout/animation/visual UX; this branch changes service,
  effect/handler, headless state and server/test behavior only.
- FCM remains the configured/default transport. OneSignal cutover stays PARKED.
- No automatic permission prompt; only existing explicit user action requests it.
- No resend/retry/fallback for ambiguous provider results or existing claimed events.
- Never log tokens or copy contacts, access information, business notes or photos
  into diagnostics/reports. Existing private registration token storage remains
  necessary for the authorized FCM transport; no token is exposed by projections.
- Existing manager membership checks remain sovereign; no cleaner data access is
  created before a separate authenticated cleaner identity/projection contract.

## Functional contract

1. Every registration attempt has one absolute15s registration budget (support
   checks retain existing bounds), generation/account guards at every await, and
   serialization behind already-dispatched writes. Timed-out/superseded operations
   cannot later report success or dispatch a new enrollment write. A new explicit
   retry can recover without reload. No automatic push is sent.
2. A messaging-worker health result must match the exact same-origin messaging
   scope and script, not merely any root service worker. Headless readiness
   distinguishes browser tab/standalone, unsupported/default/denied/granted,
   worker missing/mismatch, registration missing/error/known, and UNKNOWN delivery.
   Standalone proves running context, not universal installation status.
3. Existing lifecycle events may refresh already-granted registration at a bounded
   cooldown, only while visible/online/currently authorized; no storms, new UI,
   unsolicited prompt or test send. Existing handlers remain the mutation boundary.
4. Enrollment returns a monotonically increasing server registrationRevision.
   Explicit sign-out may deactivate only the exact owned device/token/revision,
   bounded and best-effort before Auth sign-out. Late cleanup cannot deactivate a
   refreshed enrollment or another account/device. Legacy missing revision skips
   unsafe cleanup; externally lost Auth while closed is still a known limitation.
   Do not add a generic token-ownership/lease platform or auto-revoke other accounts.
   An exact currently invalidated cached token must not be blindly reactivated.
   The server may reject it with failed-precondition/details.reason=fcm-token-invalidated;
   only that conclusive marker permits one bounded same-session SDK token rotation,
   never a test send, generic-error retry, provider retry or fallback. Preserve prior
   invalidation timestamps; distinguish current invalidation from explicit sign-out.
5. Scheduled reminders reuse the existing15s FCM send bound, strict ordered-result
   normalization and5s exact-token cleanup. UNKNOWN remains UNKNOWN. A failed audit
   write must never replace known provider acceptance with a fabricated UNKNOWN or
   trigger another send. Existing claim/schedule/Job selection/copy stays unchanged.
6. Existing diagnostic projections retain null/unknown counts, standalone and
   bounded safe failure stage/code; include current-device audits and explicit read
   cap/freshness limitations. No claim that aggregate success proves either phone.

## Deliberately not built in this slice

No second event bus/provider, manager/cleaner visual inbox, new worker enrollment
policy, scheduled watchdog, delivery replay, backfill, inferred display/open,
Notion access, Cleaner Hub auth or schedule completeness claim. Existing outboxes
can support a future inbox, but the historical records do not all contain an
organization field; a misleading limited global query is not an inbox read model.
Document a safe integration contract for Claude rather than fabricate history.

## Validation

TDD for races/timeouts/late writes, worker scope, PWA contexts and truthful failure
states; manager authorization, cross-user/org/device/revision cleanup; provider
timeout/partial/ambiguous responses and failed audit persistence. Full unit suite,
isolated emulator/security with synthetic fixtures only, builds/guards, diff check.
Physical iPhone/PWA/display and the reported incident causality remain separate.

Reuse decision: EXTEND installed Firebase SDK/FCM registration, existing deadline,
claim, cleanup and health services; no new dependency/provider/platform. Official
Firebase guidance confirms getToken can return a cached token and known invalid
registrations must be removed/refreshed. The pinned legacy-token APIs remain
supported; no FID/provider migration is included. Sources:
https://firebase.google.com/docs/cloud-messaging/manage-tokens
https://firebase.google.com/docs/cloud-messaging/web/get-started
