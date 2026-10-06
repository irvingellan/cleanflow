# CleanFlow Design System V2 — Codex Handoff

One section per engineering goal. Each is meant to be given to Codex as a
single goal, together with the named artboards, `TOKENS.json`,
`COMPONENT_CATALOG.md` and `VISUAL_ACCEPTANCE_CHECKLIST.md`.

Rules that apply to every goal:

- Presentation only. Do not change handlers, guards, services, queries,
  Firestore shapes, security rules, Functions, or any business rule in
  `docs/BUSINESS_RULES.md` and `docs/WORKFLOWS.md`.
- The artboards use invented demo data. Do not copy names, addresses or numbers
  from them into fixtures that already exist; do not treat any artboard value
  as canonical.
- Items marked **OPTIONAL** are not in the product today. Do not build them
  unless the goal says so.
- Every string goes through `translate()` with EN, PT and ES keys.
- Both themes, both languages, and widths 360, 390, 768, 1280 and 1440 must be
  checked before the goal is called done.
- Artboards are references for layout, hierarchy and tokens. Where an artboard
  and existing product behaviour disagree, behaviour wins and the difference is
  reported.

Artboard files are in `artboards/`; "dark" and "PT" variants are listed in
`MANIFEST.txt`.

---

## Goal 1 — V2 tokens (Phase A) · recommended first goal

- **Source:** `TOKENS.json`; artboards `01`, `02`.
- **Do:** add V2 colour roles (light and dark), type, space, radius, size and
  breakpoint variables to `src/index.css`. Re-point existing `--color-*`
  variables to V2 roles using `legacy-map` wherever the hex is identical.
- **Components required:** none.
- **Must remain:** every screen pixel-identical. `ThemeProvider` behaviour
  (stored preference, system preference, `data-theme` on the root) unchanged.
- **Visual acceptance:** existing visual-smoke screenshots unchanged in light
  and dark.
- **Responsive:** not applicable.
- **Theme:** every new role defined for both themes; no role defined in only
  one.
- **Localization:** not applicable.
- **Must NOT change:** any component rule, any class name, any value listed in
  `changed-from-current` (those are a separate, optional, reviewed commit),
  Reservation Intake's scoped styles.
- **Suggested test:** a unit test that parses the stylesheet and asserts every
  role in `TOKENS.json › color.light` exists in both theme blocks with the
  documented value.

## Goal 2 — Shared primitives (Phase B)

- **Source:** artboards `03`, `04`, `20`, `21`; `COMPONENT_CATALOG.md`.
- **Components required:** `Icon`, `StateLabel`, `StatusPill`, `InlineFlag`,
  `Tag`, `Count`, `Avatar`, `Button` (primary, secondary, tertiary, danger,
  danger-solid, icon, small, large, busy, blocked), `TextField`, `Select`,
  `SearchField`, `SegmentedControl`, `FilterChip`, `FilterToken`, `Panel`,
  `Card`, `Banner`, `Row`, `Skeleton`, `SyncLine`, `EmptyState`,
  `ConsequenceDisclosure`, `ConfirmationSheet`, `LifecycleRailCompact` and
  `LifecycleRailFull` visual variants.
- **Must remain:** `serviceLifecyclePresentation()` is the only source of
  lifecycle stage states; primitives take its output as props.
  `DataProvenanceBadge` behaviour stays; the `Tag` is a new presentation of the
  same normalized value. Existing components keep working until their screen is
  migrated.
- **Visual acceptance:** a Sandbox-only catalog page matches artboards `03` and
  `04` section by section.
- **Responsive:** primitives have no page breakpoints; they size to their
  container. Touch targets 44 px.
- **Theme:** only role variables; no hex in component styles.
- **Localization:** primitives take already-translated strings; none contain
  copy of their own except accessible names passed as props.
- **Must NOT change:** any existing screen (one pilot use is allowed: replacing
  emoji with `Icon` in `OperationalIcon`, behind the same component name).

## Goal 3 — Application shell (Phase C)

- **Source:** artboards `05` (decision), `06`, `26` (desktop), `07`, `27`
  (mobile).
- **Components required:** `Sidebar`, `IconRail`, `AccountMenu`, `TabBar`,
  `MoreSheet`, `PageHeader`, `EnvironmentIndicator`.
- **Must remain:** every destination and control that exists today stays
  reachable: Dashboard, Properties, Services, Cleaners, Payments, Clients,
  Central Dev (developer accounts only, same authorization check), language
  selector, theme toggle, notification control and its error state, Feedback,
  What's new, Sandbox link/preview entries that exist today, sign out, version
  and build marker. View state, scroll restoration and deep navigation
  (`setView` flows) unchanged. Manager access boundary unchanged.
