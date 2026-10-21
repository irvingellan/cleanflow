# Multi-photo V1 — functional readiness, 2026-10-21

Status: IMPLEMENTED; READY FOR CONTROLLED PREVIEW / RELEASE REVIEW.
This is a local functional checkpoint, not deployment authorization.

## Recovery and scope

Resumed existing `codex/checklist-multi-photo-v1` at `588a1fd` in its original
isolated worktree. No implementation was rebuilt or visually polished.
Search-first decision: REUSE/VERIFY the existing native optimizer, gallery,
capability services and installed test infrastructure; no dependency added.
Primary Intake/Telemetry WIP, V2 RC, V3 work and Node22 STOP remain separate.

This round changes only three test files, this report and CURRENT_STATE.
No application, backend, CSS, i18n, schema or deployment configuration changed.
New coverage proves a three-photo batch continues past a failed middle upload,
retries only its retained Blob, rejects selection21 before optimization, and
preserves the complete ordered20 gallery through reload, display and report.

## Verified contract

- New Runs freeze policy2 with max20 saved/pending photos and50MiB total charged
  obligations. Each upload remains <=5MiB. Count and byte reservations are
  transactional; ambiguous writers remain charged. Browser policy is not trusted.
- Historical policy-absent Runs remain single-photo. No migration or backfill.
  Existing saved evidence, historical report and private image reads pass.
- Library selection appends and camera appends one at a time. One image is
  optimized/uploaded at a time. First available belongings slot is required;
  extras are optional. Only server-saved evidence satisfies review requirements.
- Persisted order is successful server finalization order, not a promise of
  initial selection order after failures. A failed middle image retried later
  appends after already-saved successes. Reload preserves that saved order.
- Retry uses the same optimized Blob; exact accepted content deduplicates after
  a lost response. DRAFT removal requires a server receipt. Removed identical
  content is tombstoned: choose a different image to add it again. Required
  removal restores the missing-photo requirement. READY is immutable.
- Saved images survive reload/reopen. Unsaved local File handles do not survive
  reload; pending/failed photos must be resolved before submission, not called
  saved. Existing draft autosave/recovery and server-confirmed receipt remain.
- Manager authorized projection and all20 private reads pass; report lists and
  decodes all20 in order. Manager integration uses the actual detail component
  and authorized callable projection/transport adapter, not the full app shell.

## Optimizer defaults and evidence

JPEG/PNG/still WebP, source <=20MiB and <=16 million pixels. Native decoding is
sequential, with a20s absolute optimization deadline. Target longest edge1920px;
JPEG quality .85, then .80/.75 only if needed to avoid output growth. No upscale.
Smaller efficient, independently validated metadata-free originals may remain
PNG/WebP/JPEG. EXIF/GPS/comments/unsupported metadata are stripped or rejected;
encoder metadata is checked too. EXIF orientations1–8 pass in both browsers.
The bounded ArrayBuffer→fresh Blob Safari upload transport is unchanged.

Fresh synthetic4000x3000 camera JPEG→1920x1440 results:
Chromium4,320,441→224,735bytes (~94.8% smaller), WebKit4,916,455→527,125bytes
(~89.3%). These are synthetic benchmarks, not real iPhone image quality, cellular
performance or guaranteed cloud savings. Compression reduces bytes, not object
upload counts or retention. Capability expiry does not delete evidence.

HEIC/HEIF is explicitly rejected with existing localized JPEG/PNG/WebP guidance.
No converter/dependency was added. Native codec/read/GC work cannot be physically
cancelled or hard-memory-capped; a16MP decoded bitmap alone is about64MB RGBA.

## Fresh validation

- Node22.23.2: focused21 files /282 tests; full119 files /1,351 tests.
- Actual isolated Firestore/Storage security:82 passed, zero failed/skipped.
- Native optimizer:28 Playwright cases, Chromium+WebKit.
- Gallery:4 Playwright cases, Chromium+WebKit, including20/21 admission.
- Actual Auth/Functions/Firestore/Storage/Hosting integration:4 passed,
  Chromium desktop + WebKit390x844. Covers1/2/10/20, count/byte concurrency,
  invalid images, lost-response retry, remove/reload, ordered reload/display,
  review receipt/replay/read-only, manager/report, capability denial and legacy.
- Environment/build/Hosting hygiene tests:22 passed. Positive Sandbox and
  Production compile checks use synthetic config only, never live credentials.
- Syntax checks and `git diff --check`: passed.

Initial focused run had one intermittent legacy confirmation assertion failure;
five isolated repetitions, both complete unit runs and final focused run passed.
No deterministic product defect was established and no runtime workaround added.
An initial concurrently-running emulator invocation exited unexpectedly; its
owned orphan was identified/stopped, and two serial integrations passed. Raw
logs remain excluded because they contain synthetic bearer URLs. The final run
uses hostNode22 despite this candidate's still-declared Functions engine20;
this is local compatibility evidence, not an approved runtime migration.
Existing build large-chunk/deprecation warnings remain, outside this scope.

## Remaining gates

MUST FIX before preview: no confirmed functional blocker in the local synthetic
candidate. A private/isolated preview still requires explicit authorization to
start/publish; none was started/deployed this round.

MUST FIX before Production:

1. Reconcile the separately stopped Node22 migration, affected endpoint source,
   runtime/capacity settings and STOP disposition before any release. Do not
   deploy this old engine20/global configuration over newer cloud configuration.
   This round made no Production inventory claim and did not alter that worktree.
2. Reconfirm the exact release source/config, operator window, required surfaces,
   billing/quota availability and compatible rollback under separate authorization.
   Historical cost metadata is not a current budget guarantee.
3. Finish focused physical-device camera/detail/removal/retry/submission/PWA and
   manager/report acceptance beyond the owner-reported10-photo/reload Safari PASS
   in Issue81. That previous private-emulator acceptance is not cloud/real-cleaner
   proof. Do not claim the historical affected-device incident is resolved.

CAN WAIT: visual/layout polish, owned separately; no visual work here.
Known V1 constraints:20 is an initial pilot ceiling, not proof it fits every
Property; unsaved Files cannot persist over reload; unresolved crashed writers
may exhaust quota; no background orphan reclamation;100 distinct content
identities bound repeated removal/replacement; no HEIC conversion.

## Future release and rollback boundary (not executed)

Later authorization should stage compatible `publicChecklist`,
`publicClientReport`, `getChecklistRun`, `getChecklistEvidence`, then exact-SHA
Hosting, then `createChecklistRun` to enable new frozen policy2 Runs. Recheck
ordering against the approved runtime/source first. No new Rules/Storage rules,
indexes, notification or scheduler release is required by this feature.

After any policy2 Run exists, never blindly restore a single-photo-only backend:
preserve the compatible ledger/evidence and prefer fix-forward. Old Hosting can
hide additional photos and is not equivalent rollback. Capture actual affected
Function revisions/Hosting version before a separately authorized release.

## Delivery/privacy

All QA used synthetic local data. No Production reads/writes, billing change,
push, merge, cloud deploy, real photos or messages. Code stays in local Git.
The handoff includes sanitized summaries/selected synthetic evidence only;
omit raw logs, URLs/tokens, env/config credentials, databases, source originals,
dependencies, build trees and unrelated worktrees. Temporary suites exit;
preexisting dependency symlinks/untracked planning files remain untouched.
