# Definitive UI V1 — what changed on screen, file by file

Base: Production `12f432d`. Frontend only.

## New

| File | Purpose |
|---|---|
| `DESIGN.md` | The design system: lineage, tokens, states, components, breakpoints, rules |
| `src/components/Icon.jsx` | One stroke icon family (replaces emoji and the Hub-only set) |
| `src/components/shell/AppShell.jsx`, `useMediaQuery.js` | Sidebar / rail / top bar + tabs + "Mais" sheet + account panel |
| `src/styles/system.css` | Primitives restated: titles, buttons, inputs, badges, states, panels |
| `src/styles/shell.css` | Shell, account panel, theme switch, sign-in |
| `src/styles/workspace.css` | Page header, pulse, blocks, decision rows, timeline, week, segmented, banners, skeleton, Inbox |
| `src/styles/services.css` | Filters, job rows, split workspace, Job detail head/rail/sections, next step, interest decision |
| `src/styles/checklist.css` | Public checklist |
| `src/styles/directories.css` | Properties / Cleaners / Clients as row lists |
| `src/components/shell/AppShell.test.jsx`, `src/features/dashboard/DashboardHome.test.jsx` | New tests |
| `e2e/definitive-ui/*` | Seeded emulator capture and flow specs |

## Changed

| File | Change |
|---|---|
| `src/index.css` | Token block replaced by `--cf-*` roles (light + designed dark, also for `.hb-root`); legacy `--color-*` kept as aliases; 82 legacy Dashboard rules removed (only Dashboard used them); 3 side-stripe borders removed |
| `src/main.jsx` | Imports Inter Variable and the new style layers after `index.css` |
| `src/App.jsx` | Manager header replaced by `AppShell`; account panel holds language, theme, notifications, feedback, what's new, environment, version, sign out; Services pane beside the Job at ≥1280; Home receives Inbox notices; sign-in redesigned; public pages wrapped in `ThemeProvider`; dead `MainNavigation`/`ManagerIdentity` removed |
| `Dashboard.jsx` | Page header with date; pulse; "Precisa de atenção" as decision rows; "Prontos para você revisar" from Inbox; 48 h timeline; compact completed list. Same data and ordering logic |
| `JobsPage.jsx` | Page header with count; search icon; chips with icons; row layout; `variant="pane"` + `selectedJobId` |
| `JobDetail.jsx` | Wrapped into head / rail / sections (no logic change) |
| `JobIntentLayer.jsx` | Label + full-width primary; "Mais ações" with icons; notice as info banner |
| `InterestDecisionPanel.jsx` | Avatar initials; eyebrow removed |
| `NotificationInbox.jsx` (+ messages) | Card layout, counts in filter, skeleton, banners, task-named actions |
| `CleanerHubApp.jsx`, `HubIcon.jsx`, `cleanerHub.css` | Shared icons and palette, forest bar, broom mark, icon tiles instead of side stripes; layout unchanged |
| `PublicChecklistPage.jsx` | Brand line instead of eyebrow |
| `OperationalIcon.jsx`, `UiPrimitives.jsx` | Stroke icons; back button icon |
| `translations.js` | `shell.*`, `home.*` keys in PT/EN/ES |
| `package.json` | `@fontsource-variable/inter` |
| Tests | 5 files updated for intentional label/icon changes only |

## Deliberately not changed

Functions, Rules, indexes, services, hooks, controllers, routes, PWA worker,
manifests, notification transport, Release B, #86, payouts logic, Dev Center logic,
forms' fields and validation.

## Deliberately discarded

- The A/B/C switcher and any "choose a layout" UI.
- The old C+A hybrid composition.
- A free-text command bar (C) — no backend semantics to support it.
- A Massinha/visual editor — the shell is data-driven so it can follow later.
- KPI hero tiles and "total" numbers the client cannot prove.
