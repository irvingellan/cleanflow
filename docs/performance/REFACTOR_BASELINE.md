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

## After Phase 2

Branch `refactor/p2-s07` (one bundle per entry), measured on 2026-11-16 on the same
MacBook with Node 22.12.0.

| Metric | Value | Gzip bytes |
| --- | ---: | ---: |
| dist/assets/CleanerHubApp-*.js (bytes) | 92464 | 28014 |
| dist/assets/CleaningChecklistPreview-*.js (bytes) | 11040 | 2566 |
| dist/assets/Icon-*.js (bytes) | 4771 | 1992 |
| dist/assets/LanguageSelector-*.js (bytes) | 469 | 319 |
| dist/assets/ManagerRoot-*.js (bytes) | 540111 | 139776 |
| dist/assets/PublicChecklistPage-*.js (bytes) | 57404 | 15911 |
| dist/assets/PublicClientPortalPage-*.js (bytes) | 5429 | 1763 |
| dist/assets/PublicClientReportPage-*.js (bytes) | 8200 | 2447 |
| dist/assets/PublicOfferPage-*.js (bytes) | 6546 | 2218 |
| dist/assets/ScrollToTopButton-*.js (bytes) | 709 | 445 |
| dist/assets/UiPrimitives-*.js (bytes) | 613 | 366 |
| dist/assets/automaticOffers-*.js (bytes) | 2048 | 951 |
| dist/assets/checklistCapabilityService-*.js (bytes) | 9812 | 3437 |
| dist/assets/checklistDefinition-*.js (bytes) | 3457 | 829 |
| dist/assets/checklistInventoryMessages-*.js (bytes) | 2462 | 796 |
| dist/assets/client-*.js (bytes) | 527539 | 155156 |
| dist/assets/clientPortalService-*.js (bytes) | 1870 | 945 |
| dist/assets/clientReportService-*.js (bytes) | 4742 | 1965 |
| dist/assets/functionWarmup-*.js (bytes) | 132851 | 40287 |
| dist/assets/jsx-runtime-*.js (bytes) | 8078 | 3064 |
| dist/assets/main-*.js (bytes) | 500749 | 133327 |
| dist/assets/main-*.css (bytes) | 203909 | 34434 |
| dist/assets/presentation-*.js (bytes) | 1606 | 735 |
| src/index.css (lines) | 14 | — |
| src/i18n/translations.js (lines) | 85 | — |
| functions/src/index.js (lines) | 361 | — |
| src/App.jsx (lines) | 74 | — |
| src/features/jobs/JobDetail.jsx (lines) | 2547 | — |
| Non-test files containing cleanflow-demo | 21 | — |
| Median of 5 Functions imports (ms) | 108.5 | — |

### JavaScript each page downloads

The two scripts in the HTML (`jsx-runtime-*.js` and `main-*.js`), the entry chunk of
the page and their static imports. Compare with the single `main-*.js` of the
baseline: 1,917,780 bytes, 526,758 in gzip.

| Page | Bytes | Gzip bytes | Gzip vs baseline |
| --- | ---: | ---: | ---: |
| `/offer/<token>` | 524880 | 142972 | −72.9% |
| `/checklist-preview` | 528101 | 141762 | −73.1% |
| `/client-report?t=` | 1058760 | 299848 | −43.1% |
| `/portal?t=` | 1066059 | 302556 | −42.6% |
| `/checklist?t=` | 1113743 | 315229 | −40.2% |
| `/agenda` | 1270106 | 363526 | −31.0% |
| `/` (manager) | 1741887 | 484390 | −8.0% |

What changed, and what did not:

- **Stylesheet: no change.** Still one file, byte-identical.
- **`src/App.jsx`: 1,812 lines to 74.** It only selects the entry.
- **Public pages download less.** The offer page drops by 73%. The checklist, the
  report and the portal drop by 40–43%, and the cleaner agenda by 31%.
- **The manager downloads about the same** (8% less): it needs almost everything.
- **Total JavaScript on disk grew slightly** (1,917,780 to 1,922,970 bytes across 22
  files): splitting adds a little glue code. No page downloads all of it.

Third-party code still in the public chunks, as candidates for later trimming:

- `client-*.js` (155 kB gzip): the Firebase Firestore, Storage and Functions SDK.
  The checklist, the report and the portal load it, although they talk to the
  server through `/api/*` and callables. It is the largest remaining cost.
- `main-*.js` (133 kB gzip): React DOM and **all** translations in three
  languages, shared by every page. A public page uses a small part of the texts.
- `functionWarmup-*.js` (40 kB gzip): Firebase Auth, Messaging and Installations.
  Only the manager and the cleaner agenda load it; the public pages do not.

