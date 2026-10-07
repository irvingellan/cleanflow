# Phase D1 — Services V2 pilot

Baseline: Phase B `e4a3cfc9862e75b8680c237804fe703a3e45fd6b`. Independent of Shell C.

## Pre-implementation inventory and primitive gap

Current `JobsPage` owns local name search, cleaner/property/client filters,
ordering, quick filters and anchor restoration. These must remain the shared
presentation model, not be duplicated in V2. Status/date filtering and pagination
remain in the existing controller/provider. Job Detail is not migrated.

Phase B `Row` currently cannot forward the anchor ref, `data-job-id`, or
accessible description. D1 needs a backwards-compatible `elementRef` and
attribute forwarding; no visual/default changes to the primitive. The existing
compact lifecycle remains evidence-aware; unknown history is not an empty history.
For D1's non-color-only requirement, LifecycleRail also needs an opt-in `markers`
variant with textual symbols. Default Phase B/catalog rendering remains unchanged.
Sandbox lazy splitting emits `ServicesV2Pilot-*.css` and `primitives-*.css`;
the existing manifest allowlist is extended for exactly these Sandbox-only names.

No global result count, authoritative refresh timestamp or separate address
search exists. Show loaded result count only; keep existing name search semantics.
The current controller has no retry callback. A reload would return to Dashboard
and is not a truthful Services retry. D1 uses one explicit retry generation to
re-run the identical existing load effect, only on operator click. No query
shape, provider, authorization or automatic-read behavior changes.

## Status

- DESIGNED: references 12, 23, 13 in MANIFEST.
- IMPLEMENTED LOCALLY: yes; operator review pending.
- OPERATOR ACCEPTED: no.
- SANDBOX RELEASED: no.
- PRODUCTION RELEASED: no; current Services remains the only Production variant.

## Architecture and preserved behavior

`ServicesV2Pilot` is a Sandbox-mode-only lazy screen, mounted only for the
existing developer presentation permission inside ManagerAccessBoundary. It
defaults to CURRENT; the explicit CURRENT/V2 controls write only the local URL
query and component state. Both variants consume identical App/controller props.
This UI gate is not authorization and does not replace any server guard.

`JobsPage.renderPresentation` forwards its existing computed model and anchor
ref to V2. Its existing sorting, search/filter callbacks, memoization, scroll
effect and CURRENT JSX remain unchanged. The controller only gains an explicit
retry trigger; no normal-render reads are added. V2 uses Phase B Row, Button,
SearchField, FilterChip, Select, ConfirmationSheet, Skeleton, SyncLine,
EmptyState, ErrorState and LifecycleRail plus the existing provenance badge and
ScrollToTopButton. No new provider, read, service or fetch controller exists.

- New service, open current Job Detail, manual pagination and authorized
  excluded/archive visibility use original callbacks.
- Today/status quick filters and all advanced status/date/cleaner/property
  choices are preserved, including alphabetical choices and client context.
- Local search continues to match saved/current Property names. A dedicated
  Address-field search is not implemented by CURRENT and is not invented here.
- Active ordering and completed ordering are untouched. Only contiguous dates
  are grouped; regrouping globally would incorrectly reorder the worklist.
- Multi-cleaner and missing-identity fallbacks use `assignedCleanerSummary`.
- Provenance REAL/TEST/UNKNOWN and archive badges remain functional.
- No financial columns. Job Detail financial fields/handlers stay untouched.
- Lifecycle uses `serviceLifecyclePresentation({job})`; omitted Offers remain
  unknown history. Text markers and accessible labels distinguish all states.
- Checklist progress remains available in Job Detail. List-level checklist
  summary requires an efficient canonical read model and is not introduced in D1.

## Responsive, localization and state system

Only V2's container expands to a maximum of 1560px. Desktop has dense columns;
mobile reflows to time + Property, compact cleaner/client context, lifecycle and
secondary provenance, not a squeezed desktop table. Filters reuse the Phase B
modal with a bottom-sheet layout on mobile, Escape, focus containment and return.
Changes take effect immediately as in CURRENT; closing does not pretend to undo
filters. No total-wide count is claimed: count is loaded matching rows only.

EN/PT/ES use the current translation provider plus scoped V2 copy. Both themes
use semantic tokens. Buttons/rows have 44px minimum targets, visible focus,
native inputs, no horizontal overflow, lifecycle symbols/labels, and the shared
reduced-motion/safe-area behavior.

Initial loading uses Skeleton; refresh retains rows clearly labeled **previous
results**. Errors remain errors with stale labeling and an explicit Retry.
There is no invented last-updated time, freshness proof, cached-success claim,
autonomous refresh or masked performance guarantee. Retry re-runs the existing
load effect with unchanged filters; existing cleanup ignores superseded responses.

## Design deviations

References: `12_services_desktop_light_en.png`,
`23_services_desktop_dark_en.png`, `13_services_mobile_light_en_pt.png`.

The current shell is retained, not Claude's sidebar/tabbar; no Shell code is
ported. Current Job Detail/create form remain unchanged. Keep all provenance
badges, not just mockup exceptions. Preserve real ordering rather than the
mockup's globally date-ordered completed rows. No invented 47-service total,
address-index behavior, filter-result estimate, avatar identity or refresh time.
Mobile combines cleaner/client into one secondary line to reduce card height.
Lifecycle keeps explicit markers instead of color-only tiny segments.

## Validation and operator handoff

- Focused: 238 tests across 9 files (19 new Services + 3 retry cases).
- Full unit: 117 files / 1296 tests.
- Playwright: Services 11; existing catalog 31; legacy pixel equivalence 30;
  lifecycle/Job Detail 25. Widths 360, 390, 768, 1280, 1440, light/dark,
  EN/PT plus ES. Synthetic provider APIs throw; no Firebase network requests.
- Environment/build/preparation guards: 24; Production and Sandbox builds pass.
- Production excludes Services V2 CSS/implementation/copy, catalog and harness;
  CURRENT visuals remain available. Existing bundle-size warning remains.
- `git diff --check` passes. No deployment/emulator mutation is required.

Local operator URL (no login, memory-only synthetic data):
`http://127.0.0.1:4195/e2e/services-v2/?services=v2&lang=pt&theme=light`.
No tutorial is required. CURRENT/V2 comparison stays on the same fixture context.
Opening services displays the current Job Detail with synthetic data; save paths
cannot reach a provider. New service opens the current form; persistence is denied.

Screenshots are generated locally (not checked in) in
`artifacts/services-v2/`: desktop-light-en, desktop-dark-pt, mobile-light-en,
mobile-dark-pt, filter sheets, search/no-results/needs-assignment, loading,
refresh, empty and error/retry. `*-viewport.png` is a first-screen view; base
files contain the full long list. Reproduce with:

```sh
npx playwright test --config playwright.services-v2.config.js
CLEANFLOW_CATALOG_TEST_PORT=4197 npx playwright test --config playwright.design-system.config.js
```

Recommendation: READY FOR SERVICES OPERATOR PILOT locally, not release approval.
Authenticated Services D1 Sandbox acceptance and any release remain pending.
Phase A/B, Phase C shell and original Intake/Telemetry/Safari worktrees are untouched.
