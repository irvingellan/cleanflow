# Phase E1 — Dashboard presentation pilot

Baseline: exact Phase B `e4a3cfc9862e75b8680c237804fe703a3e45fd6b`.
Branch: `feature/design-system-v2-dashboard-pilot`. Isolated worktree; no Shell,
Services, Intake or Telemetry WIP copied. No merge/deploy authorized.

## Inventory before implementation

- Five KPIs: today (scheduled date), needs assignment, in progress, completed
  today (completion timestamp), open issues. First four retain their list filters;
  issues is informational, not a new drilldown.
- Attention: urgent assignment, interest, issues, pending responses, other
  assignment. Existing category representation/ordering and maximum **five**,
  not the artboard's six. Every item opens the existing Job destination.
- Next 48 hours: existing date/time selection and day groups, current cleaner
  lookup/roster summary and evidence-aware lifecycle. Missing time stays missing.
- Recently completed: existing five records, completion timestamps/unavailable
  fallback, same Job handler.
- Week: existing scheduled/assigned/needs-assignment/completed metrics and seven
  scheduled-date workload buckets. Completion-week and scheduled-week differ;
  neither is relabeled or recalculated.
- Controller: aggregate 20s deadline, generation guards and retained data. No
  independently ready sections or successful-read timestamp exist. V2 must not
  invent them. Retained data can be presented as previous data during refresh/error.

## Design deviations required by truth/isolation

Use current shell, not the pictured sidebar/bottom tabs. No New service shortcut,
new issue drilldown, invented update time, partial-load claims or new reads.
Mobile retains all weekly/history information rather than introducing unsupported
destinations. Canonical artboards: 08/09/10/11/22/28 Dashboard exports in MANIFEST.
The current attention item includes its existing status and action even where
Claude's illustration omits that detail. Day headings carry the actual service
date once, rather than repeating it on every Next48 row. Recent completion
precedes week/workload in DOM/mobile reading order, as required by this slice.

## Implementation and preservation

`Dashboard.jsx` has one optional presentation callback after its original
selection/grouping code. CURRENT keeps the exact early loading/error branches
and markup; V2 receives that same derived presentation model. No priority logic
was cloned. Same KPI filters, Job objects, view-all and refresh callbacks.
Service/controller, shared primitives, lifecycle model and legacy CSS are
byte-identical to Phase B. No new queries, partial orchestration, timestamp or
provider access. Shell/Services/Job Detail are not migrated.

`App.jsx` lazy-imports the pilot only in Sandbox mode and uses the existing
developer presentation allowlist inside authenticated ManagerApplication.
This is UI gating, never an authorization replacement. Production keeps CURRENT.
Default is CURRENT; `?dashboard=v2` or the comparison control selects V2 without
another read. V2 CSS is scoped; the 1200px content width applies only while V2
is actually rendered. No other page width is changed.

Phase B Panel, StateLabel, Button, SegmentedControl, Skeleton, SyncLine,
EmptyState and ErrorState are reused, plus the existing CompactServiceLifecycle
and ScrollToTop. Dashboard rows are ordinary single-action buttons, not toggle
rows (Phase B Row would add inappropriate `aria-pressed` semantics).
No nested action buttons. Unknown lifecycle history stays explicitly unknown.
Zero open issues is neutral; nonzero uses the risk role. Weekly bars retain a
visible track and zero height for a genuine zero. All styles use approved tokens.

## States

- Initial load: known labels/section shell plus Skeleton; no invented zero or
  successful section. The entire aggregate becomes ready together.
- Refresh with retained data: previous data stays visible, explicitly marked
  not confirmed current. No fictional update time or claim of faster loading.
- Initial error: actionable existing Retry callback; no successful sections.
- Refresh error: error/retry and previous-data warning, retaining the loaded
  snapshot. No cache response is promoted to confirmed success by this UI.
- Empty/sparse: true zero, existing empty copy and explicit missing time.
  No new create shortcut. Retry/deadline/generation remain controller-owned.

## Validation evidence

- 172 focused tests / 9 files: Dashboard V2 (18), CURRENT Dashboard/controller/
  service, Phase A integrity, Phase B primitives and lifecycle regressions.
- Full unit suite: **116 files / 1,292 tests passed**. First run found missing
  local function dependencies; reused already installed dependencies and reran
  the full suite successfully. No code workaround.
- Dashboard Playwright: **30 passed**. Widths 360/390/768/1280/1440, EN/light and
  PT/dark; additional EN/dark, PT/light, ES, keyboard, focus, >=44px targets,
  no overflow, handler/comparison parity, retry, reduced-motion configuration,
  visible secondary/state-label contrast >=4.5:1 in EN/dark and PT/light.
  All remote/API traffic blocked; no Firebase initialization in the harness.
- Phase A visual equivalence: **30 passed**, CURRENT Dashboard/Services/actual
  Job Detail byte-identical visual pairs. Phase B catalog: **31 passed**, using
  its existing unchanged local server without restarting it.
- Production and Sandbox builds passed with synthetic build-only configuration,
  no credentials or cloud calls. Existing large-bundle warning remains.
  `scripts/checkDashboardV2Build.mjs` positively checks Sandbox inclusion and
  Production exclusion, CURRENT retention and harness exclusion in both.
  Version environment mismatch fails closed. `git diff --check` passed.

Screenshots are ignored local evidence at `artifacts/visual-smoke/dashboard-v2/`:
`normal-1440-light-en.png`, `normal-1440-dark-pt.png`,
`normal-390-light-en.png`, `normal-390-dark-pt.png`; also heavy, initial loading,
refresh, initial error/retry, stale-error, empty and sparse at 1440/390.
EN/dark and PT/light captures also exist. Full exports are not committed.

## Local operator pilot

Run/reuse only the server for this isolated worktree:

```sh
npx vite --config e2e/dashboard-v2/vite.config.js --mode e2e
```

Open `http://127.0.0.1:4198/e2e/dashboard-v2/?dashboard=v2&lang=pt&theme=dark`.
Use CURRENT/V2 on the same in-memory fixture; use language/theme controls and
the closed **Local synthetic scenario** disclosure for heavy/loading/refresh/
error/empty/sparse. Retry resolves only a synthetic fixture. Row/KPI clicks
display the handler destination locally; they do not open or mutate real Jobs.
The harness renders the real Dashboard components within current shell CSS/
structure, substituting synthetic navigation/account controls; it is **not an
authenticated Sandbox QA result**. App integration retains the real current
shell and destinations. No harness source is imported by App or either build.

Review whether the first priority and next action are immediately clear and
whether mobile density stays comfortable in Safari at 100% zoom. Existing large
legacy header/navigation remains intentionally unchanged, not a V2 shell claim.
After local acceptance, seek separate authorization for an isolated Sandbox
preview and authenticated read-only QA. Do not merge or deploy from this record.

## Acceptance state

DESIGNED: approved reference. IMPLEMENTED LOCALLY: validated, ready for pilot.
OPERATOR ACCEPTED: pending. SANDBOX PREVIEW RELEASED: no.
PRODUCTION RELEASED: no. Production must retain CURRENT Dashboard.
