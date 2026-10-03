# CleanFlow — Current State

## Issue #56 — Weekly Close V0 selective port (2026-10-03)

Branch `feature/weekly-close-v0-current-main-2026-10-03` selectively ports the
validated older implementation onto `ff14c2b`; the old branch is not merged.
Manager-only `/weekly-close-preview` is read-only and not deployed. It groups
REAL, non-archived COMPLETED Jobs by saved Client identity and Monday–Sunday
service date, using Job price snapshots and explicit known subtotals. Paid
payout proof requires a unique reciprocal single-Job link, matching amount,
cleaner/organization and valid paid timestamp. Team/v2/batch ambiguity remains
UNKNOWN; no client payment or invoice status is inferred. Server-only financial
reads reject cache/pending writes; loads have a 15-second absolute deadline,
retry and stale-response protection. See [data gaps](WEEKLY_CLOSE_V0.md).
No backend/schema/Rules/index changes, production reads/writes or deployment.

- **Updated:** 2026-10-01
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

## Issue #53 — current-device notification self-test

`47bceeb` was reviewed, integrated into main and deployed on 2026-10-01.
Any active manager can explicitly tap **Enable & test
notifications** beside the existing notification status. Permission is requested
from that tap; denied permission instead shows settings guidance. The flow
refreshes the existing local device UUID's FCM registration before calling
`sendCurrentManagerTestNotification`. Server authority derives from the signed-in
UID, active membership and exact owned registration; no arbitrary token,
registration ID or push copy is accepted.

