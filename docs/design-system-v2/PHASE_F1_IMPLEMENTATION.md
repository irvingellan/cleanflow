# Phase F1 — Job Detail desktop pilot

Branch-only, local synthetic operator pilot. No merge or deploy authorization.
Baseline: `e4a3cfc9862e75b8680c237804fe703a3e45fd6b` (verified Phase B).
Approved reference: artboards 14/24 and 16/25 in the canonical Claude package.

## Composition and operational truth

The existing `JobDetail` remains the only controller/presentation-rule owner.
An optional presentation callback receives its existing identity, summary,
Intent Layer, detail groups and scroll control as React elements. The CURRENT
path has the same DOM order/content. No handler, guard, service or query is
reimplemented. The original 64 bindings described in `JOB_DETAIL_V1.md` remain.

`JobDetailV2Pilot` changes only desktop composition: identity and operational
label, attention above lifecycle, cleaner and checklist summary cards, seven
detail groups, and a 360px decision rail at >=1100px. The rail holds the ONE
existing Intent Layer, not a second action engine. Its primary derivation,
blocked-action notices and reveal/focus callbacks remain unchanged.

The real app imports this wrapper lazily only in Sandbox for the existing
developer presentation gate, inside the unchanged manager boundary. The query
`?jobDetail=v2` is opt-in; CURRENT remains default. Below 1100px CURRENT renders
even with the query. Comparison preserves JobDetail's controlled form state.
Native disclosure DOM may remount when switching presentations: it starts
closed again, but entered controlled values remain; no save/mutation occurs.

### Preserved seven groups

| Group | Existing controls retained |
| --- | --- |
| Service details | Guest/notes edits, audited schedule edit and checklist lock |
| Cleaner & assignment | Direct picker, roster, acknowledgment, reminder preview/manual sharing and private-data opt-in |
| Checklist | Existing Run, create/open/refresh, capability controls, execution and completion confirmations |
| Offers | Existing offer selection, individual compensation, links/responses and manager assignment |
| Issues | Existing issue review, resolve and refresh |
| Financial | Historical Job prices, edit prices and derived gross margin |
| History & administration | Timestamps, provenance review, archive/restore |

All content stays mounted inside closed disclosures in either presentation.
Opening a group or selecting an intent does not mutate. The same real controls
are still required to confirm changes. DRAFT never promises schedule unlock;
COMPLETED/archived retain historical primary and no operational intent grid.
Lifecycle evidence, unknown-past/skipped and checklist/link state use their
existing components/model without alteration. No evidence or permissions are
inferred from the mockups. No additional provider read is introduced.

## Intentional F1 deviations / deferred scope

- Current shell remains; no sidebar/Shell V2 dependency.
- Existing lifecycle symbols/accessibility descriptions remain, rather than
  substituting historical timestamps or artboard evidence.
- Cleaner summary is a name card; detailed acknowledgment remains in the
  existing assignment group, not fabricated from fixture appearance.
- More actions remains closed by default; exactly one primary action.
- Attention wording and existing distinct CTAs stay authoritative. No duplicate
  checklist review CTA or new completion/consequence confirmation is introduced.
  Existing attention-category visual treatment is retained rather than adding
  new severity derivation to match an illustrative issue banner.
- Disclosure summaries are NOT added (F2). Mobile stays CURRENT (F3).
  Confirmation experience stays existing (F4).
- No shared primitive API extension. Uses Phase B Panel, StateLabel and
  SegmentedControl, and the existing action/disclosure controls.
- Sandbox extracted CSS now follows the already-allowlisted `catalogShared`
  asset naming convention; Hosting's fail-closed allowlist is NOT broadened.
- Four presentation strings are localized in the shared i18n table. Production
  excludes the F1 component/CSS/import and harness, not the small translation
  entries in that shared table. Production build is not claimed byte-identical.

## Local operator preview

```sh
npx vite --config e2e/job-detail-v2/vite.config.js --host 127.0.0.1 --port 4201 --strictPort --mode e2e
```

Open `http://127.0.0.1:4201/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned-draft&lang=en&theme=light`.
Use CURRENT/V2 and the local scenario selector. English, Portuguese and Spanish
are supported via `lang=en|pt|es`; light/dark via `theme=light|dark`.
Scenarios: unassigned, offered, assigned, assigned-draft, in-progress, ready,
completed, open-issue, stale, archived and unknown. Uses real components with
existing fictional fixtures. The Vite boundary replaces Firebase imports with
fail-closed stubs; synthetic handlers only record local calls in memory.
No Firebase configuration/credentials, photos, bearer links or real records.
The harness is DEV+loopback only and never imported by the application.

## Validation

- Focused jobs/checklists/Phase A+B: 34 files / 497 tests, including 13 F1 tests.
- Full unit: 116 files / 1,287 tests.
- F1 Playwright: 38 tests (states/locales, focus, real schedule handler, pending
  edits, mobile fallback, 360px rail and 44px targets at 1100/1280/1440/1920).
- CURRENT: 30 existing byte-identical visual pairs across five widths/themes;
  plus four wrapper-versus-existing component pixel comparisons at 390/1440,
  light/dark with identical screenshot coordinates/parents.
- Existing lifecycle/Job Detail/compact Playwright: 25 tests.
- Production/Sandbox compile/exclusion plus environment/Hosting guards: 20.
  Build configurations are synthetic, in disposable mirrors; no cloud access.
- Production has no F1 component/CSS chunk or local harness. Sandbox includes
  F1 and passes existing Hosting manifest preparation, without deployment.
- Keyboard Enter/Tab and original reveal/focus pass; visible F1 buttons and
  summaries >=44px; no horizontal overflow. Reduced-motion tested.
- Screenshots: `artifacts/visual-smoke/job-detail-v2-f1/` (ignored): assigned, open issue,
  ready, completed and archived in light EN/dark PT; mobile CURRENT dark PT.
- Existing non-blocking punycode/build-size warnings remain. No dependency added.
- `git diff --check` passes.

Operator acceptance is still pending. F2 recommendation AFTER acceptance:
add concise disclosure summaries using only already-loaded evidence, without
new reads or changing section contents. Do not begin F2 automatically.
