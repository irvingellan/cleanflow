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
- IMPLEMENTED LOCALLY: yes.
- OPERATOR ACCEPTED LOCALLY: yes, human review confirmed.
- SANDBOX PREVIEW RELEASED: yes; isolated channel only, not Sandbox live.
- AUTHENTICATED SANDBOX PREVIEW VALIDATED: yes; authorized Sandbox manager,
  read-only Chrome desktop/mobile QA completed after user sign-in.
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
Authenticated Services D1 Sandbox preview QA is complete; Production release is not approved.
Phase A/B, Phase C shell and original Intake/Telemetry/Safari worktrees are untouched.

## Isolated preview publication (2026-10-07)

Approved application SHA: `e37111bbc23aa714c60ff69df0b6f9912661cca5`.
Channel: `services-v2-d1` in `clean-flow-sandbox-irving`.
URL: https://clean-flow-sandbox-irving--services-v2-d1-shoy24hg.web.app/?services=v2
CURRENT comparison: select CURRENT in the same Services screen (same provider).
Release: `2026-10-07T02:34:49.199Z`, version `38592baeadb4fa7b`.
Expiration: `2026-10-14T02:34:46.973607233Z`.

Prepared with the existing protected Sandbox configuration, empty push config,
SHA-pinned `hosting:prepare`; all 22 deployed file hashes match the manifest.
Preview deploy used `--no-authorized-domains`; no Auth configuration was changed.
Only Hosting preview was published. No Functions/Rules/Storage/index/secret
deployment, operational mutation, seeding or Production deployment occurred.

Sandbox live remains Shell V2: version `7f122070f32a3e25`, release
`2026-10-07T01:04:54.015Z`, build `5e1a1c122398e0c11cc3842d4419080ef98628ce`.
Production build remains `5c2e52492331577a7cbdc4aa41a8f1a6b9771b45`.
These live markers were verified after preview publication.

Initial browser observation timed out during sign-in. After the user authenticated,
the existing Chrome preview session was usable; no credentials/tokens were
extracted or copied between origins. The in-app browser observation still timed
out, so authenticated evidence is Chrome, not Safari or a physical iPhone.

Authenticated QA used 10 existing Sandbox DEMO Jobs through the real provider:
search Coast = 1; Today = 0; Needs assignment = 3 (including OFFERED);
In progress = 3; Completed = 1; advanced cleaner filter = 7. Refresh correctly
labels previous rows before settled results. CURRENT and V2 show the same
Completed record and filter context. TEST provenance and unverified Offer history
remain truthful. No fake provider data was injected.

Current Job Detail opened and Back returned to Services; existing New service
form opened and was left without submitting. At 390x844 the measured completed
row anchor was 670.328125px before opening and after Back. Ten records fit in the
loaded page; continuation is not available for this dataset, so pagination beyond
one page remains covered by prior local tests, not an authenticated multi-page run.

Desktop 1440px and mobile 390x844: no page horizontal overflow. Visible Services
controls are at least 44px; desktop rows 72px. EN/PT, light/dark and the mobile
advanced filter sheet passed. Screenshots (ignored local artifacts):
`authenticated-desktop-light-en.jpg`, `authenticated-mobile-dark-pt.jpg`,
`authenticated-mobile-light-pt.jpg`, `authenticated-mobile-list-pt.jpg`,
`authenticated-mobile-filters-pt.jpg` in `artifacts/services-v2/`.

No create/edit/assignment/offer/checklist/payment/notification action was executed.
Final preview and Sandbox live verification rechecked all 22 prepared file hashes
for each; Production version marker remained unchanged. This is presentation QA,
not physical-device, performance, operational mutation or Production acceptance.

Rollback removes only the preview:
`firebase hosting:channel:delete services-v2-d1 --project clean-flow-sandbox-irving`.
Do not clone the preview to live. READY FOR SERVICES PRODUCTION RELEASE REVIEW,
not permission to merge/deploy. Production still excludes the Sandbox-only V2
variant; any release scope/gate change needs a separate explicit decision.
