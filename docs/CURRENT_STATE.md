# CleanFlow — Current State

- **Updated:** 2026-09-30
- **Repository:** `main` remains the release source of truth. Manager Fast
  Path V2 (`5f14d63`) is deployed; the earlier photo-diagnostics and
  Cleaner-language release (`766883b`) remains deployed.
- **Production:** Firebase project `clean-flow-prototipo`; live app at
  <https://clean-flow-prototipo.web.app>.

## Current pilot phase

CleanFlow is in a real, gradual Gabi pilot. Gabi uses it for real Jobs while
still keeping her existing operational source in parallel. CleanFlow is not yet
the sole system of record for upcoming work. The immediate goal is learning and
adoption: reduce double entry, represent upcoming work reliably, observe a real
cleaning end to end, and agree with Gabi on an explicit pilot exit criterion.

## Production baseline

- The P0 manager authorization boundary is live. Direct manager access requires
  active organization `MANAGER` membership; the two pilot manager memberships
  were provisioned before release. The live manager smoke test passed and
  anonymous protected access was denied.
- Manager Fast Path V1 is deployed to Hosting from `d2f9a98` (2026-09-29):
  Jobs opens the existing creation form directly with local active-Property
  name/address search, an editable 11:00 time default and Property price
  suggestions; Property Directory has local search. The Job payout prefills an
  editable Offer proposal, with manager confirmation required because it may
  be a team total; an existing Offer snapshot remains authoritative. No
  Functions or Rules changed. Gabi has not yet validated this faster flow on
  her device.
- Production release records confirm manager checklist review, report-link and
  completion paths; public cleaner checklist/offer paths; and the approved
  cleaner-offer compensation snapshot. This confirms availability, not that a
  complete real photo-backed cleaning/report journey has succeeded.
- Hosting includes the deployed cleaner name search, Job guest/notes editing,
  manager-preview/manual-copy Property reminder, mobile photo retry target, and
  audited pre-start rescheduling. Rescheduling is deployed with its Rules and
  `rescheduleJob` Function. Any initial Checklist Run locks schedule changes.
- Cleaner Assignment acknowledgment v0 is deployed. The existing public Offer
  link can record a cleaner's attendance
  acknowledgment on the exact current Assignment; managers see awaiting or
  confirmed. Link possession is not identity verification. This does not alter
  Offer/Job/Assignment lifecycle, payment, or start/completion gates, and legacy
  Jobs without a safe Offer-to-Assignment relationship are not retrofitted.
- The review-handoff notification Function is deployed. Scheduled manager
  reminders use FCM; Irving has received a real reminder on a phone. Gabi's
  device-specific display remains unverified. Before the Notification Lab V1
  release, a narrow 2026-09-29 metadata read found four recent checklist-review
  events processed as `NO_ACTIVE_DEVICES` (zero targets), and all ten then-stored
  manager FCM registrations inactive. Recent scheduled reminders also showed
  FCM token invalidations. This confirmed a registration/eligibility blocker
  for those events, not the live permission state of either remote browser.
  Notification Lab V1 was deployed from `b5788e4` on 2026-09-29 with Hosting
  and only `getManagerNotificationDiagnostics`, `reportManagerNotificationHealth`,
  and `sendDeveloperTestNotification`. An approved manager browser loaded the
  lab and reported its current channel health; Gabi's current device state and
  phone display remain unverified. No developer test push has been sent.
  Page-load telemetry is diagnostic only, not an adoption metric.
- OneSignal remains a frozen experiment. Do not resume cutover or delete its
  existing browser integration unless a concrete FCM limitation is observed.
