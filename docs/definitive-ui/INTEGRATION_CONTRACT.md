# Definitive UI V1 — integration contract

Branch `feature/definitive-ui-v1`, based on the published Production source
`codex/release-a-claude-ux-85` @ `12f432dd46a6c93e45bfb78ac1993568143c3840`
(Hosting release `2aa48a01a2244d34`).

## What changed (frontend only)

- No Functions, Firestore/Storage Rules, indexes, IAM, messaging, service worker,
  PWA manifest, environment files or provider configuration changed.
- No new Firebase call, callable, query, collection or field is read or written.
- One npm dependency: `@fontsource-variable/inter` (OFL font files, bundled by Vite).
- Every handler wired by the new UI is an existing handler from `App.jsx` or the
  feature controllers. The shell owns no business state.

## Data the new UI reads (all already loaded today)

| Surface | Source | Notes |
|---|---|---|
| Home decisions, pulse, 48 h, week | `useDashboardController` (`dashboardData`) | Unchanged queries. Interested rows now open the Job with `initialFocus="interest"` (existing prop). |
| Home "Prontos para você revisar" | `useNotificationInbox` items already listed for the badge | Only unread, `openable`, `CHECKLIST_READY_FOR_REVIEW`. Opening calls the existing `inbox.open(id)` and then `openInboxTarget(destination)`; on any failure it falls back to the Inbox screen. |
| Services pane beside the Job (≥1280) | `useJobsWorklist` state already in memory | Shown only when the Job was opened from Services and jobs are loaded; selecting calls `openJob`. No reload is triggered by the pane. |
| Inbox actions | `type` from `listNotificationInbox` | Presentation label per type; the destination is still the server's `openNotificationInboxItem` result. |
| Account panel | `NotificationControl`, `FeedbackPanel`, `WhatsNewPanel`, `DeveloperEnvironmentControls`, language, theme, sign out | Same components, moved from the header. The panel is always mounted (hidden) so push-health checks still run on load. |

## Behaviour that intentionally changed

1. Header controls moved into the account menu ("Conta"). Inbox moved to the sidebar
   (desktop/tablet) and to the "Avisos" tab (phone).
2. Phone navigation: Painel, Serviços, Avisos, Mais (sheet with Propriedades,
   Cleaners, Clientes, Pagamentos, Central Dev).
3. Interested-cleaner action on Home reads "Revisar interessadas" (was "Revisar e
   atribuir") and focuses the decision panel.
4. Inbox primary action names the task: "Revisar interessadas", "Revisar checklist",
   "Ver serviço", "Ver painel", "Ver oferta"; unknown types keep "Abrir".
5. Public checklist, public offer, client report and sign-in now follow the device
   theme through the existing `ThemeProvider` (they were always light).
6. Emoji icons replaced by the stroke icon family. Back buttons read "Voltar" with an
   icon (accessible name no longer contains "←").

## Not done here (backend gates remain Codex's)

- `cleanerAgenda.checklist`, `getMyJobAccess`, `photoRequirements` contracts from
  `docs/PILOT_FEEDBACK_UX_V1.md` — the Hub UI already handles their absence.
- FB05 (stop after 16 photos) — not touched.
- Release B cleaner push and #86 first-accept-wins stay OFF; nothing here enables them.
- Global "unread total" beyond the loaded Inbox page is still unknown by design.

## Tests that pin this contract

- `src/components/shell/AppShell.test.jsx` — single navigation landmark, mounted
  account panel, phone tabs and "Mais" sheet.
- `src/features/dashboard/DashboardHome.test.jsx` — interest focus, notice filter,
  no invented section.
- Updated: `NotificationInbox.test.jsx`, `JobDetail.test.jsx`,
  `JobDetailDisclosure.test.jsx`, `JobsPage.test.jsx`, `Dashboard.test.jsx` (label and
  icon changes only).
- `e2e/definitive-ui/flows.spec.js` — real build on isolated emulators.
