# Design System V2 — canonical reference and Phase A

## Phase C1 — isolated Sandbox shell pilot

The subsequent explicit Phase C1 request authorizes only a developer Sandbox
shell pilot. Status: **OPERATOR ACCEPTED LOCALLY / SANDBOX RELEASED**, not
PRODUCTION RELEASED. [Implementation and controls](PHASE_C1_IMPLEMENTATION.md).
[Authenticated Sandbox release evidence](PHASE_C2_SANDBOX_RELEASE.md).
Screen-content migration remains separately scoped; Production retains CURRENT.

The product owner approved the design direction and authorized **Phase A only**
on 2026-10-06. The supplied documents retain their original design-reference
wording, including the earlier "not approved" labels in MANIFEST.txt. Those
labels describe the package's original review state, not this subsequent,
limited authorization. Nothing in this foundation authorizes later phases.

## Durable sources

The nine original text sources are preserved here: DESIGN_SYSTEM_V2.md,
COMPONENT_CATALOG.md, UX_AUDIT.md, SCREEN_INVENTORY.md, MIGRATION_PLAN.md,
CODEX_HANDOFF.md, VISUAL_ACCEPTANCE_CHECKLIST.md, TOKENS.json and MANIFEST.txt.
TOKENS.json is the canonical value source. MANIFEST.txt and CODEX_HANDOFF.md
retain every exact artboard filename and phase-specific reference.

[Optimized visual index](references/contact-sheet.jpg) preserves all 30
artboard thumbnails and their filenames at 2181 × 2400 (about 637 KiB).
It is a navigation/layout index, not a full-resolution typography specification.
The full PNGs, 11 MB PDF and canvas-runtime HTML were intentionally not copied.
The original package can be consulted for full-size imagery when a screen
migration is separately authorized; this implementation depends only on the
persisted text sources. No design artboard data was imported into fixtures.

## Phase A implementation contract

Baseline: `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526` from origin/main.
The isolated branch does not contain the unrelated Intake/Telemetry WIP.

- Forty `--v2-color-*` roles are explicitly defined in both :root themes.
- Other opt-in variables use `--v2-type-*`, `--v2-space-*`,
  `--v2-radius-*`, `--v2-size-*`, `--v2-layout-*`,
  `--v2-breakpoint-*`, `--v2-elevation-*` and `--v2-motion-*`.
- Numeric lengths use px, tracking uses em, weights/counts are unitless,
  durations use ms. Breakpoint variables are documentation/consumer tokens;
  CSS custom properties cannot substitute media-query boundaries.
- State meanings and reduced-motion policy remain in TOKENS.json; no motion,
  selector, layout, component or ThemeProvider behavior was changed.
- Approved new values exist as unused opt-in tokens. **No changed-from-current
  value was applied to existing UI.**
- Legacy aliases are per-theme and only used on exact value equality:
  14 light declarations and 19 dark declarations. Everything else remains
  its original literal, including differences the package's legacy map
  did not flag (headings, focus, several brand/status colors).
- LEGACY_VALUES.json records every original --color-* value and exact alias
  inventory. The integrity test resolves aliases and verifies all original
  values, not merely the package's changed-from-current list.
- All component rules/media queries after the theme blocks are byte-identical.
  No new component, icons, loading behavior, copy, business rules or data reads.

## Validation commands

```sh
npm test
npx playwright test --config playwright.design-tokens.config.js
npx playwright test --config playwright.lifecycle.config.js
npm run build
npm run build:sandbox
git diff --check
```

Build commands require the existing environment-specific local configuration;
it is not committed. The presentation harness is credentials-free and blocks
external/API/SDK traffic. The pixel test reads baseline CSS from the above Git
commit and compares original/current CSS on the same deterministic DOM:
Dashboard, Services and actual Job Detail (READY_FOR_REVIEW); light EN/dark PT;
360, 390, 768, 1280 and 1440 px. It saves 30 before/after pairs under ignored
`artifacts/visual-smoke/design-tokens/` and fails on any PNG-byte difference.
This proves synthetic Chromium presentation parity, not physical Safari or
authenticated-production acceptance. No deployment is authorized by this doc.

## Acceptance scope

VISUAL_ACCEPTANCE_CHECKLIST.md is retained for later screen migrations. In Phase A,
new shell/layout/typography/loading-state requirements are N/A: existing screens
are deliberately retained, including their current limitations. Applicable
scope/theme/source-value checks and zero-change screenshots are mandatory.
Do not "fix" existing visual issues while introducing tokens.

## Recommended next authorized slice

Phase B: presentational shared primitives plus a Sandbox-only component catalog
using artboards 03_component_catalog_light.png, 04_component_catalog_dark.png,
20_system_states_light.png and 21_system_states_dark.png. Keep current screens
untouched; no shell or data-access work and no contrast migration bundled in.
Reuse compatible approved Intake primitives only after they exist in the
chosen baseline; do not copy unrelated branch WIP automatically.

## Phase B implemented (2026-10-06, branch-only)

The subsequent explicit Phase B request authorized shared presentation primitives
and a standalone Sandbox-only catalog; it did not authorize any screen migration,
shell, merge or deployment. **READY FOR DESIGN SYSTEM V2 PHASE C** is readiness,
not release authorization. See [implemented inventory / API / boundaries](PHASE_B_IMPLEMENTATION.md)
and [validation evidence](PHASE_B_EVIDENCE.json). Original design sources above
remain DESIGNED; the implementation inventory is maintained separately.
