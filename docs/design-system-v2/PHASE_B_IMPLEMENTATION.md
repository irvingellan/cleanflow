# Phase B — implemented primitives and Sandbox catalog

Status: **IMPLEMENTED, branch-only, no deployment** (2026-10-06).
Phase A input: `baf77b53a67d0968e07be8428e891db83f904b4c`.
Verified original main baseline: `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526`.
Branch: `feature/design-system-v2-foundation`, isolated foundation worktree.
The original Intake/Telemetry/Safari checkout and its WIP remain untouched.

The original COMPONENT_CATALOG.md remains **DESIGNED**, not a claim that all
future page wrappers/shell components exist. This file is the implementation
inventory. No screen migration is authorized by this completion record.

## Locations and API

Shared exports: `src/components/v2/primitives.jsx` with opt-in
`primitives.css`. Only new consumers import them. Components accept translated
children/labels; there are no business strings, provider calls or rules inside.
No additional dependency, generic component framework or data abstraction.

| Exports | Small semantic contract |
|---|---|
| Icon | `name`; decorative currentColor SVG, no emoji. IconButton supplies accessible name. |
| Panel, Card | `title/actions/children`; Card `selected/subtle`. Borders, no card shadows. |
| Row | `selected/dense/onClick/action`; optional action is a sibling, not a nested button. Pass noninteractive row content. |
| StateLabel, StatusPill, InlineFlag | `tone/icon/children`; neutral, brand, info, attention, warning, risk, success, sandbox. Words + icon + color. |
| Tag, Count, Avatar | Translated classification/count; Avatar `initials/label`. No provenance normalization here. |
| EnvironmentIndicator | `environment/children`; sandbox dashed pill, quiet production metadata. It grants no authorization. |
| Button, IconButton | `variant/size/busy/disabled/blockedReason/onClick`; primary, secondary, tertiary, danger, danger-solid, icon. Normal/small/large. `blockedReason` stays focusable with aria-disabled and prevents callback. Native disabled/busy prevent callback. Busy content is supplied by consumer; no timer. |
| TextField, Select | `label/helper/error` plus native input/select props; Select receives `options`. Unique IDs, linked error/help description, aria-invalid. |
| SearchField | Controlled `value/onChange/clearLabel/label`; clear explicitly reports an empty value, never a query. |
| SegmentedControl, FilterChip, FilterToken | Controlled selection/callbacks; semantic button group and aria-pressed. Native Tab/Enter/Space, no invented tab-navigation model. Token removal is explicit. |
| Checkbox, Radio | `label` plus native input props, whole-label touch target. Consumers own state/group name. |
| Disclosure, TechnicalDetails | Translated `title/children`; closed by default, content stays mounted. Native details/summary keyboard semantics. Technical body uses dashed/internal/mono tokens. |
| ConsequenceDisclosure | `title/will/willNot` arrays from consumer; states no operational guarantee itself. |
| BeforeAfterDiff | `label/beforeLabel/afterLabel/before/after`; presentation only, no financial/schedule calculation. |
| ConfirmationSheet | Controlled `open/title/confirmLabel/cancelLabel/onConfirm/onCancel/danger/busy`; native modal dialog, safe initial focus, Tab loop, Escape, focus restoration. Opening never confirms. Consumer handles busy copy, errors and operations. |
| Skeleton | `label/rows`; static, actual row-height placeholders, aria-busy/status. No shimmer/timer or invented loading behavior. |
| SyncLine, StaleIndicator | Consumer-supplied translated status/time, polite announcement; no refresh/fetch/cache logic. |
| Banner, ErrorState | Translated message/action; ErrorState `retryLabel/onRetry/busy`, alert semantics. Retry only on explicit press. Can compose page/section errors. |
| EmptyState | `title/children/action/icon`; consumer differentiates first-run, filtered-empty and verified-all-clear. No failed-read-as-empty inference. |
| StickyMobileAction | `label/children/keyboardOpen`; one consumer primary action, safe-area padding and matching bottom clearance. Host must supply actual keyboard visibility; no new viewport hook/listener is invented. |
| LifecycleRail | `presentation/translate/stateLabels/compact`; consumes unchanged `serviceLifecyclePresentation()` output. Both full/compact variants; no history inference, reads or lifecycle transitions. |

## Theme / accessibility

All component colors use the Phase A `--v2-*` semantic roles. No hex/rgb or
legacy color variables in new CSS. Existing `index.css` is unchanged in Phase B.
Deferred contrast values remain unapplied to existing screens.
ThemeProvider retains stored/system preference and root `data-theme` behavior.

- Controls/rows/whole choice labels have at least 44px hit areas; small button
  text uses the approved small type but the actual hit box remains 44px.
- Focus: 3px role-colored outline / 2px offset, both themes.
- States use decorative stroke icon plus words; unknown/skipped lifecycle has
  dotted/dashed styling AND translated accessible text, never false checks.
- Native input/select/checkbox/radio and details semantics; segmented controls
  are pressed buttons, not falsely labeled ARIA tabs.
- Confirmation uses modal inert background, safe-button initial focus,
  explicit wrap-around focus, Escape and opener restoration. Busy disables
  confirmation/cancel; parent owns operation outcome.
