# CleanFlow Design System V2 — Component Catalog

Visual reference: artboards `03` (light) and `04` (dark); system states on `20`
and `21`. Token names refer to `TOKENS.json`. Component names are proposals;
engineering may keep existing names where a component already exists.

Legend for "Today": the existing class or component this replaces or absorbs.

---

## Status and identity

### StateLabel
- **Purpose:** say why a card, row or screen needs the manager.
- **Anatomy:** 14 px icon + uppercase text, 11/14, 700, +0.07em, tone text colour. No background.
- **Variants (tone):** neutral, info, attention, warning, risk, brand (lifecycle stage).
- **States:** static.
- **Responsive:** never truncated; may wrap above the title; date sits beside it or on the next line.
- **Accessibility:** icon is decorative; the text carries the meaning. Do not rely on caps for emphasis in screen readers (real text is sentence case, caps by CSS).
- **Today:** `.attention-item__label` with emoji.

### StatusPill
- **Purpose:** a property of a record (Acknowledged, Draft, Ready for review, 1 open issue).
- **Anatomy:** 24 px high pill, optional 13 px icon, 12/16 600 text, tone background + border + text.
- **Variants:** all tones.
- **Accessibility:** always has text; icon optional only for neutral.
- **Today:** `.status-badge`, `.badge`, `.weekly-close-status`.

### InlineFlag
- **Purpose:** a missing or notable value inside a cell ("No cleaner", "Out of date", "Active").
- **Anatomy:** 14 px icon + 13/18 600 sentence-case text in tone colour. No box.
- **Variants:** warning, attention, risk, success.

### Tag
- **Purpose:** record classification, shown by exception.
- **Anatomy:** 20 px high, radius 6, neutral, 10.5 px caps.
- **Variants:** Demo, Unknown, Archived.
- **Rule:** records classified Real carry no tag. Unclassified and Demo do.
- **Today:** `DataProvenanceBadge` (shown on every row, including REAL), `.record-archive-badge`.

### Count
- **Purpose:** a number attached to a label.
- **Variants:** solid (navigation, needs action), quiet (totals in headings and filters).

### Avatar
- **Purpose:** identify a person in a row.
- **Anatomy:** circle, initials, 28 px (rows) or 40 px (cards). Dashed outline variant for "nobody".
- **Accessibility:** decorative; the name is always next to it.

### EnvironmentIndicator
- **Purpose:** make test environments impossible to mistake for live.
- **Variants:** Sandbox pill (desktop sidebar), Sandbox strip (28 px, above every mobile screen), Production label (account menu only).
- **States:** always visible in Sandbox, including above scrims.
- **Accessibility:** text label, not colour; dashed border is the non-colour cue.
- **Today:** "PRODUCTION · Build …" text and "Abrir Sandbox" in the header.

---

## Actions

### Button
- **Purpose:** every action.
- **Variants:** primary (one per view), secondary (default), tertiary (text), danger (outline), danger-solid (final destructive confirm), icon (square, needs `aria-label`), link-action (text + arrow, navigates).
- **Sizes:** 44 default, 36 small, 52 large (mobile primary, decision rail). Block width on mobile sheets and rails.
- **States:** default, hover (`brand-hover` or `surface-subtle`), focus (3 px ring), busy (spinner replaces leading icon, label changes to "-ing…", width kept), disabled, **blocked** (dashed outline + lock + the missing input in the label).
- **Responsive:** one line in EN and PT. Small buttons keep a 44 px hit area.
- **Accessibility:** real `<button>`; busy sets `aria-busy`; blocked is still focusable so its reason can be read.
- **Today:** `.button`, `--primary`, `--small`, `--text`, `--danger`, `.back-button`, `.header-sign-out`, `.job-filters__clear`.

### StickyMobileAction
- **Purpose:** keep the next step reachable on detail screens.
- **Anatomy:** elevated bar, top border, micro-label "Suggested next step", one large primary button.
- **States:** hidden while the keyboard is open; busy; blocked.
- **Responsive:** compact range only. On wider screens the same content is the decision rail.
- **Accessibility:** page content has matching bottom padding; respects safe-area inset.

### ActionList
- **Purpose:** the secondary intents of a record ("More actions").
- **Anatomy:** 44 px rows: icon, label, chevron.
- **Today:** Job Detail "More actions" disclosure.

---

## Fields

### TextField / Select
- **Anatomy:** label above (13/18 600), 44 px control, radius 12, `border-input`, optional help or error line below.
- **States:** default, focus (focus border + 3 px ring), error (risk border + message with what to enter), disabled, read-only.
- **Rule:** placeholder is never the label.
- **Select:** same box with a chevron; native picker on mobile.
- **Today:** `.cleaning-form` inputs, three different search inputs.

