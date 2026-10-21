# CleanFlow Component Handoff V3

Prototype: `src/prototypes/manager-workspace-v3/` (entry
`prototypes/manager-workspace-v3/index.html`). Built on the Design System V2
release candidate branch, so V2 tokens (`--v2-*` in `src/index.css`) and V2
primitives (`src/components/v2/primitives.jsx`) are available and used.

## 1. Architecture

```
model/                presentation-independent truth (no React)
  time.js             Los Angeles day keys, ranges, formatting
  demoData.js         synthetic properties, cleaners, templates, 44 jobs, notifications
  selectors.js        status, attention, next action, counts, filters, intent parsing
  store.js            reducer + provider + localStorage persistence (demo only)
  messages.js         manager copy pt/en/es
  cleanerCopy.js      cleaner copy pt/en/es + offer/reminder message templates
ui/                   presentational pieces
flows/                overlays and sheets (one per operational action)
cleaner/              cleaner-side phone screens
layouts/              Worklist (A + Hybrid Operação) and Modes (Hybrid Agora, A, B, C)
App.jsx               shell, header, overlay switch, tab bar
```

Rule kept throughout: layouts never derive status, attention or next action.
They call the selectors. The four layouts are different compositions of the same
components over the same state.

## 2. Components

| Component | File | Reuses V2 | Purpose | Production mapping |
|---|---|---|---|---|
| `Icon` | ui/Icon.jsx | Same drawing rules as V2 `Icon` | Stroke icon set incl. bell, phone, camera, image, calendar, user-x/user-check, link, lock | Merge the extra glyphs into V2 `Icon` |
| `JobStatus` | ui/kit.jsx | `StatusPill` | Plain-language status from `statusOf` | New `ServiceStatus` wrapper |
| `AttentionTag` | ui/kit.jsx | `StateLabel` | One attention item: icon + text + tone | `AttentionLabel` |
| `MiniRail` / `Rail` | ui/kit.jsx | V2 lifecycle tokens | Five-stage lifecycle, skipped dashed | Use existing `LifecycleRail` fed by `serviceLifecyclePresentation()` |
| `CleanerCell` | ui/kit.jsx | — | Avatars + names, or "Sem cleaner", or "Nora?" interest | `AssigneeCell` |
| `JobRow` | ui/kit.jsx | V2 row tokens | Dense service row; container-query density | Replace Services list card |
| `DateNav` | ui/kit.jsx | `SegmentedControl` styles | Hoje/Amanhã/Semana, arrows, picker | `DateRangeControl` |
| `Overlay` | ui/kit.jsx | V2 scrim/elevation | Drawer / bottom sheet / centered sheet with focus trap | Generalise V2 `ConfirmationSheet` |
| `SimTag` | ui/kit.jsx | V2 sandbox/info tones | Simulado / Proposta / Futuro | Not in Production (demo-only) |
| `PhotoTile` | ui/kit.jsx | — | Photo with progress, failed, retry | Multi-photo gallery item |
| `Toast` | ui/kit.jsx | — | Polite live region | V2 `Toast` (catalog) |
| `JobDetail`, `NextStep`, `ActionButton`, `useActions` | flows/JobPanel.jsx | `Button` classes | Detail blocks; one primary action; action router | Job Detail V2 pilot |
| `AssignSheet` | flows/OperationalSheets.jsx | `ConsequenceDisclosure` | Replies + cleaner picker + consequences | Existing direct assignment |
| `OfferComposer` | flows/OperationalSheets.jsx | `Banner`, `ConsequenceDisclosure` | Known payout pre-fill, override with reason, message style, preview per language, link | Existing offers + public link |
| `ReminderSheet` | flows/OperationalSheets.jsx | `Banner` | Reminder in cleaner's language, no secrets | Existing reminder preview |
| `ReviewSheet` | flows/OperationalSheets.jsx | `Banner` | Checklist review by room, photos, gaps | `ChecklistRunDetail` |
| `CompleteSheet`, `IssueSheet` | flows/OperationalSheets.jsx | `ConsequenceDisclosure` | Complete, resolve issue | Existing handlers |
| `PropertySheet` | flows/SetupSheets.jsx | — | Instructions, masked access, template editor with versions | New (Proposal) |
| `NewServiceSheet` | flows/SetupSheets.jsx | — | Type, date/time, fixed/hourly, checklist, next step | Existing JobForm + Proposal fields |
| `InboxContent`, `InboxSheet` | flows/Inbox.jsx | `Skeleton`, `ErrorState`, `EmptyState` | Notification history + device diagnostics | New (Proposal) |
| `CleanerOffer`, `CleanerChecklist`, `CleanerPreview` | cleaner/CleanerViews.jsx | Button classes | Phone screens | Public offer page, public checklist page |
| `FilterBar`, `JobList`, `Worklist` | layouts/Worklist.jsx | — | List + detail + rail composition | Services / Hybrid Operação |
| `CommandBar`, `ResolvedJob`, `AttentionQueue`, `DayCard`, `WeekStrip`, `QuestionStrip` | layouts/Modes.jsx | — | Hybrid Agora and B/C compositions | Hybrid Agora |
| `HybridNow`, `HybridWork`, `ModeA`, `ModeB`, `ModeC` | layouts/Modes.jsx | — | The four presentation modes | Only Hybrid ships |

