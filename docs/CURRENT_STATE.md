# CleanFlow — Current State

## Metadata

- **Last updated:** 2026-09-11
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
- `main` currently includes the recent Issue #39 and Issue #40 commits listed
  below. This checkpoint does **not** establish that either commit has been
  deployed to Hosting or Functions.
- Before a pilot release, follow
  [PILOT_RELEASE_RUNBOOK.md](PILOT_RELEASE_RUNBOOK.md): verify a managed
  Firestore export, intended Auth accounts, required secrets/configuration, and
  deploy Functions before Hosting when public-offer compatibility changes.

## Current highest priorities

1. **Issue #39:** deploy and validate the OneSignal-capable manager reminder
   transport while retaining FCM as the default until an approved cutover.
2. **Issue #40:** validate the Dashboard scroll-to-top control on the installed
   iPhone PWA after its containing build is deployed.
3. Continue the controlled pilot safely: preserve the spreadsheet in parallel,
   prioritize Today/Tomorrow visibility and manager feedback, and avoid
   speculative workflow expansion.
4. Continue only validated Job-model evolution slices; preserve legacy Jobs and
   explicit manager assignment control.

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
  secret configuration, provider selection, or a deployed cutover without
  fresh evidence.

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
  deployment, and controlled cutover validation.
- FCM retirement is neither decided nor completed.
- Issue #40 needs real installed-iPhone validation after deployment.

## Next actions

1. Run the controlled Issue #39 release gate with FCM still selected by default.
2. Verify the normal production FCM reminder path and no manager regression.
3. Configure required OneSignal server values/secrets through the approved
   production process; do not record secret values here.
4. During an approved quiet window, deliberately select OneSignal transport and
   observe one real 07:00 or 19:00 reminder plus its audit outcome.
5. Validate Issue #40 on the installed iPhone PWA after deployment.

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
