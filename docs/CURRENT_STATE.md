# CleanFlow — Current State

## Metadata

- **Last updated:** 2026-09-25
- **Repository:** `irvingellan/cleanflow` (`main`; four overnight Gabi pilot changes merged but not deployed)
- **Active product phase:** Gabi Pilot — controlled design-partner learning and
  validation alongside the manager's existing spreadsheet.

## Current product phase

CleanFlow is a manager-facing operational web/PWA for Clients, Properties,
Cleaners, Jobs, Offers, Issues, dashboard worklists, and legacy payout records.
It supports a gradual real-use pilot; it is not yet the sole system of record.
The Job model is evolving additively from legacy singular-cleaner behavior toward
manager-controlled Assignment rosters. Future execution, pricing, invoicing,
rescheduling, and Cleaner Hub work remain incremental.

## Environment and deployment state

- The controlled pilot uses Firebase Hosting at
  `https://clean-flow-prototipo.web.app` with Firebase Authentication,
  Firestore, Storage, and Functions.
- The P0 manager-authorization release is live at `167155c`: Firestore Rules,
  Storage Rules, the affected Functions, and Hosting were deployed together.
- The two approved pilot managers have active `MANAGER` memberships. A live
  manager smoke test passed; anonymous protected Firestore access returned
  `403`.
- Before a pilot release, follow
  [PILOT_RELEASE_RUNBOOK.md](PILOT_RELEASE_RUNBOOK.md): verify a managed
  Firestore export, intended Auth accounts, required secrets/configuration, and
  deploy Functions before Hosting when public-offer compatibility changes.

## Verified recent state

### Issue #39 — OneSignal and manager reminders

- OneSignal Web Push browser/subscription flow was manually validated on Safari
  macOS, Chrome macOS, an installed iPhone PWA, and Samsung/Chrome.
- The OneSignal dashboard integration uses Custom Code. Firebase Auth UID is
  the OneSignal External ID for manager targeting.
- A Safari content blocker was a confirmed prior OneSignal SDK failure cause;
  browser diagnostics and bounded failure states now exist.
- Scheduled manager reminders still use **FCM as the runtime default**.
- A provider-neutral, hardened OneSignal server transport is implemented:
  exactly one provider handles one claimed logical reminder; it never
  automatically falls back from an ambiguous OneSignal attempt to FCM.
- The provider-independent Firestore claim prevents cross-provider duplicate
  sends. OneSignal REST handling has a bounded timeout and conservative
  `UNKNOWN`/ambiguous outcomes.
- OneSignal reminder cutover has **not** happened. Do not imply production
  server-side OneSignal configuration or cutover without fresh evidence.
- Production explicitly runs `MANAGER_REMINDER_PROVIDER=fcm`; no OneSignal REST
  secret is configured or required for the scheduled-reminder path.

Recent commits:

- `ea27900 feat(notifications): add OneSignal browser diagnostics (#39)`
- `25cd53f feat(reminders): add hardened opt-in OneSignal transport (#39)`

At the Issue #39 validation checkpoint: 152 unit tests and 8 emulator-backed
E2E tests passed; build and diff checks passed.

### Issue #40 — Dashboard scroll-to-top

- Dashboard reuses the existing safe-area-aware `ScrollToTopButton` after the
  existing approximately 400px scroll threshold and smooth-scroll behavior.
- Local Mac browser validation passed.
- Commit: `0b7819c feat(dashboard): add scroll-to-top control (#40)`.
- Production and iPhone validation remain pending until that commit is deployed.

### Issue #42 — Cleaning Checklist Preview

- A shareable Firebase Hosting **preview channel** exposes the isolated
  `/checklist-preview` route. It is not a live-Hosting release.
- The design partner opened and tested the preview on mobile. The first
  validated feedback is incorporated: the checklist now has **28 items**;
  the under-bed/furniture check has localized **Photo required** guidance; and
  separate interior and exterior cigarette-butt checks were added.
