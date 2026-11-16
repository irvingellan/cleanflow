# Refactor baseline

Numbers the refactor promises to improve. Regenerate with:

```bash
npm run build:emulators && node scripts/refactorBaseline.mjs
```

The Functions import time is measured locally (median of 5 child-process imports of
`functions/src/index.js`), so compare it only against runs on the same machine.

## Baseline (before refactor)

Commit `1c71a87` (main, 2026-11-16), measured on a MacBook with Node 22.12.0.

| Metric | Value | Gzip bytes |
| --- | ---: | ---: |
| dist/assets/main-*.css (bytes) | 203909 | 34434 |
| dist/assets/main-*.js (bytes) | 1917780 | 526758 |
| src/index.css (lines) | 4831 | — |
| src/i18n/translations.js (lines) | 3246 | — |
| functions/src/index.js (lines) | 2024 | — |
| src/App.jsx (lines) | 1812 | — |
| src/features/jobs/JobDetail.jsx (lines) | 2547 | — |
| Non-test files containing cleanflow-demo | 21 | — |
| Median of 5 Functions imports (ms) | 234.8 | — |

## After Phase 1

Branch `refactor/p1-s16` (message parts, CSS partials and lazy Function handlers),
measured on 2026-11-16 on the same MacBook with Node 22.12.0.

| Metric | Value | Gzip bytes |
| --- | ---: | ---: |
| dist/assets/main-*.css (bytes) | 203909 | 34434 |
| dist/assets/main-*.js (bytes) | 1917001 | 526740 |
| src/index.css (lines) | 14 | — |
| src/i18n/translations.js (lines) | 85 | — |
| functions/src/index.js (lines) | 361 | — |
| src/App.jsx (lines) | 1812 | — |
| src/features/jobs/JobDetail.jsx (lines) | 2547 | — |
| Non-test files containing cleanflow-demo | 21 | — |
| Median of 5 Functions imports (ms) | 114.4 | — |

What changed, and what did not:

- **Stylesheet: no change.** The built file is byte-identical (203,909 bytes).
- **JavaScript bundle: no measurable change** (779 bytes smaller, 18 bytes in gzip).
  Phase 1 only moved texts between files; everything still ships in one bundle.
- **File sizes: the goal of Phase 1.** `src/index.css` went from 4,831 lines to
  14 `@import` lines, `translations.js` from 3,246 to 85, and
  `functions/src/index.js` from 2,024 to 361.
- **`App.jsx`, `JobDetail.jsx` and the organization literal: untouched.** They
  belong to later phases.
- **Functions import: 235 ms to 114 ms, but read it with care.** The number is the
  import of `index.js` alone, which no longer loads any handler. The base measured
  again in the same session gave 228–232 ms. A real first call also loads its own
  handler group: `index.js` plus one group took 177–227 ms here (public checklist
  227, the others about 180). So a cold call saves between nothing and about
  50 ms locally. Cold starts in Production are dominated by the instance start
  and the Admin SDK, and were not measured.

