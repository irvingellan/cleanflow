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