### SearchField
- **Anatomy:** TextField with leading search icon and a clear button when filled.
- **Accessibility:** `role="search"` on the toolbar; visible placeholder plus `aria-label`.

### SegmentedControl
- **Purpose:** switch between 2–3 mutually exclusive views of the same list.
- **Anatomy:** sunken track, 36 px options, selected option is a raised surface with a border. Optional quiet count.
- **Today:** none (new).

### FilterChip
- **Purpose:** quick, independent on/off filters.
- **Anatomy:** 36 px pill, icon + label. On: selected surface + selected border + brand text.
- **Responsive:** one horizontally scrolling row on mobile, with the Filters button pinned at the start.
- **Accessibility:** `aria-pressed`.
- **Today:** `.job-filter-chip` with emoji.

### FilterToken
- **Purpose:** show each active advanced filter and remove it.
- **Anatomy:** 28 px, "Field: value" + remove icon. Followed by "Clear filters" and the result count.

### Checkbox / Radio
- **Anatomy:** 20 px box or circle, `border-input`, brand fill when on; label to the right; whole line is the target (44 px high).

### OptionCard (property and cleaner picker)
- **Purpose:** choose one record from a short list.
- **Anatomy:** 48 px minimum, radio + title + supporting line; selected = selected surface and border.
- **Responsive:** two columns on desktop, one on mobile.
- **Origin:** Reservation Intake V1.1 property picker; replaces the plain radio list in direct assignment.

### DateTimeText
- **Purpose:** show a schedule honestly.
- **Rule:** "Wed, Oct 7 · 11:00 AM" when the time is known; "time not set" in muted text when it is not. Never invent a time, never show 00:00.

---

## Surfaces

### Panel
- **Anatomy:** `surface`, 1 px border, radius 18, padding 20. Flush variant for lists: header row (title, optional count, optional link) + rows.
- **Today:** `.panel`, `.dashboard-panel`.

### Card
- **Anatomy:** `surface`, border, radius 14, padding 16. Subtle variant on `surface-subtle`. Selected variant.
- **Today:** fourteen card families (`property-card`, `client-card`, `job-card`, `cleaner-directory-card`, `payout-directory-card`, `issue-card`, `summary-card`, …).

### Banner
- **Purpose:** an attention message attached to a screen or section.
- **Anatomy:** tone ground and border, radius 14, icon, optional StateLabel, title, one sentence, optional single action.
- **Variants:** info, attention, warning, risk, brand (decision).
- **Rule:** only for things that are proven. No banner for "all good".
- **Today:** `.service-attention`, `.state-card--error`, `.form-error` blocks.

### InternalBlock
- **Purpose:** developer or audit information.
- **Anatomy:** `surface-internal`, dashed border, monospace values.
- **Rule:** only inside TechnicalDetails or the Internal tools area.

---

## Lists

### Row (base)
- **Anatomy:** grid, 56 px minimum, 20 px side padding, divider below. Title 15/20 600, supporting line 13/18.
- **States:** default, hover (`surface-subtle`), focus (ring inside the row), selected (`surface-selected` + 3 px brand bar at the start).
- **Rule:** the whole row is one link. A second action is a separate button at the end.
- **Responsive:** on mobile 64 px, two lines, 16 px padding, full-bleed.

### JobRow
- **Columns (desktop):** day (first row of each day only) · time · property and client · cleaner (avatar + name, or "No cleaner" flag) · compact lifecycle + stage name · tag · chevron.
- **Mobile:** time · property / cleaner · client · stage name over compact lifecycle. Day shown as a group header.
- **Not shown:** prices (stay in Job detail › Financial).
- **Today:** `.job-card--lifecycle`.

### PropertyRow
- **Columns:** name and address · client (or "No client linked" flag) · next service (optional, see handoff) · tag · quick action "New service" · chevron.
- **Today:** `.property-card` (name, a "Property" label with a dot, provenance badge).

### ClientRow
- **Columns:** name and a one-line summary · tag · status pill · chevron.

### PersonRow (cleaner)
- **Columns:** avatar · name, phone and language · current activity · status pill · chevron.

### NeedsAttentionCard
- **Purpose:** one thing the manager should act on.
- **Anatomy:** StateLabel + date on the first line; record name; one sentence saying what is true; the action named on a button at the end (mobile: a link-action on the last line).
- **Order:** existing priority logic is unchanged (today/tomorrow without cleaner first).
- **States:** default, hover, focus. Tone comes from the StateLabel only; the card itself stays on `surface`.
- **Today:** `.attention-item` (tinted cards with emoji).