- Static skeleton and no animated spinner: reduced-motion requires no hidden
  secondary behavior. Mobile inputs use 16px token to avoid iOS auto zoom.
- Sticky safe-area and hiding are presentation contracts, not a new keyboard
  detection service. Footer space is reserved only on compact widths.

## Catalog boundary and usage

Logical route: `/design-system/catalog/` (trailing slash), standalone HTML entry.
Local credential-free QA:

```sh
npx vite --config e2e/design-system/vite.config.js --host 127.0.0.1 --port 4190 --strictPort --mode e2e
# http://127.0.0.1:4190/design-system/catalog/
```

Sandbox builds include this entry only after existing environment/project guards
pass. It is a harmless internal visual catalog, not an authenticated data tool:
no App/Firebase initialization, Auth, telemetry, service worker registration,
remote fonts, data queries, network timers, demo seeding or persistent mutations.
Only local/static page/module/asset requests; no runtime API/provider requests.
All names/data are newly invented synthetic examples. EN/PT/ES sample copy is
catalog-scoped in `src/design-system/catalog/messages.js`; existing production
copy is not changed. Local examples only change in-memory presentation state.

Production keeps its original single entry. No catalog HTML, CSS, JS, route or
primitives ship in its assets. The unchanged SPA may fall back to its normal
root on unknown URLs; that is not a catalog route. Runtime catalog bootstrap
also denies non-Sandbox/non-loopback-test modes.
Hosting preparation reuses the existing pipeline; only Sandbox can allow the
named catalog HTML, `designSystemCatalog-*`, `catalogShared-*`, and Vite's
shared `src-*.css`. Production's original allowlist remains unchanged.
Symlinks/unknown files/temporary artifacts and wrong build/project still fail.
No deployment occurred and no public Sandbox URL is claimed live.

## Validation and reproducibility

```sh
npx vitest run src/components/v2/primitives.test.jsx src/theme/designSystemTokens.test.js
npm test
node --test scripts/prepareHosting.test.mjs scripts/sandboxBuildGuards.test.mjs
npx playwright test --config playwright.design-system.config.js
npx playwright test --config playwright.design-tokens.config.js
npx playwright test --config playwright.lifecycle.config.js
npm run build
npm run build:sandbox
git diff --check
```

Final evidence is recorded in PHASE_B_EVIDENCE.json. Catalog browser matrix:
light/dark × EN/PT/ES × 360/390/768/1280/1440 plus keyboard/edit/retry tests.
Rendered text contrast ≥4.5 (including secondary hover), 44px targets,
containment, no external/API requests or runtime exceptions, reduced-motion,
safe dialog focus/Tab/Escape/return checked in Chromium. This is not an axe
audit, screen-reader operator test or physical Safari/iPhone acceptance.
WebKit is not installed; no large browser/dependency was installed for this task.

Phase A visual harness rerun: 30 PNG-byte-identical before/after pairs for
Dashboard/Services/real Job Detail, light EN/dark PT, five widths. Existing
25 lifecycle/keyboard presentation tests pass. Additional build guard compares
**every Production file byte-for-byte against Phase A** at equal synthetic
build ID/config and denies catalog markers/assets in Production.

Eight fresh full-resolution PNGs under ignored
`artifacts/visual-smoke/design-system/`: catalog/system × light/dark ×
1440/390. These are local evidence, not deployed or copied real data.

## Intentional deviations / deferred work

- Reference artboards 03/04/20/21 inspected directly. Catalog preserves role
  hierarchy, bordered two-column panels, tokens, state weights and decision/
  loading patterns, not artboard pixel dimensions or page-specific demo cards.
  Mobile collapses to one column; neither source artboard specified this catalog
  layout. Portuguese examples replace the reference's invented business values.
- Catalog uses the 28px page-title token rather than the artboard's 40px
  display heading. Font uses the approved Inter/system fallback stack without
  downloading fonts; physical-device font metrics are not claimed validated.
- 13px token metadata for pills instead of the catalog's isolated 12px literal;
  tags use the approved 11px floor instead of 10.5px. No new arbitrary tokens.
- Small controls retain a real 44px box rather than overlapping invisible hit
  padding around a 36px visual; avoids collisions and favors operability.
- Before/after uses selected semantic surface (attention label); no new tone API.
- Confirmation is exercised as a real modal, not two permanently visible mock
  dialogs. No toast subsystem; polite synthetic result demonstrates feedback.
- System scenarios demonstrate static loading/refresh/stale/slow/error/empty,
  not new data-loading controllers, cache semantics or timing policy.
- No full icon pack, page wrappers, option-card framework, automatic keyboard
  detection, Shell, navigation migration, new business behavior or Intake reuse.
  No code copied from unrelated Intake WIP. Phase B references are not a new app.

## Next explicitly authorized phase

Recommend Phase C **application shell in a separate Sandbox-first slice**:
Sidebar/IconRail/AccountMenu/TabBar/MoreSheet/PageHeader consuming these
primitives, preserving every existing destination/control and existing server
authorization. Review desktop/mobile navigation before screen migrations.
Do not bundle Dashboard/Job Detail migration, changed contrast adoption,
Intake, telemetry or backend changes. Readiness is not merge/deploy permission.