- **Visual acceptance:** sidebar 232 px with groups as drawn; active item on
  `surface-selected`; environment pill under the wordmark in Sandbox and absent
  in Production; account menu contents and order as on `06`; no operator-visible
  build string outside the account menu.
- **Responsive:** sidebar at 1100 px and up (collapsible to 64 px, preference
  remembered); icon rail 720–1099; tab bar below 720 with Dashboard, Services,
  Properties, More; detail views hide the tab bar. No horizontal scrolling at
  360 px.
- **Theme:** both; sidebar is `surface`, page is `canvas`.
- **Localization:** PT labels as on `10` and `19`; "Internal tools" /
  "Ferramentas internas"; nothing truncated in the sidebar.
- **Must NOT change:** the content of any view; routes or view names;
  Reservation Intake layout (it must look as approved inside the new shell);
  cleaner-facing and public pages (they do not get the manager shell).
- **OPTIONAL:** Intake as a navigation item. Today it is a Sandbox-only preview
  button; show it in navigation only in Sandbox, with the same gate.

## Goal 4 — Services list (Phase D)

- **Source:** artboards `12`, `23` (desktop), `13` (mobile EN and PT filters).
- **Components required:** `PageHeader`, `SearchField`, `FilterChip`, Filters
  popover / bottom sheet, `FilterToken`, `Row` (JobRow), `LifecycleRailCompact`,
  `InlineFlag`, `Tag`, `Skeleton`, `EmptyState`.
- **Must remain:** search over property and address; quick filters Today,
  Needs assignment, In progress, Completed with their toggle behaviour; advanced
  filters status, date, cleaner, property; client context filter and its
  message; Clear filters; result count; Load more pagination; current sort
  order; scroll restoration and anchor on return from a service; "Show
  excluded" for accounts allowed to manage excluded records; row opens Job
  detail; accessible description of the lifecycle per row; no prices in the
  list; no per-row reads.
- **Visual acceptance:** row height 56 px desktop, 64 px mobile; the day label
  appears on the first row of each day only (desktop) or as a group header
  (mobile); the stage name is always next to the rail; "Not set" for a missing
  time; "No cleaner" as a warning flag; Demo/Unknown/Archived as tags, nothing
  for Real; at 1440 px at least 12 services visible without scrolling.
- **Responsive:** below 720 the cleaner and client share the second line and
  the quick filters scroll in one row with Filters pinned first; advanced
  filters open as a bottom sheet with an apply button that states the result
  count.
- **Theme:** both. **Localization:** PT as on `13`; chips do not wrap.
- **Must NOT change:** filter semantics, query limits, the meaning of "needs
  assignment", the lifecycle evidence mapping. Do not add counts to quick
  filters (the list is paginated and the counts are not known).
- **Reported difference:** the ✓ · – ? symbols under today's compact bars are
  replaced by line style (solid, dashed, dotted) plus the stage name. Confirm
  with the operator review gate from #76 before removing them.

## Goal 5 — Dashboard (Phase E)

- **Source:** artboards `08`, `22`, `10` (desktop EN, PT, dark PT), `09`, `28`
  (mobile), `11` (states).
- **Components required:** `PageHeader` with `SyncLine`, `KpiTile`,
  `NeedsAttentionCard`, `Panel`, `Row`, `LifecycleRailCompact`, week summary,
  `EmptyState`, `Skeleton`.
