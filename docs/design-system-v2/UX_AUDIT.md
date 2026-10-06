# CleanFlow — Current Product UX and Visual Audit

Date: 2026-10-06. Source: the repository at branch
`feature/reservation-intake-bridge-v0-2026-10-04` (read only), the eight
production screenshots supplied with the brief, the captures under
`artifacts/visual-smoke/`, and the approved Reservation Intake V1.1 package.

Verdicts: **KEEP** (carry forward as is), **IMPROVE** (same idea, better
execution), **REPLACE** (new pattern), **CONSOLIDATE** (many variants become
one).

## Summary

The product has a sound base that most early products lack: a full set of
semantic colour variables with a real dark theme (only one hard-coded colour
outside the token block in 4,650 lines of `src/index.css`), an i18n layer in
three languages, visible keyboard focus, native disclosures, and a lifecycle
model that separates "skipped" from "not known".

What it lacks is a system above the colours. Sizes, radii, spacing, cards,
badges and breakpoints were each decided per screen:

| Measure in `src/index.css` and feature CSS | Count today | V2 |
|---|---|---|
| Distinct border-radius values | 19 (10 px ×29, 12 px ×21, pill ×19, 14, 8, 16, 18, 9, 5, 24, 7, 6, 11, 20 …) | 6 + pill |
| Distinct font-size declarations | about 40, mixing rem and px, including 0.78, 0.8, 0.85, 0.88, 0.9 rem | 11 roles |
| Font weights | 500, 600, 650, 700, 750, 800 | 400–800 in steps of 100 |
| Distinct gap values | 19, including 3, 5, 7 and 9 px | 10-step scale |
| Distinct media-query widths | 11 (340, 480, 520, 600, 640, 700, 800, 900, 1150, 1200, 1600) | 3 boundaries |
| Card class families | 14 | Panel, Card, Row |
| Badge / status class families | 7 | StateLabel, StatusPill, InlineFlag, Tag |
| Page container widths | 680 (most pages), 1120 (Dashboard), 1600 (diagnostics) | 4 templates |

## Inventory

### Application shell — REPLACE
- `.app-shell` centres a single column (`place-items: center`); `.foundation`
  is 680 px wide for every list and detail page. On a 2000 px screen the
  Properties, Services, Cleaners, Payments and Clients pages use about a fifth
  of the width (screenshots 3–8).
- The CleanFlow wordmark is the page `h1` at `clamp(2.5rem, 8vw, 4.5rem)` with a
  36 px margin below, on every page. With navigation and controls the header
  takes roughly 200–240 px before content starts.
- The Clients page centres vertically when the list is short, so the header
  moves between pages (screenshot 7 starts 125 px lower than the others).

### Top navigation — REPLACE
- `.main-navigation` is `flex-wrap: wrap`. Seven destinations already wrap to
  two or three rows beside the header controls on desktop (screenshots 1, 3).
- Reservation Intake and the lifecycle preview are reached through extra
  header buttons, not navigation.
- "Central Dev" sits in the same row as operator destinations
  (`navigation-button--dev`).

### Header controls — CONSOLIDATE
In the operator header today: account e-mail, language select, theme toggle,
a notification error pill, "Enable and test notifications", Feedback,
What's new, "PRODUCTION · Build 5c2e52492331", "Open Sandbox", Sign out and a
version badge. Eleven items, most of them rarely used, above every screen.
V2 moves all of them into one account menu and one environment indicator.

### Mobile navigation — REPLACE
- At phone widths `.main-navigation` becomes a single row with
  `overflow-x: auto` and a hidden scrollbar, at 12 px. Destinations past the
  fourth are off-screen with no hint that they exist.