- The validated global checklist definition is **v1 with 28 items**. Property
  checklist configuration is optional; an unconfigured Property receives v1,
  while approved cleaner-facing additions, inventory, photo requirements, and
  instructions can be resolved from `Property.checklistSettings`.
- `d25fc75 feat(checklist): add property-aware checklist run foundation (#42)`
  established immutable resolved checklist/configuration snapshots, so later
  Property edits do not alter historical Checklist Runs or reports.
- `693aafe feat(checklist): persist manager-created checklist runs (#42)` adds
  manager-authorized `createChecklistRun`. It transactionally creates or
  returns one initial `DRAFT` Run beneath its Job, preventing accidental retry
  duplicates without overwriting an existing Run.
- Phase 5A adds a monotonic `checklistContextRevision` foundation:
  missing legacy values read as `0`; archive/restore, Property, schedule,
  cleaner/Assignment, and eligibility-context changes advance it atomically so
  an earlier cleaner capability cannot survive a changed context.
- `79918ec feat(checklist): add secure cleaner capability (#42)` adds Phase
  5B locally: managers can create/open a persisted `DRAFT` Run and issue,
  rotate, or revoke one cleaner capability per Run. The server stores only a
  token hash; the expiring token is revalidated against the Job, Run, cleaner,
  and context revision on every `/checklist?t=…` read. That route exposes only
  the frozen cleaner-facing projection. It is not deployed yet.
- Phase 5C.1 locally adds one server-owned mutable cleaner draft per Run. A
  missing draft reads as virtual revision `0`; capability-authorized patches
  validate only frozen item IDs and use optimistic revisions plus idempotent
  receipts. Direct browser access remains denied, and managers receive a safe
  read projection with answers, notes, timestamps, and progress. It is not
  deployed yet.
- Phase 5C.2 locally adds the mobile cleaner editing UI on the existing
  `/checklist?t=…` capability route. It renders only the frozen Run projection,
  autosaves sparse answers and notes through the existing server mutation API,
  and reports saved, saving, offline-pending, conflict, and unavailable states.
  A small bounded local recovery record uses a capability hash rather than the
  bearer token and retries the same mutation ID after an uncertain response.
  It is not deployed yet.
- Phase 5C.3 locally hardens that pilot autosave path with bounded public
  requests, terminal explicit conflict choices, and a non-blocking local
  recovery-storage warning. Managers can manually refresh only the latest
  acknowledged draft progress; no polling, realtime sync, submission, or
  evidence upload is added. It is not deployed yet.
- Phase 5C.4 locally adds one capability-authorized `READY_FOR_REVIEW` handoff
  for the existing Run. It freezes the latest acknowledged draft as read-only
  through an idempotent Run-state transition. An active manager may then
  explicitly approve the reviewed Run to complete an eligible Job exactly once;
  this writes only the existing Job completion timestamp/status and context
  revision, never payment or payout state. It is not deployed yet.
- Phase 5D.1 locally adds one real, capability-authorized evidence photo for
  the frozen `living-belongings` requirement. While a Run is `DRAFT`, the
  cleaner can take or select one JPEG, PNG, or WebP image (up to 5 MB). The
  server derives the Storage path, persists only safe metadata, and rechecks
  the capability/Job/Run context; direct browser Firestore and Storage access
  remains denied. The photo is read-only after `READY_FOR_REVIEW` and is
  retrievable only through the cleaner capability or active-manager callable.
  It is not deployed yet. HEIC/HEIF conversion is intentionally unsupported.
- This change locally adds a manager-created client report capability for a
  `READY_FOR_REVIEW` Run. The manager can create, copy/open, replace, or revoke
  one seven-day link per Run. The public page is read-only and uses only the
  frozen Run snapshots/definition, the locked saved draft revision, and saved
  required photo; no live Property defaults are used. It excludes prices,
  payouts, access data, internal notes, private contact data, IDs, and token
  metadata. Links are manually shared; this report feature is not deployed by
  this change.