- **Must remain:** the five counts and their navigation to filtered Services
  (Open issues keeps today's behaviour unless a destination is defined); the
  attention selection and ordering (`selectPriorityAttentionItems`, today and
  tomorrow without cleaner first); the item types and their actions; opening a
  service from any row; Next 48 hours grouping into today, tomorrow and the
  following day; weekly metrics and daily load; Recently completed; Refresh.
- **Visual acceptance:** at 1440 × 900 the KPI strip, the whole attention queue
  (up to six items) and the first five Next 48 hours rows are visible without
  scrolling; the Open issues tile uses the risk tone only above zero; attention
  cards are white with a coloured StateLabel, not tinted cards; history has
  less weight than attention.
- **Responsive:** below 1100 the two columns stack (attention, next 48 hours,
  week, completed); below 720 the KPIs are a 2 × 2 grid plus a full-width
  issues tile, and This week and Recently completed collapse to two summary
  rows that open the existing lists.
- **Theme:** both. **Localization:** PT as on `10`; "OFERTAS AGUARDANDO
  RESPOSTA" must fit on one line beside the date at 1280 px.
- **Must NOT change:** `dashboardService` queries, what counts as near-term,
  the rule that interest never assigns.
- **OPTIONAL:** none. The "Updated 1:42 PM" line needs only the time of the
  last successful load, which the controller already knows.

## Goal 6 — Job detail (Phase F)

- **Source:** artboards `14`, `24` (standard, desktop), `15` (mobile), `16`,
  `25` (attention, desktop), `17`, `30` (attention, mobile PT).
- **Components required:** `PageHeader` (back link, StateLabel, title, context
  line), `Banner`, `LifecycleRailFull`, summary `Panel`s (Responsible,
  Checklist), `ProgressBar`, `Disclosure` with summary slot, decision rail,
  `ActionList`, `ConsequenceDisclosure`, `ConfirmationSheet`,
  `StickyMobileAction`.
- **Must remain — everything in `docs/JOB_DETAIL_V1.md`:** the seven groups and
  their contents; all 64 handler bindings; the primary intent derivation; the
  five secondary intents and their reveal-then-focus behaviour; groups closed by
  default and content mounted when closed; opening a group calls no domain
  handler; attention kinds (stale link, review, open issues) and the rule that
  the review banner omits its button when the primary action already opens the
  checklist; completed and archived services keep the "View saved service"
  path with no operational intents; unknown data stays unknown; the DRAFT
  schedule protection; provenance review and archive controls inside History
  and administration; the reminder flow including the explicit sensitive-access
  opt-in.
- **Visual acceptance:** desktop is two columns (content, 360 px rail) from
  1100 px; the rail holds exactly one primary button; the responsible cleaner is
  a card with name and acknowledgment, not a label; each collapsed group shows
  a one-line summary; the Financial summary shows no amounts; attention banners
  sit above the lifecycle; mobile shows five bars and one sentence for the
  lifecycle, and the primary action in a sticky bar.
- **Responsive:** 720–1099 single column with the rail content directly under
  the header; below 720 the rail becomes the sticky action bar and "More
  actions" moves to the header overflow button.
- **Theme:** both. **Localization:** PT as on `17`; "Abrir checklist existente"
  on one line at 360 px.
- **Must NOT change:** lifecycle transitions, completion rules, assignment
  rules, offer creation, capability link issue/revoke, message contents,
  financial snapshot semantics, authorization.
- **Consequence statements:** each "will / will not" line must be verified
  against the implementation before it ships. The two drawn for Complete
  service are a proposal: "Mark the service Completed" and "Not resolve the
  open issue".
- **OPTIONAL:** disclosure summaries that would need data not already loaded on
  the page. Use only loaded data; otherwise show no summary.

## Goal 7 — Properties, Cleaners, Clients lists (Phase G)

- **Source:** artboards `18`, `29` (desktop), `19` (mobile PT), `03`
  (ClientRow, PersonRow).
- **Components required:** `PageHeader`, `SearchField`, `SegmentedControl`,
  `Row` variants, `InlineFlag`, `Tag`, `StatusPill`, `EmptyState`, `Skeleton`.
- **Must remain:** search by name and address (Properties) and by name
  (Cleaners); create actions; "Show excluded" gate; row opens the detail view;
  archive badge; provenance classification.
- **Visual acceptance:** rows show name and address; client name or a "No
  client linked" flag; 56 px rows; "Active" is a success pill, not amber; the
  page header renders before data.
- **Responsive:** mobile rows are two or three lines, full-bleed.
- **Theme:** both. **Localization:** PT as on `19`.
- **Must NOT change:** property, cleaner or client data shapes; phone number
  visibility rules.
- **OPTIONAL — needs a product and data decision first:** the "Next service"
  column and its cleaner / "No cleaner" line (needs an efficient per-property
  read model; do not add per-row reads); the "No client linked" segment filter;
  the per-row "New service" quick action if the property-to-service flow is not
  already available from the list.

## Goal 8 — System states (Phase H)

- **Source:** artboards `20`, `21`, `11`; `DESIGN_SYSTEM_V2.md` section 8.
- **Components required:** `Skeleton`, `SyncLine`, `Banner`, `EmptyState`,
  `ErrorState`, `Toast`.
- **Must remain:** existing error semantics, including visible failure with no
  Production fallback for Sandbox callables; existing retry handlers; telemetry
  hooks for page load.
- **Visual acceptance:** page title and actions render before data on every
  list; refresh never removes loaded rows; a failed refresh shows the time of
  the data on screen; first-run and filtered empty states are different; no
  full-page spinner anywhere.
- **Theme / localization:** both themes; all messages in EN, PT, ES.
- **Must NOT change:** what is fetched or when. This goal changes what is shown
  while fetching, not the fetching.

---

## Behaviour notes for all goals

- **Provenance tag by exception** (Real shows no tag) is a presentation change
  to an auditing feature. If the operator needs to see "REAL" during the pilot,
  keep the tag visible and decide later.
- **Sidebar and Intake:** Reservation Intake V1.1 was approved inside the
  current shell and must not wait for Goal 3.
- **Emoji removal** changes the look of filter chips and attention items that
  the operator has learned. Ship it with a What's new note.