## 3. Layout composition

```
App
├─ Header ─ ModeSwitch · DateNav · Agora|Operação · bell · cleaner view · menu
├─ main
│  ├─ hybrid/now   HybridNow ─ Headline · CommandBar · (Comece por · AttentionQueue) | (QuestionStrip · DayCard×2 | WeekStrip · Future card)
│  ├─ hybrid/work  Worklist ─ (FilterBar · JobList) | JobDetail | NextStep
│  ├─ a            Worklist
│  ├─ b            ModeB ─ QuestionStrip · groups | timeline table · cleaners working
│  └─ c            ModeC ─ CommandBar · ResolvedJob · overview disclosure
├─ MobileDetail (phones) ─ JobDetail + sticky NextStep
├─ OverlaySwitch ─ assign · offer · remind · review · complete · issue · property · newService · inbox · detail
├─ CleanerPreview ─ phone frame ─ CleanerOffer | CleanerChecklist
└─ TabBar (phones) · Toast
```

## 4. Tokens used

Only V2 semantic tokens: canvas, surface, surface-subtle/sunken/selected/elevated/internal, text primary/secondary/muted, border, border-strong, border-input, border-selected, divider, brand, brand-text, focus, and the info/attention/warning/risk/success/sandbox triplets; radii panel/card/control/small/tag/sheet; type sizes; elevation overlay; scrim. No literal colours except the generated photo placeholders.

### Token or component changes proposed by V3
| Change | Why |
|---|---|
| Add glyphs to V2 `Icon` (bell, phone, camera, image, calendar, userX, userCheck, link, unlock, pin, history, spark, up/down, trash, edit, layout) | Needed by inbox, cleaner flows, template editor |
| `Button` should accept any icon node | Prototype uses V2 button classes with its own icon set |
| `--v2-size-control-xl: 56px` | Cleaner "Tenho interesse" and "Enviar checklist" primary actions on phones |
| Generalise `ConfirmationSheet` into `Overlay` (drawer, bottom sheet, centered) | Every V3 flow needs drawer/sheet behaviour with the same focus rules |
| `AttentionLabel` component (StateLabel bound to attention kinds) | One vocabulary for queue, rows, banners and detail |

## 5. Responsive breakpoints

| Range | Behaviour |
|---|---|
| < 720 | Tabs Agora/Serviços/Avisos/Cleaner; full-screen detail; bottom sheets; date chips + icon picker; row layout two lines |
| 720–1099 | Header with layout select; list | detail; Agora single column; offer composer single column |
| 1100–1319 | Segmented layout switch; list | detail (next step inside) |
| ≥ 1320 | list | detail | next-action rail |
| Container < 760 / < 420 | Rows switch to two lines and drop the status pill; attention label moves under the title |
| Container < 560 | Lifecycle rail shows only the current stage name (all names stay available to screen readers) |

## 6. Accessibility requirements (kept by the prototype, required in Production)

- Every action is a `button` or labelled control; rows are buttons with `aria-pressed` for selection.
- Overlays: `role="dialog"`, `aria-modal`, labelled by their heading, focus trap, Escape closes, focus returns to the trigger. Phone preview closes on Escape.
- 44 px minimum targets (cleaner primary actions 56 px). 3 px focus ring from `--v2-color-focus`.
- State is icon + words; no colour-only indicator anywhere (the colour dots used in an early pass were removed).
- Charts (day bar) have a text legend and an `aria-label` with the numbers.
- Live regions: toast `role="status"`, inbox loading `aria-busy`, errors `role="alert"`.
- Language: `lang` on `<html>` follows the selected language; the cleaner phone sets `lang` to the cleaner's language.
- Reduced motion removes transitions.

## 7. Source paths

| Item | Path |
|---|---|
| Entry HTML | `prototypes/manager-workspace-v3/index.html` |
| Vite config (isolated, no env, no Firebase) | `prototypes/manager-workspace-v3/vite.config.js` |
| Source | `src/prototypes/manager-workspace-v3/**` |
| Tests | `src/prototypes/manager-workspace-v3/model/model.test.js`, `src/prototypes/manager-workspace-v3/App.test.jsx` |
| Scripts | `npm run prototype:v3`, `npm run prototype:v3:build`, `npm run prototype:v3:test` |
| Build output (git-ignored) | `dist-prototypes/manager-workspace-v3/` |
