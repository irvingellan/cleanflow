# Definitive UI V1 — visual QA and measured flows

All data is fictitious and lives only on isolated `demo-cleanflow` emulators
(ports from `firebase.cleaner-hub-e2e.json`). No real account, Production project or
operations-manager session was used.

## 1. Capture matrix (real build, not a mock)

`node e2e/definitive-ui/run.mjs --project=chromium` with
`DEFINITIVE_UI_SPECS=capture.spec.js` builds the app in emulator mode, seeds one
synthetic day (9 Jobs, 2 interested cleaners, a submitted checklist, 5 Inbox events,
a cleaner access code, a checklist link) and captures full pages.

| Who | Screens | Widths | Themes |
|---|---|---|---|
| Manager | Painel, Serviços, Serviço com interessadas, Caixa de entrada | 375 · 390 · 768 · 980 · 1280 · 1440 | light, dark |
| Cleaner | Hoje, Agendadas, Serviço, Checklist (link público) | same | same |

- **Before**: Production source `12f432d`, built from a clean detached checkout.
- **After**: `feature/definitive-ui-v1`.
- Same seed recipe, same widths, same themes. Times and some names differ between
  runs only because each run seeds a new synthetic operation.
- `COMPARE.html` in the evidence folder shows every pair side by side.
- Full-page captures keep fixed elements (phone tab bar) at their viewport position,
  so on long phone pages the tab bar appears mid-image. That is a capture artifact.

## 2. Review findings fixed during the rounds

| Round | Finding | Fix |
|---|---|---|
| 1 | Job and Inbox framed as a card inside the page on phones | Borderless on compact |
| 1 | "Next step" button not full width | Stretch in the rail |
| 1 | Rail labels truncated ("Caixa de ent…") | 88 px rail, short "Avisos" label |
| 1 | Search icon overlapping placeholder | Global input rule lowered to `:where()` specificity |
| 1 | Provenance badge falling to its own row | Explicit grid areas over the lifecycle fallback |
| 1 | 48 h timeline time column too wide | Explicit two-column timeline |
| 1 | Dark: brand name and "Atualizada" chip invisible on the forest bar | New `shell-title` role |
| 1 | Hub: cramped top bar at 390 | Inbox icon-only under 480 px; forest bar |
| Detector | Coloured side-stripe borders (4 places) | Removed at source; icon tiles instead |

`impeccable detect` on all changed files: no findings except "overused font: Inter"
(kept on purpose; see `DESIGN.md` §2).

## 3. Measured task flows (`e2e/definitive-ui/flows.spec.js`)

Every click goes through a counter. Results are in `metrics/flow-metrics.jsonl`.

| # | Scenario | Desktop 1440 (Chromium) | Phone (iPhone 13 profile) |
|---|---|---|---|
| 1 | Manager opens and sees what needs her | pass · 0 clicks | pass · 0 clicks |
| 2 | Finds today's Job via Serviços → Hoje; list stays beside it (≥1280) | pass · 3 clicks | pass · 3 clicks |
| 3 | Two interested cleaners; confirms one (Firestore checked: assigned only after the click) | pass · 2 clicks | pass · 2 clicks |
| 4 | Same decision from the Inbox, with task-named actions | pass · 2 clicks | pass · 2 clicks |
| 5 | Checklist ready → review, from Home | pass · 1 click | pass · 1 click |
| 6 | Language and theme in the account menu, persisted after reload | pass | pass |
| 7 | Keyboard reaches the first decision with a visible focus ring | pass | n/a (desktop) |
| 8 | Cleaner: every future Job, opens one; no prices, codes or other cleaners in the page | pass | pass, and pass on **WebKit** iPhone 13 |
| 9 | Offline refresh shows the error state, never an empty "all good" | pass | pass |

The phone-layout run uses Chromium with the iPhone 13 device profile. The manager
app on Playwright's WebKit cannot open its Firestore channel on these emulators
("Não foi possível carregar o painel"), the same transport limit documented for the
Cleaner Hub, which uses long polling. This is pre-existing and not caused by this UI.
The cleaner flow (8) passed on real WebKit.

### Before vs after (same five scenarios)

Before counts are from inspecting the Production build and its captures (the old
markup has different selectors, so the counted spec was not run on it).

| Scenario | Before | After | What changed |
|---|---|---|---|
| See priorities | 0 clicks; on a 390 px phone the first decision starts at about 1,150 px (third screen). | 0 clicks; first decision at about 420 px (first screen). | Header controls moved to the account menu. |
| Find today's Job | 3 clicks, list replaced by the Job | 3 clicks; at ≥1280 the filtered list stays beside the Job | Split workspace |
| Confirm an interested cleaner | 2 clicks | 2 clicks | Decision sits in the rail next to the next step |
| Same via Inbox | 2 clicks (Inbox button among 9 header controls) | 2 clicks (sidebar / "Avisos" tab); action names the task | Inbox cards |
| Checklist ready → review | Not on Home: Inbox → Abrir (2 clicks, 3 screens) | From Home: 1 click, 2 screens | "Prontos para você revisar" |

Pixel offsets were read from the 390 px captures and are approximate. No percentage
improvement is claimed.

## 4. Other suites

| Suite | Result |
|---|---|
| Vitest, full | see `TEST_RESULTS.md` |
| Emulator-mode build | pass |
| Production build | not run (needs real environment values; Codex gate) |
| Existing emulator E2E / security suites | not run here (no backend change); Codex gate |
| Physical devices | not run |
