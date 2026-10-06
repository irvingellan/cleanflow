# CleanFlow — Screen Inventory against Design System V2

Date: 2026-10-06. "View" is the value used by the view switch in `src/App.jsx`.
Classification:

- **Already aligned** — follows V2; token rename only.
- **Minor migration** — same structure; swap to V2 primitives (icons, pills,
  buttons, rows, states).
- **Major migration** — new layout or information architecture, drawn in this
  package.
- **Internal / dev only** — not an operator screen; gets the internal surface
  and stays out of the operator's path.

Artboard numbers refer to `artboards/`.

## Manager — operator screens

| Screen | View | Class | Artboards | Notes |
|---|---|---|---|---|
| Application shell and navigation | (wrapper in `App.jsx`) | Major | 05, 06, 07, 26, 27 | Sidebar, account menu, mobile tabs. Wraps existing views; no view changes required. |
| Sign-in | (auth) | Minor | — | Form template, display type for the wordmark, V2 fields and button. |
| Dashboard | `dashboard` | Major | 08, 09, 10, 11, 22, 28 | Same data and priority logic; new layout and row patterns. |
| Services list | `job-list` | Major | 12, 13, 23 | Dense rows, toolbar, day grouping. Filters, sorting, pagination and scroll restoration unchanged. |
| Job detail | `job-detail` | Major | 14, 15, 16, 17, 24, 25, 30 | Two-column with decision rail; disclosure summaries. All handlers and guards unchanged. |
| New service | `create-cleaning` | Minor | — | Form template, V2 fields, OptionCard for property choice. |
| Offer to cleaners | `offer-cleaners` | Minor | — | Checkbox rows, ConsequenceDisclosure ("will send offers / will not assign"). |
| Checklist run (manager review) | `checklist-run` | Minor | — | V2 rows, ProgressBar, Banner; structure stays. |
| Properties list | `property-list` | Major | 18, 19, 29 | Dense rows with address, client, optional next service. |
| Property detail | `property-detail` | Minor | — | Standard page; PageHeader, Panel, rows for linked services. Not redrawn on purpose. |
| Property create / edit / link client | `property-create`, `property-edit`, `property-link-client` | Minor | — | Form template. |
| Cleaners list | `cleaner-list` | Major (same pattern as Properties) | 03 (PersonRow) | Use PersonRow; drop the empty bar; "Active" becomes a success pill. |
| Cleaner detail / create / edit / saved | `cleaner-detail`, `cleaner-create`, `cleaner-edit`, `cleaner-success` | Minor | — | Form and standard templates. |
| Clients list | `client-list` | Major (same pattern as Properties) | 03 (ClientRow) | Use ClientRow; stop centring short pages vertically. |
| Client detail / create / edit | `client-detail`, `client-create`, `client-edit` | Minor | — | Standard and form templates. |
| Payments | `payout-list` | Minor | — | Rows instead of cards; proof state as StatusPill; amounts in tabular figures. Financial screens keep their current authorization boundary. |
| Payment review | `payout-review` | Minor | — | ConsequenceDisclosure before marking paid. |
| Weekly close preview | `weekly-close-preview` | Minor | — | Read-only; V2 table rows and pills. |
| Reservation Intake | `sandbox-reservation-intake` | Already aligned | (V1.1 package) | Approved V1.1 is the reference. Token rename only; shell-independent. |
| What's new / Feedback panels | (header panels) | Minor | 06 | Opened from the account menu. |
| Notification control | (header control) | Minor | 06 | Becomes a status line in the account menu; enable/test flow unchanged. |

## Field worker and public screens — out of scope for this package

| Screen | View / route | Class | Notes |
|---|---|---|---|
| Cleaner job view | `cleaner-job` | Minor | Mobile-first already. Apply V2 tokens, buttons and banners later; not redrawn here. |
| Report issue / issue sent | `issue-form`, `issue-success` | Minor | Form template. |
| Public offer page | (public route) | Minor | Token alignment only. Wording and response behaviour unchanged. |
| Public checklist page | (public route) | Minor | Token alignment only. Draft recovery behaviour unchanged. |
| Public client report | (public route) | Minor | Token alignment only. |

These screens are used by people who are not managers. They should be reviewed
with a cleaner before any layout change; this package only asks that they pick
up the V2 tokens so the product does not split into two looks.

## Internal / dev only

| Screen | View | Class | Notes |
|---|---|---|---|
| Central Dev | `dev-center` | Internal | Reached from "Internal tools"; internal surface; no operator styling effort. |
| Load-time diagnostics | `load-time-diagnostics` | Internal | Keeps its wide container. |
| Notification diagnostics | (inside Central Dev) | Internal | |
| Service lifecycle preview | `sandbox-lifecycle-preview` | Internal | Sandbox only; useful as the visual-review harness for V2 Job detail and lists. |
| Checklist preview | (preview feature) | Internal | |
| Data provenance review | (inside detail screens) | Internal control in an operator screen | Stays inside "History and administration". |

## Counts (table rows above; some rows group several forms)

| Class | Rows |
|---|---|
| Already aligned | 1 |
| Minor migration | 18 |
| Major migration | 7 (shell, Dashboard, Services, Job detail, Properties, Cleaners list, Clients list) |
| Internal / dev only | 6 |