- A 2026-09-24 review-handoff correction distinguishes incomplete frozen
  checklist/inventory/photo requirements from invalid capabilities. Validation
  feedback preserves the editable draft; a valid handoff is shown only after
  the server confirms the persisted `READY_FOR_REVIEW` state. Commit `d4a98f6`
  is deployed; the real incident still needs a successful real-user retest, and
  the earlier photo-upload failure remains unverified.
- A 2026-09-24 visibility pass locally adds a post-attempt missing-requirements
  summary and field markers on the cleaner page; only server-confirmed evidence
  satisfies the photo requirement. The public projection adds only the safe
  assigned-cleaner display name and does not claim who holds the link. Manager
  Run detail now summarizes answers, restock, unanswered items, and notes before
  the full results; it keeps save/review times visible and puts IDs/revisions in
  closed-by-default Technical details. DRAFT explains that report/approval
  actions await cleaner submission. This visibility pass is included in the
  published `c3536e6` baseline.
- The current implementation adds a post-commit FCM manager notification for
  the first successful DRAFT-to-READY_FOR_REVIEW handoff. The Run transaction
  creates one stable, hash-identified delivery record; a separate Firestore
  trigger claims it once, rechecks active manager membership for eligible
  devices, and sends generic EN/PT/ES copy to the authenticated app home. FCM
  acceptance does not prove display on a device. After an initial Eventarc
  service-agent permission-propagation failure, the targeted deployment from
  `9455ff9` succeeded: `notifyManagersChecklistReadyForReview` is ACTIVE with
  the intended Firestore document-created filter on the Run's
  `managerNotificationDeliveries` subcollection, `retry: false`, and a
  60-second timeout. `publicChecklist` was then updated from the same commit.
  Hosting, Rules, Storage, indexes, and scheduled reminders were not deployed.
  App smoke returned HTTP 200 and a synthetic invalid checklist token returned
  404. No real handoff or push was triggered, so phone delivery is unverified.
- Public cleaner Offers now carry an optional manager-confirmed
  `offeredCompensation` snapshot. The manager's copyable WhatsApp message and
  `/offer/:token` show that same amount, or an explicit “Amount not set / To be
  agreed” state. Only pre-snapshot legacy single-cleaner Offers may fall back
  to Job `cleanerPayout`; schema-v2 Job totals are never treated as per-cleaner
  compensation. Interest/decline and manager-controlled Assignment behavior are
  unchanged. Commit `d8a67d5` was deployed on 2026-09-24 to the `publicOffer`
  Function and live Hosting. HTTPS returned 200; the hosted build marker and
  JS/CSS asset hashes matched the approved build; a synthetic unknown Offer
  token returned 404. No real Offer link or response was tested, and no
  operational record was changed.
- Cleaner review submission and explicit manager approval/Job completion exist
  in the current implementation. Automatic email/WhatsApp delivery does not.
- The preferred future workflow is: a manager manually shares a secure
  checklist link; a cleaner completes it; the submission persists in
  CleanFlow; the manager views or receives its report; and an optional email
  can later reach a client or property owner.
- Phase 5B local validation passed with 180 unit tests, 22 authorization
  emulator tests, 8 E2E tests, and a production build.

### Issue #36 — real-data import preparation

- The real Notion export has two underlying source tables, each exported in
  multiple variants. The richer canonical datasets contain a Property Directory
  with **43 properties / 3 Company values** and Operations with **269 rows**.
- The first pilot-week reconciliation window (Sep 18–24) narrows to **3
  Clients, 6 Properties, 4 Cleaner labels, and 6 Jobs**, including **1
  unassigned Job**. Historical Jobs are deferred.
- No real import has occurred. Experimental read-only import-preview work is
  preserved only in local `stash@{0}: issue-36-import-preview-wip`; neither
  the real Notion export nor real source data is in that stash or the
  repository.

### Issue #27 — Astra audit evidence

- Read-only Astra Runs A, D, and E completed. Their findings are preserved as
  candidate audit evidence in Issue #27; they have not yet been consolidated
  into an approved implementation plan.
