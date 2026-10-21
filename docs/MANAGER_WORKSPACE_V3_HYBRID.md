# Manager Workspace V3 — real Hybrid C+A integration

Issue #51. Branch: `codex/manager-workspace-v3-hybrid`.
Base: V2 RC `7f941b7ace071777353d68c6c0cd1ff5656453f7`.
Main `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526` is an ancestor of that RC.
Original prototype: `feature/manager-workspace-v3-prototype` at
`1a0e38c74f23a23c6fb9d4ee528e10c8f84d09b6`; preserved, not merged.

## Integration, not a parallel application

Before: the standalone V3 prototype owned fictional records, simulated operations
and its own layout/state. The accepted V2 App already owned authentication,
membership checks, authorized services, controllers and action handlers.

After: App's existing ManagerAccessBoundary still authorizes access. A Sandbox/
emulator-only presentation boundary composes Dashboard.renderPresentation and
JobsPage.renderPresentation, retaining the original Job Detail children and
handlers. The existing developer presentation allowlist controls the preview
entry; it is not a backend privilege. `?workspace=v3` cannot activate Production.
Current/V2 remain available through Exit preview. No new state machine, provider,
package, query model or server endpoint was introduced.

| Surface | Authoritative existing path | New presentation |
| --- | --- | --- |
| Agora | useDashboardController → getOperationalDashboard | Existing attention ordering, primary item, overall summary, bounded Today/Tomorrow sample |
| Operação | useJobsWorklist → getJobs/getAllCleaners; JobsPage filtering/sorting | Retained worklist, property-name search, existing filters, calendar refinement, manual pagination |
| Selected Job | useJobDetailController → existing Offer/Assignment/Issue/Run/capability services | Original JobDetailV2Pilot, Intent Layer, forms and confirmations |
| Actions | Original App handlers/services | Preview selection/navigation never commits an operation; only original subsequent controls may do so |

V2 reuse: shell/navigation/account, tokens, Button/Panel/Row/StateLabel/SearchField/
Select/SegmentedControl/ErrorState/Skeleton/EmptyState, CompactServiceLifecycle,
DataProvenanceBadge, assignment presentation, translations and focus patterns.
No per-card reads. Selecting a Job performs only its pre-existing detail reads.

## Selective V3 reconciliation

Adapted C's intent/attention orientation, A's retained list/detail layout and
native Intl calendar-key approach. Source was compared with current RC; no blind
cherry-pick or wholesale prototype import. Rebuilt the adapter around actual App
contracts instead of prototype store actions.

Deliberately NOT integrated: A/B/C comparison engine, simulated offer/checklist/
notifications, fictional checklist editor/access codes, hourly compensation,
notification history, provider integrations or new approval/photo semantics.
Those remain isolated in the original prototype. No simulation is represented
as an operational result in the authenticated manager route.

## Calendar and context contract

Today/Tomorrow/Mon–Sun Week/specific date/previous/next use Los Angeles calendar
keys, including DST and year boundaries. They refine loaded scheduledDate values,
not completedAt and not new Firestore presets. The selected Job remains open
outside a changed period, with a visible explanation. Search/filter state and the
worklist DOM/scroll are retained. A different Job remounts its own form subtree,
so an old pending save cannot overwrite the next Job's unsaved local form.

Existing bounded service cursors and sort stay authoritative. Manual Load more
remains available even when the current local date range is empty. New request
generations prevent old pages/cursors publishing after filter/view changes.
Offers/Issues/Assignments similarly use the existing selected-Job epoch to reject
late results. History uses only a local workspace marker, preserves unrelated
history state, and clears its marker at Agora/worklist boundaries.

## Honest limits

- Calendar/worklist results cover loaded pages only, not every Job in a date range.
  Existing query-level service filters can further narrow this scope; Clear filters
  restores them. Distant dates may require manual pagination.
- Agora reuses the existing bounded Dashboard sample and priority ordering. Its
  overall operational counters are not selected-period totals. Today/Tomorrow
  show up to four loaded examples each plus Open this day, not a full agenda.
- The existing Dashboard service constructs its query window in the browser's
  timezone; this integration does not alter that backend/read contract. Calendar
  refinement itself is always Los Angeles. Outside that timezone the Dashboard
  sample may not cover the complete LA day; never infer completeness.
- No checklist/review/attendance aggregate is invented; no new checklist reads.
- Existing Sandbox Functions/Storage remain billing-gated. Read failures and
  unavailable operations stay visible/fail-closed, never redirected to Production.
- This is an operational frontend integration, not proof of all backend workflows
  in the billing-gated Sandbox. No physical iPhone or new human acceptance claimed.
- Refresh retains the preview query, not an invented persistent selected-Job URL.
- Repo visibility is public; this task authorizes push/Draft PR only if private.
  Therefore code is committed locally, not pushed, and no Draft PR is created.

## Validation / operator trial

Unit tests cover preview gates, LA midnight/DST/Mon–Sun, invalid dates, real
attention delegation, no navigation writes, error Retry, empty manual pagination,
single mount, per-Job pending edits, stale controller reads and stale pagination.
Browser tests execute the real App/services/controllers against a local synthetic
provider boundary; all operational writes are rejected, telemetry is memory-only,
external network is denied. Separate Rules tests run real disposable emulators.
These are distinct evidence levels, not a claim of live authenticated acceptance.

Commands (existing dependencies):

```sh
npm test
npx vitest run src/features/workspace src/features/jobs/useJobsWorklist.test.jsx src/features/jobs/useJobDetailController.test.jsx
npx playwright test --config playwright.workspace-v3.config.js
CLEANFLOW_WORKSPACE_QA_MODE=emulator npx playwright test --config playwright.workspace-v3.config.js --grep 'authorized manager|denied membership|attention opens|existing assignment|Current/V2|detail →|scroll offset'
npx playwright test --config playwright.authenticated-v2.config.js
node scripts/runIsolatedSecurity.mjs
node --test scripts/sandboxBuildGuards.test.mjs scripts/prepareHosting.test.mjs
```

Sandbox operator path: open the separately reported isolated Hosting channel with
`?workspace=v3`, sign in using the existing Sandbox manager/developer account.
Do not use a Production login. Existing Sandbox live is not the preview target.
First trial is read-only: Agora attention → exact Job, Today/Tomorrow/Week/date,
search/filter → selection, mobile Back, switch language/theme, Exit preview.
Do not press mutation confirmations for this first trial. Check unavailable
Functions honestly; do not enable billing or interpret unavailable reads as empty
real results. Ask the operator whether pending work and Tomorrow are identifiable
within a few seconds. Record physical-device and human acceptance separately.

Production exclusion is verified in both CURRENT and V2 artifacts: no workspace
component/CSS, prototype or synthetic fixture. No Production rollout, backend
change, cloud data mutation, billing change or other candidate update is part of
this task. Final build SHA, channel receipt, test totals and screenshot paths are
recorded in the local sanitized handoff.
