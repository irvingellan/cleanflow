# CleanFlow — Current State

## Metadata

- **Last updated:** 2026-09-19
- **Repository:** `irvingellan/cleanflow` (`main`)
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
- No cleaner public capability/link, real cleaner submission, photo storage,
  or email delivery exists yet.
- The preferred future workflow is: a manager manually shares a secure
  checklist link; a cleaner completes it; the submission persists in
  CleanFlow; the manager views or receives its report; and an optional email
  can later reach a client or property owner.
- At the feedback checkpoint, 156 tests and the production build passed.

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

- The OneSignal manager audience currently derives from active
  `managerPushDevices`; a manager with only OneSignal and no valid active device
  record is not yet included.
- OneSignal server transport still needs staged production configuration,
  and controlled cutover validation.
- FCM retirement is neither decided nor completed.
- Issue #40 needs real installed-iPhone validation after the live deployment.

## Next actions

1. Implement **Job Detail → Create checklist → show/open existing or new
   `DRAFT` Run** for Issue #42; later add the cleaner capability/link.
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