- The P0 manager-authorization boundary is live. Direct manager access requires
  an active organization `MANAGER` membership; the approved pilot memberships
  were provisioned before release. The deployed scope includes `submitFeedback`,
  `registerManagerPushDevice`, `publicOffer`, and both scheduled manager
  reminder Functions.

## Important current invariants and decisions

- GitHub Issues are the execution backlog and actionable work record; repository
  docs hold durable product and technical truth.
- This file is the canonical lightweight operational checkpoint. A Google Drive
  copy may be human-readable context, but is not canonical.
- FCM remains the manager-reminder default until a deliberate controlled
  OneSignal cutover.
- Never dual-send one logical manager reminder through FCM and OneSignal.
- Firebase Auth UID maps to OneSignal External ID. Do not persist raw OneSignal
  browser push tokens in Firestore for server targeting.
- An ambiguous OneSignal outcome must not trigger automatic FCM fallback.
- Preserve pilot safety: gradual real use, the spreadsheet in parallel, explicit
  manager actions, and no silent production-data repair.

## Known limitations and pending validation

- Four approved overnight Gabi pilot changes are now merged to `main`, but are
  **not deployed**:
  - Cleaner photo guidance names JPEG, PNG, and WebP support; HEIC/HEIF remains
    unsupported. The real-device photo-upload failure remains unresolved.
  - Cleaner directory and offer selection support local name search while
    preserving selections; no server search was added.
  - The new Job Detail edit action covers guest name and notes only. Schedule
    editing remains deferred under DEC-029; completed/archived Jobs remain
    read-only.
  - Assigned-cleaner reminder content is previewed before manual copy and uses
    only the exact linked Property. Cleaner instructions may appear; parking,
    access instructions, and key/code details remain manager-preview/manual-
    copy only and require explicit opt-in. Nothing is sent automatically.
- The OneSignal manager audience currently derives from active
  `managerPushDevices`; a manager with only OneSignal and no valid active device
  record is not yet included.
- OneSignal server transport still needs staged production configuration,
  and controlled cutover validation.
- FCM retirement is neither decided nor completed.
- Issue #40 needs real installed-iPhone validation after the live deployment.

## Next actions

1. Review and deploy **Issue #42 Phases 5B–5D.1** when approved; then validate
   this single-photo pilot flow on a real phone before adding any broader
   evidence requirements.
2. Wait for further design-partner feedback on Issue #42.
3. Reconcile the six first-week Jobs for Issue #36 before any approved import.
4. Finish remaining Astra security/reliability audits if useful.
5. Consolidate audit findings before creating implementation work.

## Development workflow

- **ChatGPT:** orchestration, product/architecture decisions, review of Codex
  results, and focused prompt construction.
- **Codex Direct:** default for small or medium coherent engineering slices.
- **Maestri:** use only when two or more genuinely independent tracks reduce
  work; do not use it merely for sophistication.

Use Terra Medium for clear bounded work and Terra High for integrations,
backend/frontend boundaries, data/security work, or difficult debugging.
Reserve maximum effort for exceptional architecture, debugging, or a
Madrugada Run.

Permanent instructions belong in `AGENTS.md`,
[CODEX_GUIDELINES.md](CODEX_GUIDELINES.md), and
[AI_DEVELOPMENT_PLAYBOOK.md](AI_DEVELOPMENT_PLAYBOOK.md). Task prompts should
contain only the task-specific delta. Inspect first when the architecture or
root cause is uncertain; implement directly when both are known.

Quality gates for meaningful changes: `npm test`, `npm run test:e2e` when
warranted or for substantial changes, `npm run build`, and `git diff --check`.
Use human/device validation when behavior is mobile-, browser-, or
platform-specific.

## How to resume CleanFlow in a fresh session

1. Read this file.
2. Read the relevant active GitHub Issue(s).
3. Read only the source-of-truth documents relevant to that task.
4. Prefer newer evidence and checkpoints over old chat memory.
5. Do not reopen a verified decision unless new evidence contradicts it.
6. After a meaningful milestone, update the Issue and this checkpoint when the
   operational state changes.