A fixed visible-capable test uses SDK background display and test-only
foreground receipt handling, without duplicate worker display or operational
reminder changes. A server-owned 60-second cooldown/audit permits just one
changed-token recovery after confirmed invalid-token rejection; ambiguous
outcomes never auto-retry. Delayed passive registration cannot overwrite the
explicit refresh. Results distinguish blocked permission, registration failure,
FCM rejection/acceptance and unknown outcome. Acceptance is not phone-display
proof. Validation passed 118 focused, 845 unit, 66 security and 35 emulator E2E
tests, including five narrow mobile UI checks; build, syntax and diff checks
passed. The owner subsequently confirmed physical test display on a real
installed iPhone PWA and iPad (Issue #53, 2026-10-01); the apparent duplicate
iPhone banners were explained by repeated manual taps. Gabi-device validation
remains pending. No real test push was sent during implementation or release verification. Only
`sendCurrentManagerTestNotification` (ACTIVE) and Hosting were deployed; all 29
previous Function code hashes are unchanged. Live HTTPS returned 200 and all
14 deployed file hashes match `47bceeb`; an anonymous callable request returned
401 without a test attempt. No Rules, indexes, Storage or other Functions were
deployed. Issue #53 remains open for Gabi's explicit real-device test.

## Issue #55 — manager notification reliability (deployed)

`2fbdcdd` and `1d4a8cf` were reviewed, fast-forwarded individually into `main`
and released on 2026-10-01. **Operational real-device delivery is not yet
validated**; Issue #55 remains open.
Public Offer interest and exact Offer-backed Assignment acknowledgment now
create server-only notification events atomically with their first transition.
Interest identity includes the existing Offer creation timestamp so a normal
same-ID re-invite does not collide; timestamp-less legacy receipts remain
conservative without preventing the business response. Acknowledgment identity
includes the exact Assignment and source Offer. Neither path sends inside the
transaction/HTTP response, retrofits direct Assignments, or backfills old events.

Checklist review retains its existing atomic handoff event. Trigger processors
claim one attempt, bound FCM to 15 seconds, audit partial/unknown results, and
never retry ambiguous outcomes or switch providers. Five-second, transactional
invalid-token cleanup compares the sent token/owner/organization to the current
registration; a refresh is not disabled and cleanup failure does not erase the
provider result. Scheduled reminder selection/copy/claims remain unchanged;
only their shared cleanup/recipient helpers are reused. Browser access to
delivery claims remains default-deny. Notifications contain only localized safe
copy, bounded Cleaner/Property display names when applicable, and a normal
authenticated entry link. FCM acceptance is not phone-display proof.
The existing foreground FCM receipt handler now includes the fixed operational
event allowlist, not only the self-test. Normal successful registration attaches
one handler; actual receipts display through the same worker, never from API
acceptance. Sign-out/account changes suppress stale foreground display, while
the existing data-only background worker remains unchanged.
Passive enrollment also checks the originating account before attaching that
receiver. The existing bounded diagnostic sample identifies all three event
types; no new query, reporting screen or telemetry collection was added.
Validation: 295 focused, 934 unit, 78 security/emulator and 35 E2E tests passed;
build, server syntax and diff checks passed. Fixtures used isolated synthetic
demo emulators, not production or the owner's existing local emulator data.
Conservative limitations remain: a crash after claim or an uncertain FCM result
can miss a notification; an outcome-write failure can leave `SENDING`. No
automatic retry/backfill is introduced.

The targeted release deployed `notifyManagersOperationalEvent` first and verified
its ACTIVE revision and intended Firestore trigger before updating `publicOffer`.
Then `notifyManagersChecklistReadyForReview`, `getManagerNotificationDiagnostics`,
`sendTomorrowPlanningReminder` and `sendTodayExecutionReminder` were deployed;
all six Functions are ACTIVE with matching source-archive checksums. All 25
unrelated Function code hashes remain unchanged. Live reminder configuration is
still FCM, 19:00/07:00 in `America/Los_Angeles`. Hosting followed only after
Function verification: HTTPS returned 200, the build marker matched, and all 13
published file hashes matched the build from `1d4a8cf`. No Rules, indexes,
Storage, provider/secret changes or live business/test-push actions were performed.
Next evidence: physical display for first cleaner interest, checklist review
handoff and exact Assignment confirmation, plus the affected manager's explicit
current-device self-test. Provider acceptance or this release alone does not
resolve remote-device delivery.

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

## Issue #49 — diagnostics UX (deployed)

`8003f72` was fast-forwarded into `main` and deployed to Hosting only on
2026-09-30. It adds a diagnostics-only 1600px maximum shell, responsive
page/operation summaries, full-width Events
and visit waterfall, and shortened identifiers with full-value tooltips.
Other screen widths, telemetry queries/aggregation, and Issue #48 behavior
are unchanged. The existing shared scroll-to-top control is now reused by
Diagnostics and Dev Center at 600px; existing mounts retain 400px. It respects
reduced motion and keeps localized accessible labels. The observed `600.00 s`
success outlier is preserved exactly; its cause remains a separate investigation.
Local validation passed 690 unit and 27 emulator E2E tests, including EN/PT/ES
at 2560, 1920, 1440, 768 and 390px widths; desktop Events fit without horizontal
scrolling and all sizes avoid page overflow. Build and diff check passed.
These are Chromium/local-fixture checks, not real-device proof. Live HTTPS,
version marker and HTML/JS/CSS/worker hashes match `8003f72`; the anonymous
diagnostics route renders sign-in without overflow at desktop/mobile widths.
Signed-in live Diagnostics/Dev Center layout and scroll interaction remain
unverified: entering the shell can automatically write notification health or
refresh FCM registration, which the zero-production-write release forbade.
No Functions, Rules, indexes, Storage, telemetry semantics, or #48 behavior changed.

## Issue #50 — photo validation diagnostics (deployed)

`bdd88e1` was fast-forwarded into `main` and released on 2026-09-30 to only
`publicChecklist`, ACTIVE revision `publicchecklist-00007-qur`. Its deployment
fingerprint matches the reviewed source; the other 28 Functions are unchanged.
Token-free endpoint checks returned bounded 404s; app HTTPS returned 200.
Server-only allowlisted reasons now distinguish body/type/signature failures
from later capability/context rejection. Browser reason injection is denied;
public errors, authorization, 5 MB limit, accepted formats and retry behavior
are unchanged. No Hosting, Rules, indexes or Storage rules were deployed.

The two correlated iPhone failures declared JPEG/1–3 MB and failed before
Storage/metadata. **Root cause is NOT YET DETERMINED; no upload fix was deployed.**
The server `up_to_1mb` bucket includes zero bytes. Synthetic camera/library
roundtrips preserved all 2 MiB through mobile Chromium and local
emulator-equivalent parsing, not production Safari. WebKit was unavailable.
Release validation passed 146 focused, 739 unit, three focused security and
three photo browser tests, build, syntax and diff check.

Next real failure protocol (not executed): preserve its visible diagnostic code
and approximate time; do not unnecessarily replace/revoke the link. With explicit
read authorization, query only correlated bounded browser/server diagnostics,
retrieve `validationReason`, distinguish body/signature from context failure,
and only then design a fix. If the attempt succeeds, record non-reproduction,
not an invented root cause. No production photo was uploaded or inspected
during this release.

## iOS Safari transport hotfix — branch prepared, not deployed

Fresh Gabi evidence on 2026-10-01 exposed two iOS/Safari failures that share the current root Service Worker boundary: the installed/Home Screen and direct Safari app path can fail with `FetchEvent.respondWith ... TypeError: Load failed`, while a cleaner's required photo upload failed again with diagnostic code `3EEF8A37`. Current CleanFlow sends the selected disk-backed `File` directly as the PUT body and the root worker re-fetches every request with `respondWith(fetch(event.request))`.

A current WebKit regression report for Safari/iOS 26.x documents disk-backed `File` bodies arriving empty when serialized through affected Service Worker/network paths, while reading `file.arrayBuffer()` and sending a fresh in-memory `Blob` succeeds. The focused branch `hotfix/ios-safari-transport-2026-10-02` therefore makes two deliberately small transport changes: materialize the already-bounded <=5 MiB checklist photo into a fresh in-memory Blob before PUT, and remove the root worker's network-only fetch handler so normal browser networking handles requests directly. The dedicated Firebase Messaging worker is unchanged. Tests were added for the in-memory Blob contract. This branch is **not deployed and not yet claimed production-proven**; it still requires the normal test/build/diff gate and a real Safari/iPhone validation.

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
  **2026-10-01 recurrence:** the manager-access gate hung again on installed
  iPhone PWA and desktop Safari. The original recovery is not sufficient.
  `edc71c4` was fast-forwarded into `main` and released to Hosting only on
  2026-10-01. It fixes a reproduced
  lifecycle-churn defect: repeated signals could replace a stalled attempt and
  continually reset its seven-second watchdog. An 18-second absolute outer
  window now survives retries; in-flight signals are suppressed, and expiry
  exposes stable Try again / Sign out until a manual retry. Server-only
  authority, cache rejection and realtime revocation remain intact. Two new
  allowlisted stages join the existing max-30 session-local trace. Live HTTPS
  returned 200; the build marker and all 14 deployed file hashes match
  `edc71c4`. No Functions, Rules, indexes or Storage were deployed. The defect is
  confirmed in synthetic tests, not proven to be the sole real Safari cause.
  Hotfix validation passed 44 focused, 769 unit and 30 emulator E2E tests,
  build, syntax and diff checks, including both mobile recovery E2E tests.
  Mobile Chromium kept recovery controls stable through 24 seconds of lifecycle
  churn. Issue #48 remains open for real installed-iPhone/PWA and Safari retest;
  no signed-in production smoke was attempted, avoiding automatic registration
  and telemetry writes.
- Capture the real photo-upload failure stage and safe error details, then
  observe one real cleaning through saved checklist, required evidence,
  manager review, report use, and completion. Until then, the full pilot flow
  is not proven reliable.
- Photo diagnostics correlate bounded browser/server stages and outcomes
  without checklist tokens or file contents. Browser-side evidence cannot be
  delivered while offline. Two captured iPhone requests failed server validation
  before Storage; the precise branch and cause remain unknown pending another
  real capture with the now-deployed #50 reason diagnostics.
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

## Compatibility cleanup V1 (#52) — deployed

`1d835a9` was reviewed, fast-forwarded into `main`, pushed, and released on
2026-10-01. It preserves legacy Cleaner history while adding deduplicated v2
roster queries with the existing history windows, batched Dashboard roster-name
resolution, unarchived REAL scorecard totals with a separate archived scheduled
count, and archived-Job public Offer denial without mutation. Assignment
acknowledgment remains archive-denied.

Only three collection-scoped Cleaner-history indexes, `publicOffer`, and
Hosting were deployed. All three indexes were verified `READY` at
08:35:59 UTC **before** either application surface was released. Production
query-shape probes using a nonexistent Cleaner returned HTTP 200 with no
records. `publicOffer` is ACTIVE at `publicoffer-00010-luv`; the other 28
Functions are unchanged. HTTPS, version marker and HTML/JS/CSS/worker hashes
match `1d835a9`; an unknown synthetic Offer token returned bounded 404.

Validation passed 66 focused and 757 unit tests, 62 security tests plus one
isolated emulator history-query probe, build, syntax and diff checks. Archived
Offer GET/POST/acknowledgment denial and non-mutation were tested synthetically.
Signed-in live Dashboard/Cleaner History UI smoke remains unverified to avoid
automatic push-registration/diagnostic writes; #52 remains open for that check.
No Rules, Storage rules, unrelated Functions, operational data,
migration/backfill, Workspace/visual, photo, notification, or manager-access
changes were released.

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
Active totals include only unarchived Jobs with explicit
`dataProvenance: REAL`; archived REAL Jobs scheduled in the period are counted
separately. Absent/UNKNOWN and DEMO Jobs are excluded. Timestamp events use UTC
dates, while `scheduledDate`
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

## Issue #61 — bounded Dashboard recovery (not deployed)

Issue #61 Dashboard recovery is implemented locally, not deployed: each load
has a 20-second deadline, then the existing localized error/Refresh action.
Retry starts a fresh generation; late responses, view changes and unmount cannot
publish stale data. Resume events check, never renew, the deadline. Synthetic
stalls cover initial reads, Offers, Issues and Cleaner names. The incident's
specific pending read is unproven: existing telemetry records completed loads
only and has no Dashboard stage events. Authorization/data semantics are unchanged.

## Fresh-session resume

Issue #64 Job Detail Intent Layer V0 is implemented only on
`feature/job-detail-intent-layer-v0-2026-10-02`, not deployed/integrated. It adds
one suggested next step and five visible intentions to the existing Job Detail,
using current forms, reminder preview, Run-open and completion confirmation.
Schedule/Run locks and backend rules are unchanged. Draft PR #63 remains separate.
Synthetic visual checks: `npx playwright test --config playwright.job-intent.config.js`.

1. Read this checkpoint, then the active GitHub Issue.
2. Read only the relevant source-of-truth docs and current implementation.
3. Prefer current code, deployment records, and recent pilot evidence over
   stale issue text or chat memory.
4. Preserve `.maestri/`, the Issue #36 import-preview stash, and local real
   export files. Do not access or alter production unless explicitly scoped.