- Required-cleaner-count implementation `b4b35bf` is preserved on
  `hold/required-cleaner-count-2026-09-27`, tested but **not deployed** and
  removed from deployable main. Gabi rejected its hard full-team start gate;
  the held implementation is not approved for release
  (see [DEC-039](DECISIONS.md#dec-039--enforce-a-bounded-required-cleaner-count-per-job)).

## Manager Fast Path V2 — deployed

`5f14d63` was integrated into `main` and deployed on 2026-09-29 with targeted
`assignCleanerDirectly`, `completeJobWithoutChecklist`, and `createChecklistRun`
Functions, Firestore Rules, and Hosting. The three Functions were ACTIVE, and
the live HTML/JS matched the approved build in non-mutating smoke checks.

- For an active schema-v2 Job before work starts, a manager can select an active
  Cleaner and create an Assignment directly, without first sending an Offer or
  waiting for an `INTERESTED` response. Existing Offer/interest/Assignment paths
  remain available. Direct Assignment is visibly distinct from Offer-link
  acknowledgment; it does not claim the Cleaner confirmed attendance.
- A manager can explicitly complete an eligible `ASSIGNED` or `IN_PROGRESS`
  Job without a checklist only when no initial Checklist Run exists. The
  server checks the Job and Run together and records `completedAt`. Once any
  Run exists, completion remains through saved checklist handoff, manager
  review, and approval; the no-Run action cannot bypass it. Completed Jobs
  cannot start a new Run. Completion does not mark payment or payout paid.
- An assigned-cleaner reminder can optionally include a checklist link in the
  same manager-reviewed message. Preparing it creates the initial Draft Run if
  needed and issues a capability for the selected Cleaner before Copy or Open
  in WhatsApp is enabled. The manager still sends manually; no delivery state
  is recorded. Only one checklist capability is active per Run. Issuing a link
  for another Cleaner or replacing an existing one invalidates the prior link,
  so this is a limitation for team Jobs, not a multi-cleaner checklist workflow.
  Gabi confirmed that one assigned Cleaner can own the checklist on a two- or
  three-Cleaner Job; simultaneous checklist editing is not needed for this
  pilot ([DEC-042](DECISIONS.md#dec-042--one-assigned-cleaner-owns-the-pilot-checklist-on-team-jobs)).

These behaviors still require Gabi/cleaner real-use validation. Deployment
does not establish that the unresolved mobile photo failure or the complete
photo-backed journey is fixed.

**Checklist recovery deployed (2026-09-29):** real pilot evidence exposed
a DRAFT manager-copy error and a stale cleaner capability after a same-Cleaner
Assignment was removed and recreated. The saved Run remained DRAFT; the
capability's context revision no longer matched the Job. The released flow
distinguishes DRAFT from READY, guides explicit link reissue without losing
saved work, and allows a manager to explicitly abandon an optional DRAFT and
complete the eligible Job while preserving draft/evidence/history.
READY Runs still require normal review/approval. The real incident Run was not
altered during release; Gabi's device/workflow outcome remains unverified.

## Approved communication release

The WhatsApp click-to-chat handoff is integrated into deployable main for
manager-created Cleaner Offers and assigned-cleaner reminder previews. It uses
the existing reviewed message text, opens a prefilled draft for the manager to
manually send, and creates no sent/delivery state. It and Assignment
acknowledgment were deployed from `2630f7a` on 2026-09-27: only `publicOffer`,
Hosting, and the narrow server-owned acknowledgment-field Rules guard. The
existing roster path remains intact without required-count gates. HTTPS,
invalid-token behavior, Function ACTIVE state, and build/asset hashes passed
non-mutating smoke checks. Gabi/cleaner acknowledgment and actual WhatsApp
launch/manual-send behavior remain unvalidated. No WhatsApp API or automatic
sending is involved.

The Cleaner preferred-language boundary is deployed with `publicOffer`,
`publicChecklist`, and Hosting from `766883b` (2026-09-28), awaiting real
Gabi/cleaner validation. Generated Offer/reminder text and initial public
Offer/Checklist locale use only the allowlisted Cleaner preference, falling
back to English when missing or invalid; manager UI language remains
independent. Public projections include only the language code, and Property
free text remains verbatim.

## Real-use evidence

- Gabi has created real Jobs in CleanFlow. Selected real Properties from her
  Notion Property Directory were imported after explicit selection and preview;
  obvious duplicate Property records from that import were reconciled while
  preserving operational history. The broader upcoming-Job/Cleaner and
  system-of-record transition is incomplete. Do not describe the import as
  either “none” or a completed migration.
- Real cleaners have opened checklist links and entered checklist data. This is
  real use, but not proof of a reliable complete journey.
- A reported client-report “no longer available” incident has no confirmed
  cause: narrow reads found recent capabilities active and report requests
  succeeding, but did not identify the failed client request. The report UI in
  `main` now distinguishes permanently unavailable links (HTTP 404/410) from
  retryable load failures and warns before replacing an active shared link.
- The cleaner checklist supports JPEG, PNG, and WebP up to the current 5 MB
  limit; HEIC/HEIF is unsupported and the UI explains the supported formats.
  Token-free photo failure diagnostics are deployed, but the real mobile
  photo-upload failure remains unresolved. Do not claim resizing, retry
  guidance, or diagnostics resolved it.
- Irving's scheduled FCM receipt is confirmed; Gabi's reminder delivery remains
  a separate device/registration validation question.
- Astra read-only Runs A, D, and E and the Project X-Ray review are candidate
  audit evidence preserved in Issue #27. They are **not** a consolidated,
  approved implementation plan.

## Issue #49 — diagnostics UX (branch only, not deployed)

`feature/dev-diagnostics-wide-scrolltop-2026-09-30` adds a diagnostics-only
1600px maximum shell, responsive page/operation summaries, full-width Events
and visit waterfall, and shortened identifiers with full-value tooltips.
Other screen widths, telemetry queries/aggregation, and Issue #48 behavior
are unchanged. The existing shared scroll-to-top control is now reused by
Diagnostics and Dev Center at 600px; existing mounts retain 400px. It respects
reduced motion and keeps localized accessible labels. The observed `600.00 s`
success outlier is preserved exactly; its cause remains a separate investigation.
Local validation passed 690 unit and 27 emulator E2E tests, including EN/PT/ES
at 2560, 1920, 1440, 768 and 390px widths; desktop Events fit without horizontal
scrolling and all sizes avoid page overflow. Build and diff check passed.
These are Chromium/local-fixture checks, not real-device or production proof.
This work is not merged into `main` or deployed.

## Unresolved blockers / validation

- Issue #48 manager-access recovery (`d5342e8`) is merged into `main` and
  deployed to Hosting only (2026-09-30). HTTPS and live HTML/JS/CSS/worker
  hashes match the release. Entry now
  requires an explicit server membership read with a seven-second deadline,
  one automatic retry, and localized retry/offline feedback. Unresolved
  verification can recover on pageshow, visible resume, or online events;
  stale attempts cannot change access and realtime revocation is retained.
  A bounded session-local diagnostic trace excludes account/operational data.
  Validation passed 32 focused, 677 unit, 60 security and 11 E2E tests,
  including mobile offline reload/recovery. Live signed-in smoke was deferred
  to avoid automatic health/telemetry and push-registration writes; the
  isolated mobile browser smoke was inconclusive due to tool timeouts.
  Issue #48 remains open pending real installed-iPhone launch/resume and
  network-interruption checks. The indefinite cache-only listener path is
  confirmed; the precise iOS transport failure remains unverified.
- Capture the real photo-upload failure stage and safe error details, then
  observe one real cleaning through saved checklist, required evidence,
  manager review, report use, and completion. Until then, the full pilot flow
  is not proven reliable.
- Photo diagnostics correlate bounded browser/server stages and outcomes
  without checklist tokens or file contents. Browser-side evidence cannot be
  delivered while offline, and no real failure has yet been captured after
  this deployment; the cause remains unknown.
- Reduce double entry by reconciling upcoming work against Gabi's authoritative
  source. Define an explicit pilot exit criterion with her; do not assume the
  parallel-use period ends automatically.
- Validate Gabi's FCM device registration/delivery separately from Irving's
  successful reminder receipt. Do not force-run reminders or send test pushes.
- The owner report is a product hypothesis with external interest, not a
  roadmap commitment. Test value by using reports with owners and observing
  whether they value/open them.
- If Gabi is blocked in real work because a Checklist Run was created before a
  schedule change, revisit the current rescheduling lock with the smallest safe
  change. Otherwise keep the lock.
- Legacy and Assignment-aware Job paths are maintenance debt, not a reason for
  immediate cleanup. Before migration/removal, inventory real records, verify
  backup, identify history/monetary dependencies, and validate real operation
  for a short period.
- Consider resizing only if captured errors point to size/format; add more
  owner-report photos only after one-photo reliability; revisit capability
  consolidation before adding another link type. Do not treat these as current
  implementation tasks.

## Deployment holds

- **Required cleaner count (`b4b35bf`):** implemented/tested and preserved on
  `hold/required-cleaner-count-2026-09-27`, not in deployable main or production.
  Reviewed **KEEP AS-IS** technically before Gabi's product decision. Gabi
  rejected the hard full-team start gate. Do not reintegrate or deploy this
  held implementation as-is; any nonblocking team-capacity policy requires a
  separate bounded design and review.
- No OneSignal reminder-provider cutover is approved. FCM remains the scheduled
  reminder default.

## Pilot Evidence Gate

Pilot learning/adoption, not feature count, is the optimization target
([DEC-040](DECISIONS.md#dec-040--pilot-evidence-gate)). Build
now for a real production blocker, a direct repeated Gabi workflow need, or a
validated requirement with a bounded implementation. For hypotheses, run the
cheapest useful experiment first; park speculative expansion until real-use
evidence supports it. Keep necessary privacy/security boundaries; do not weaken
them to ship faster, and do not add proactive hardening without a concrete
failure or risk.

An implementation review does not validate a product rule. Track
**implemented**, **deployed**, **validated by Gabi**, and **proven in real use**
as distinct states.

Manager page-load events remain useful diagnostics but do not measure adoption
or product success. Pilot Evidence V0 is available as the one-cleaning
[observation checklist](PILOT_OBSERVATION_CHECKLIST.md) and the local,
read-only `scripts/pilotScorecard.mjs` aggregate command. Example:
`node scripts/pilotScorecard.mjs --project <project-id> --from YYYY-MM-DD --to YYYY-MM-DD [--expected-jobs N] [--allow-production-read]`.
It includes only Jobs with explicit `dataProvenance: REAL`; absent/UNKNOWN and
DEMO Jobs are excluded. Timestamp events use UTC dates, while `scheduledDate`
uses its stored date-only value. Completion requires `completedAt`; older
completed Jobs without it cannot be dated. Report opens are not recorded, and
report-link replacement history is not fully measurable. The command was not
run against production while implementing this slice; it performs reads only
and requires the existing Application Default Credentials plus an explicit
production-read acknowledgement for `clean-flow-prototipo`.

Manager Async Operation Telemetry V2 (#45) is deployed.
It records six allowlisted Job Detail read operations per random page visit in
append-only, manager-authorized diagnostics; the existing page-load events
remain unchanged. The internal load-times view adds bounded operation summaries
and a visit waterfall. These are latency diagnostics, not an adoption or formal
time-to-actionable metric. Authenticated real-user recording has not yet been
verified; deployment alone does not diagnose Gabi's loading experience.

Experiment before building persistent Cleaner Hub/My Jobs, owner-as-customer or
report-value assumptions, iCal versus AI intake, and deeper team-Job execution.
Park advanced financial/payroll and invoice/payment architecture,
payout-provider research, marketplace/network, broad AI assistant, and
speculative integrations.

Current evidence priorities:

1. Capture the real photo failure and complete one observed real cleaning.
2. Reconcile upcoming work and agree the pilot exit criterion with Gabi.
3. Validate Gabi's FCM reminder delivery and the V2 direct-assignment,
   optional-checklist, and bundled-reminder workflow after an approved release.
4. Test the owner-report hypothesis and gather only the scorecard signals
   needed to evaluate adoption.

## Fresh-session resume

1. Read this checkpoint, then the active GitHub Issue.
2. Read only the relevant source-of-truth docs and current implementation.
3. Prefer current code, deployment records, and recent pilot evidence over
   stale issue text or chat memory.
4. Preserve `.maestri/`, the Issue #36 import-preview stash, and local real
   export files. Do not access or alter production unless explicitly scoped.
