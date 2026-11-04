# CleanFlow Design System (definitive UI V1)

Status: implemented in code on branch `feature/definitive-ui-v1` (2026-11-04),
not yet published. Visual direction chosen by Claude from the existing CleanFlow
material; no human approval of the final design is claimed. The operations manager
evaluates the integrated build.

Mode: **Operate** — product UI. Familiar controls, one obvious action per view,
precision over decoration. Light is the reference for the operations manager; dark
is designed with the same roles, not inverted.

## 1. What the system is made of (lineage)

| Source | What it gave | What was left behind |
|---|---|---|
| Design System V2 (2026-10-06) | Role tokens, state system (icon + words + colour), borders not shadows, sidebar / rail / bottom-tabs shell, one page header row | Eyebrow labels, uppercase micro-labels everywhere |
| A · Calm Workspace / Manager Workspace V3 "Operação" | Persistent Services list beside the open Job; decision rail on the right | Three-pane density at 1280 px; the A/B/C switcher |
| B · Attention Cockpit | Home opens on decisions, not metrics; counts as filters | Hero KPI tiles, red/orange for zero values |
| C · Intent First | "Próximo passo" card with one primary action and named secondary intents | Free-text command bar (no backend semantics) |
| Cleaner Hub V1 (approved) | Hub layout and hierarchy, kept intact | Separate "CF" logo, coloured side stripes |
| Visual Studio / Massinha | Confirmation that the manager wants to move/rename/hide areas | Not built: no editor; the shell is data-driven so it can follow |

The rejected C+A hybrid (dense, broken in Sandbox) was not copied.

## 2. Tokens (`src/index.css`, `:root` and `[data-theme="dark"]`)

All components use `--cf-*` roles. Legacy `--color-*` names are aliases of the
roles, so older screens inherit the palette; new code must not use them.

| Group | Roles |
|---|---|
| Surfaces | `canvas`, `surface`, `surface-subtle`, `surface-elevated`, `surface-selected`, `surface-sunken`, `surface-internal` |
| Text | `text`, `text-secondary`, `text-muted`, `text-disabled` |
| Lines | `border`, `border-strong`, `border-input`, `border-selected`, `divider`, `focus` |
| Brand | `brand` (forest #2d5a46 / mint #8cc3a2), `brand-hover`, `brand-text`, `on-brand`, `brand-soft` |
| Shell | `shell` (#1c3329 forest / #0f1312), `shell-raised`, `shell-text`, `shell-muted`, `shell-title`, `shell-active`, `shell-active-text`, `shell-line` |
| States | `info-*`, `attention-*`, `warning-*`, `risk-*`, `success-*`, `sandbox-*` (each `bg`, `border`, `text`) |
| Elevation | `shadow-raise` (resting blocks), `shadow-float` (menus, sheets, dialogs only) |
| Type | `--cf-font` Inter Variable (self-hosted, `@fontsource-variable/inter`), sizes `xs 12 · sm 13 · md 15 · lg 17 · xl 20 · 2xl 26` |
| Space / radius / size | 4-px scale; radius 8/10/14/18; controls 44 (36 small); sidebar 248; rail 88 |

The Cleaner Hub maps its `--v2-*` names onto the same roles
(`cleanerHub.css`, "Definitive system alignment"), so cleaner and manager share one
palette in both themes. `.hb-root[data-theme="dark"]` also receives the dark roles.

Inter is a deliberate Operate-mode workhorse: it was already the product face and
is now self-hosted, so iPhone, Android and desktop render the same letterforms.

## 3. State language

| Tone | Means | Example |
|---|---|---|
| attention (amber) | Look and decide | Cleaner interested, checklist submitted |
| warning (orange) | Blocked until the manager acts | Today without cleaner |
| info (blue) | Waiting on someone else | Offers awaiting response, reminders |
| risk (red) | A reported problem or destructive action | Open issue, cancellation |
| success (green) | Healthy or confirmed | Assignment confirmed |
| neutral | Nothing to decide | Later Jobs without cleaner |

Rules: state is always icon + words + colour; zero counts are neutral; no coloured
side stripes (detector-enforced); lifecycle uses brand, never a state colour.

## 4. Components

| Component | File | Notes |
|---|---|---|
| `Icon` | `src/components/Icon.jsx` | One 24-grid stroke family for manager, Hub and checklist. No emoji. `OperationalIcon` and `HubIcon` wrap it. |
| `AppShell` | `src/components/shell/AppShell.jsx` | Presentation only. ≥1100 sidebar; 720–1099 rail; <720 forest top bar + bottom tabs (Painel, Serviços, Avisos, Mais) + "Mais" sheet. One navigation landmark at a time. Account panel always mounted (hidden) so notification health keeps running. |
| Page header | `.cf-page-header` | Title + one context line + actions. No eyebrow. |
| Pulse | `.cf-pulse` + `SummaryCard` | Counts as filters over loaded data, never "total". Horizontal scroll on phones. |
| Block | `.cf-block` | One bordered region with a header; rows divide by hairlines. Never nested. |
| Decision row | `.cf-queue-row` + `.cf-state` | State chip, title, detail, when, one action. Whole row is the button. |
| Timeline | `.cf-timeline` | Time column + Job; Today / Tomorrow groups. |
| Job row | `.cf-job-row` | When, property/client/cleaner, compact lifecycle, provenance. |
| Split workspace | `.cf-split--with-list` | ≥1280 px when the Job was opened from Services: list pane (search, chips, selection) stays beside the Job. |
| Job detail | `.cf-job__head`, `.cf-job__rail`, `.cf-job__sections` | Context head; rail = Next step + interest decision (sticky, right, when the detail is ≥860 px wide via container query); sections are disclosure rows. |
| Next step | `JobIntentLayer` | One primary action; "Mais ações" lists schedule, assignment, reminder, checklist, completion. |
| Interest decision | `InterestDecisionPanel` | One card per interested cleaner with "Confirmar {nome}"; manual assignment as a quiet exception. |
| Inbox | `NotificationInbox` | Segmented Todos/Não lidos/Lidos with counts; notice cards with category tile, unread dot + word, time, type-specific primary action, secondary "Marcar como lido". Skeleton while loading, banner on error. Used by manager and Hub. |
| Segmented | `.cf-segmented` | Pressed-state buttons, 40 px. |
| Banner | `.cf-banner` | Icon + text, info/risk. |

## 5. Layout and breakpoints

| Range | Shell | Content |
|---|---|---|
| < 720 | Top bar + tabs | 16 px gutter; Job and Inbox are the page (no card frame) |
| 720–1099 | 88 px rail | 24 px gutter; Home single column |
| 1100–1279 | 248 px sidebar | Home two columns |
| ≥ 1280 | Sidebar | Services list beside the open Job |

Widths: standard 860, wide 1240, home 1320, workspace 1600.

## 6. Motion

150–220 ms, `cubic-bezier(0.22, 1, 0.36, 1)`; only state changes (hover, sheet
rise, theme thumb, disclosure chevron, skeleton). `prefers-reduced-motion` removes
animation.

## 7. Do not

- Eyebrow/kicker labels above headings in new UI.
- Coloured `border-left` accents on cards or rows.
- Emoji as icons.
- Hero metric tiles or invented totals.
- Cards inside cards; a second header band.
- Showing access codes, prices or other cleaners in cleaner-facing UI.