### GroupHeader / ColumnHeader
- **Anatomy:** `surface-subtle` strip, micro-label. Group header is sticky within its list on mobile.

---

## Lifecycle

### LifecycleRailCompact
- **Purpose:** show the stage of a service in a list.
- **Anatomy:** five segments, always followed or topped by the stage name.
- **Segment states:** done (solid brand), current (taller, wider, solid brand), not started (grey), skipped (dashed line), not known (dotted line).
- **Accessibility:** segments are decorative; the row has a full text description (existing behaviour).
- **Today:** `CompactServiceLifecycle` (✓ · – ? symbols under bars).

### LifecycleRailFull
- **Purpose:** the service's history on Job detail.
- **Anatomy:** five columns: bar, icon + stage name, evidence line ("Created Oct 2", "Skipped · assigned directly", "Not known").
- **Mobile:** five bars and one sentence: current stage, since when, what is next.
- **Rule:** evidence mapping is `serviceLifecyclePresentation()` unchanged.
- **Today:** `ServiceLifecycleRail`.

### ProgressBar
- **Purpose:** saved checklist progress.
- **Anatomy:** 8 px track, brand fill, always with "7 of 28 items saved" as text.

---

## Decisions

### ConsequenceDisclosure
- **Purpose:** say what an action will and will not do, before it is pressed.
- **Anatomy:** micro-label ("Approving this will", "Completing this service will"); "will" lines with a filled check; "will not" lines with an outlined minus; each with a title and an optional detail.
- **Rule:** required for actions that create, assign, complete, archive or send. Statements must be true of the current implementation.
- **Origin:** Reservation Intake V1.1.

### ConfirmationSheet
- **Purpose:** the explicit second step for consequential actions.
- **Anatomy:** micro-label, question as title, ConsequenceDisclosure, confirm button that repeats verb and object, "Go back".
- **Variants:** standard (brand), destructive (risk label, danger-solid button, safe button named for what is kept).
- **Responsive:** centred dialog or decision-rail state on desktop; bottom sheet over a scrim on mobile, Sandbox strip stays visible.
- **Accessibility:** `role="dialog"` / `alertdialog`, focus trapped, Escape closes, initial focus on the safe button.
- **Today:** inline confirm rows; `window.confirm` in one reminder flow.

### BeforeAfterDiff
- **Purpose:** compare a previous and a new value.
- **Anatomy:** summary line (field, old → new, delta pill) above two cards; the new card uses the attention ground. Arrow between them (down on mobile).
- **Origin:** Reservation Intake V1.1 observation comparison.

### Disclosure
- **Purpose:** secondary sections of a record.
- **Anatomy:** 52 px row: chevron, title, and a **summary** of what is inside on the right ("None open", "Draft · link active"). Open body on `surface-subtle`.
- **States:** closed, open, with attention (flag or pill replaces the summary), section error.
- **Rule:** opening never changes data. Content stays mounted when closed. Financial summaries never show amounts.
- **Today:** `JobDetailSection` (native `details`, no summaries).

### TechnicalDetails
- **Purpose:** identifiers and audit data for support.
- **Anatomy:** Disclosure with a lighter title; body is an InternalBlock.
- **Rule:** closed by default; no identifier next to the label.

---

## System states

### Skeleton
- Sunken blocks at the real size of the text they stand for, inside the real row. No shimmer under reduced motion.

### SyncLine
- "Loading…", "Updating…", "Updated 1:42 PM", "Last updated 1:12 PM" (attention tone). Sits by the page or panel title.

### EmptyState
- **Variants:** first-run (creating action), filtered (Clear filters), all-clear (success mark, no action).
- **Anatomy:** 44 px mark, title, one sentence, optional action.
- **Today:** `StateCard` (one sentence in a box for loading, empty and error alike).

### ErrorState
- **Variants:** page (nothing loaded: mark, title, sentence, Try again, a way out), section (Banner inside the section), field (message under the field), operation (Banner that keeps the input).
- **Rule:** say that nothing was changed when that is true.

### Toast
- Brief confirmation of a completed operation. Polite live region. Never the only place an error is shown.

---

## Shell

### Sidebar / IconRail
- 232 px with groups, or 64 px icons with tooltips. Active item: selected surface, brand text. Internal tools separated at the bottom.

### AccountMenu
- Identity, language, theme, notifications status, What's new, feedback, environment and build, Sign out.

### TabBar (mobile)
- Four destinations including More; 22 px icons, 11 px labels, 3 px top indicator on the active tab; count badge on More.

### PageHeader
- Title, one context line, sync line, refresh, actions. Detail screens add a back link above and a StateLabel above the title.
