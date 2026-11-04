# Source reconciliation + notification reliability V1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Keep the ledger; never repeat completed work.

**Goal:** Reconcile retained source and deliver bounded, testable notification
recovery/observability corrections without a Production or visual change.
**Architecture:** Extend existing Firebase/FCM services, durable claims and health
projections. Keep all source streams separate; code starts from verified b7b0eea,
not dirty Intake or old main. No new provider/bus or bulk integration.
**Tech Stack:** React effects, Firebase client/Admin/Functions, Vitest, emulator tests.
**Spec:** docs/engineering/NOTIFICATION_RELIABILITY_V1.md; Issues83/85 and linked
issues; the user's3November autonomous mission. Approved autonomous execution
overrides redundant plan/design approval pauses.

## Global Constraints

- No Production deployment/write, push send, real device registration or event.
- No merge/rebase/public push, destructive Git, worktree interruption, secrets copy.
- No CSS/layout/animation/visual polish. FCM only; OneSignal stays PARKED.
- Preserve Main, MultiPhoto, V2/V3/VisualStudio, Intake/Telemetry and Claude Hub WIP.
- Provider acceptance != physical delivery; account != person; unknown != zero.
- Tests synthetic; physical full20-photo/notification/PWA acceptance not inferred.

## Review Focus

- Timed-out SDK completion after retry/account change must not enroll/display stale.
- Root/foreign worker must not satisfy the messaging health readiness contract.
- Old sign-out/revocation must not deactivate a newer revision or another device.
- Malformed/partial provider response and failed audit writes must not resend or
  turn known acceptance into a false negative/zero count.
- Inventory must distinguish local/source/backup/remote/deploy/integration, and
  active Claude changes must not be attributed to this task.

### Task 1: Reconcile sources and current deployed identity

Files: existing canonical docs/engineering/WORKTREE_RELEASE_CANDIDATE_REGISTRY.md,
new dated reconciliation report; private metadata only under this task's workspace.

- [ ] Verify local/worktree/ref/stash/unreachable metadata, exact live remote refs,
  bundle/verifier/snapshot hashes, ignored-source metadata and active changes.
- [ ] Read current Hosting/31Function source metadata independently of main; keep
  private push diagnostics out of tracked/public reports.
- [ ] Port only the existing canonical register document and append refreshed
  evidence, classifications/dependencies/recommendations and preservation gaps.
- [ ] Validate all quoted counts/SHAs and post a sanitized Issue83 checkpoint.

### Task 2: Bounded client registration and readiness

Files: notificationService.js/tests, notificationHealthService.js/tests,
notificationHealthReporter.js/tests, NotificationControl.jsx/tests (effects only),
headless notificationReadiness.js/tests, App.jsx sign-out handler only.
Interfaces: getCachedFcmRegistrationDiagnostic() returns safe state/stage/code;
prepareManagerPushSignOut() is bounded best-effort; Task3 callable accepts exactly
{deviceId,token,registrationRevision}, derives UID/org server-side, returns deactivated.

- [ ] Add failing tests for stalled/delayed stages, expired generation, overlapping
  passive registration, account switch, retry and late logout vs refreshed revision.
- [ ] Add failing tests for root/wrong worker scope/script and EN-independent
  headless readiness, iOS tab vs standalone, denied/default and UNKNOWN delivery.
- [ ] Implement the Spec's absolute15s budget, serialized writes and current-user
  guards, safe diagnostic stage/code, explicit revision-aware logout only.
- [ ] A server failed-precondition with details.reason=fcm-token-invalidated alone
  permits one serialized/bounded token rotation, same current account/generation.
  Generic errors, timeouts and ambiguous results never rotate or send/retry push.
- [ ] Add bounded60s lifecycle refresh cooldown; active/visible/online only;
  all event storms coalesce and never prompt/send a test. Preserve JSX visuals.
- [ ] Run focused client tests, then full suite. Root owns commit after review.

### Task 3: Server registration, conservative reminders and diagnostics

Files: functions/src/index.js (only notification wiring), new narrow registration
service/test, managerReminderDelivery.js/test if extraction is needed,
managerReminders.js/tests, managerFcmDelivery.js/tests, notificationLab.js/tests,
notificationDiagnostics.js/tests; synthetic security tests.
Interfaces: registerManagerDevice() server-increments registrationRevision and
returns {registered:true,registrationRevision}; deactivateManagerDevice() compares
exact owner/org/token/revision, no client UID/org and no cross-account cleanup.
Health optional fcmErrorStage/fcmErrorCode use fixed allowlists, legacy compatible.

- [ ] Add failing tests for repeated/newer enrollment, stale sign-out, wrong UID/
  org/device/token/revision and unauthorized/anonymous calls.
- [ ] Implement minimal versioned registration/owned deactivation; preserve manager
  authorization and existing device IDs, no other-device mutation or provider call.
- [ ] Reject the exact currently-invalidated cached token with the above fixed
  reason. Distinguish current invalidation from sign-out/history without erasing
  historical timestamps; update all existing invalidation paths consistently.
- [ ] Add failing tests: hung send→boundedUNKNOWN; transient/malformed result→UNKNOWN;
  partial invalid token→guarded cleanup; accepted+audit-write failure→known acceptance,
  no second provider invocation; already-claimed remains no send.
- [ ] Reuse existing send/normalize/cleanup functions, preserve schedule/claim/copy;
  isolate result persistence and record audit failure honestly.
- [ ] Cover safe diagnostic fields, nullable unknowns, current-device audit, query
  caps/read completeness. If efficient recent org history requires a new canonical
  read model/index/backfill, expose limit honestly instead of inventing completeness.
- [ ] Run focused server tests and full suite. Root owns commits after review.

### Task 4: Integration/security and local delivery

- [ ] Run full unit, isolated synthetic emulator/security (no stopping user
  processes), environment/build guards and Production/Sandbox builds, diff check.
- [ ] Fresh adversarial review of exact candidate and sources; fix only evidenced
  functional/security issues with RED→GREEN regressions.
- [ ] Verify protected worktrees/refs/STOPs unchanged, note concurrent Claude WIP.
- [ ] Local checkpoint commits, safe functional contract/reconciliation report,
  scoped Issue83 update. No push/PR/merge/deploy.
- [ ] Package only sanitized reports/evidence in the mandatory local handoff ZIP;
  declare backup/off-device/device-validation/causality gaps and future surfaces.

## Execution checkpoint

Tasks1–3 and Task4 implementation/review/validation are complete in the isolated
branch; final receipts are in the dated engineering validation document. Issue83
metadata was posted/read back; no source pushed. Mandatory sanitized local ZIP
is the last local delivery step. Pending physical-device/off-device-backup/inbox
work is explicitly outside this completed functional slice, not passing evidence.