### Page headers — IMPROVE
- Pattern is consistent (`.eyebrow` + title + action), which is worth keeping.
- The eyebrow repeats the title ("PROPRIEDADES / Propriedades", "CLEANERS /
  Cleaners", "CLIENTES / Clientes", "SERVIÇOS / Serviços de limpeza").
- Action placement varies: primary in the middle and "Show excluded" at the far
  right (Properties, Cleaners, Clients); refresh only (Dashboard); refresh plus
  a second button below (Payments).

### Cards — CONSOLIDATE
Fourteen families with their own padding, radius and hover:
`property-card`, `client-card`, `client-property-card`,
`cleaner-directory-card`, `job-card`, `payout-directory-card`,
`payout-history-item`, `issue-card`, `release-note-card`, `summary-card`,
`attention-item`, `recent-item`, `dashboard-next-item`, `operation-item`.
Several are a list row drawn as a large card: Properties rows are 60–70 px
cards with a 16 px gap; Cleaners rows are 72 px cards with an empty grey bar
under the phone number.

### Lists — REPLACE (as dense rows)
- Services is the best list today: date, property, client, cleaner, compact
  lifecycle. Each item is still a 90 px card with a REAL badge on its own line,
  so about seven fit on a desktop screen.
- Properties shows the name, a "● Propriedade" label that is the same on every
  row, and a REAL badge. No address, client or status in the list.
- Clients shows the name, an "Ativa" pill and a REAL/TESTE badge.

### Filters and search — CONSOLIDATE
- Three search implementations: Services (`.job-filters__search`, aria-label
  only), Properties (reuses `.cleaner-name-search` with a visible label),
  Cleaners (label, no placeholder).
- Services quick filters are the right idea (KEEP the behaviour): Today, Needs
  assignment, In progress, Completed, plus an advanced panel with four selects
  and a clear control.
- Chips carry emoji typed into the JSX (`📅`, `⏰`, `🧹`, `✅`).

### Forms — IMPROVE
- One shared `.cleaning-form` style is used for services, properties, clients,
  cleaners and sign-in. Labels sit above fields; errors use `.form-error` with
  `role="alert"`. KEEP that structure.
- `--color-input-border` is `#cfdad4` on white: 1.4:1. The field boundary is
  hard to see in light mode.

### Buttons — IMPROVE
- `.button`, `--primary`, `--small`, `--text`, `--danger` exist. KEEP the set.
- Hierarchy is not applied consistently: Job detail sections show several
  bordered buttons of equal weight side by side; `.header-sign-out`, `.back-button`,
  `.job-filters__clear` and `.job-filters__advanced-toggle` are separate
  one-off button styles.
- Disabled primary buttons only fade ("Confirmar atribuição" in the direct
  assignment picker) and do not say what is missing.

### Badges and status — CONSOLIDATE
- `.badge`, `.status-badge`, `.status-dot`, `.data-provenance-badge`
  (+ `--demo`, `--unknown`), `.record-archive-badge`, `.weekly-close-status`
  (+ `--paid`, `--unknown`), `.job-filter-chip`.
- "Ativa" on Cleaners and Clients is a `.status-badge`, which is styled with
  the warning text and warning background tokens: a healthy state drawn as a
  warning.
- The REAL provenance badge appears on every row of every list. It is the
  normal case and adds no information; TESTE and unknown are the exceptions
  worth marking.

### Icons — REPLACE
`OperationalIcon` maps names to emoji (`📅 ⏰ 🧹 ✅ ⚠️ 👤 📩 🚪 📦 🛠️`). The
name `clock` renders a broom and `assignment` renders an alarm clock. Emoji
render differently per platform, ignore the theme and cannot take a state
colour.

### Accordions / disclosures — KEEP, IMPROVE
Job Detail V1 (#74) uses native `details` with seven groups, 44 px targets,
mounted content and focus routing. This is correct and stays. Missing: a
collapsed group says nothing about its content, so the manager must open
Offers to learn there are none.

### Alerts — CONSOLIDATE
`.service-attention` (amber card with a button), `.state-card--error`,
`.form-error`, `.header-auth-error`, `.offers-section__success`,
notification pills in the header. Different shapes for the same job.

### Confirmation patterns — IMPROVE
- Inline confirm rows (archive, complete without checklist, direct assignment)
  are explicit and stay.
- `window.confirm` is used for the reminder-replaces-checklist-link warning
  (`JobDetail.jsx`). It cannot be themed, translated consistently or explain
  consequences.
- No screen outside Reservation Intake states what an action will not do.

### Empty, loading and error states — REPLACE
- `StateCard` renders one sentence in a box for loading, empty and error.
- `PropertyDirectory` returns the loading sentence **instead of** the page
  (before the heading), so the page title and New property button appear only
  after data arrives. `CleanerDirectory` and `ClientDirectory` do the same.
- Dashboard panels use a different one-line `.dashboard-empty`.
- There is no distinction between first load and refresh, and no stale state.

### Dashboard — IMPROVE
- KEEP: the five counts, the priority logic for attention items, the 48-hour
  grouping, the weekly load.
- The Open issues tile is amber at zero and is the only tile that is not a
  button.
- Attention items are four tall tinted cards; with History beside them the two
  most important panels end around 830 px, and Next 48 hours starts below the
  fold on a laptop.
- Recently completed (history) has the same visual weight as Needs attention.

### Job detail — IMPROVE
- KEEP: lifecycle rail with evidence, checklist progress card, single suggested
  next step, seven closed groups, all handlers and guards.
- The page is one card about 550 px wide on any desktop width
  (`job-detail-v1-1440-assignment-open.png` at 1440 px).
- "Cleaner" is a bare label and value between two cards; the responsible
  person is easy to miss.
- On mobile the five stage names wrap to two lines under the rail
  (`lifecycle-mobile-stale-full.png`).

### Diagnostic and internal patterns — KEEP, separated
Central Dev, load-time diagnostics, provenance review and build information are
useful and stay. They move out of the operator's path (Internal tools area,
account menu, Technical details).

### Light and dark tokens — KEEP, extend
36 colour variables per theme, applied consistently. Missing roles: an elevated
surface, an internal surface, info, a separate "needs input" tone (added
locally for Intake), and disabled text. Several variables are near-duplicates
(`--color-muted`, `--color-text-support`, `--color-readonly-text`;
`--color-brand-text`, `--color-button-text`, `--color-brand-muted`;
`--color-error-text`, `--color-alert-text`, `--color-auth-error`).

### Localization — KEEP
EN, PT and ES catalogs behind `translate()`. Dates are formatted per locale.
Portuguese labels are visibly longer and are the cause of several wraps in the
header and the mobile lifecycle rail.

## What Reservation Intake V1.1 already fixed

Compact queue rows instead of cards; state labels with icon, text and colour;
before/after comparison; "this will / will not" statements; a two-step
confirmation; collapsed technical details; a persistent Sandbox indicator; a
mobile review flow with a sticky decision area. V2 turns each of these into a
general component.
