# CleanFlow Design System V2 — Migration Plan

This is a sequence of small, separately releasable changes. It is not a rewrite.
Each phase leaves the product fully working in both themes and all languages,
and each can stop for operator feedback before the next begins.

Ground rules for every phase:

- Presentation only unless a phase says otherwise. No change to handlers,
  guards, services, Firestore shapes, rules, Functions or business rules.
- Keep user-facing strings behind the i18n layer; add keys in EN, PT and ES
  together.
- Follow the existing release practice: branch, Sandbox Hosting, human visual
  review, then a separately authorized Production Hosting release.
- New and old styles coexist. A screen moves to V2 as a whole; no screen is
  left half-migrated at release.
- Run `VISUAL_ACCEPTANCE_CHECKLIST.md` on every phase.

## Sequence

| Phase | Goal | Size | Depends on | Visible to the operator |
|---|---|---|---|---|
| A | Tokens | small | — | No (three small contrast fixes, optional) |
| B | Shared primitives | medium | A | No (components exist; one pilot use) |
| C | Application shell | medium | A, B | Yes, every screen |
| D | Services list | medium | B (C recommended) | Yes |
| E | Dashboard | medium | B, D rows | Yes |
| F | Job detail | large | B | Yes |
| G | Directories: Properties, Cleaners, Clients | medium | B, D rows | Yes |
| H | System states everywhere | small–medium | B | Yes, mostly on slow networks |
| I | Remaining screens and forms | medium | B | Yes |
| J | Legacy cleanup | small | all | No |

### Phase A — Tokens
Add the V2 role names to `src/index.css` for both themes, using
`TOKENS.json`. Point the existing `--color-*` variables at the V2 roles where
the value is identical (see `legacy-map`), so nothing changes on screen. Add
the type, space, radius and size scales as variables. Do not touch any
component rule yet.
Optional, as a separate reviewed commit: the changed values in
`changed-from-current` (stronger input border, adjusted muted text).
**Exit:** all existing unit and Playwright tests pass; before/after screenshots
of the existing visual-smoke set are identical (or differ only by the optional
contrast commit).

### Phase B — Shared primitives
Create the presentational components once, in `src/components/`, with tests and
no data access: `Icon` (stroke set replacing `OperationalIcon` emoji),
`StateLabel`, `StatusPill`, `InlineFlag`, `Tag`, `Button` variants including
busy and blocked, `Field`/`SearchField`/`SegmentedControl`/`FilterChip`,
`Panel`, `Row`, `Banner`, `Skeleton`, `EmptyState`, `SyncLine`, `Disclosure`
summary slot, `ConsequenceDisclosure`, `ConfirmationSheet`.
Reservation Intake already has scoped versions of several of these; lift them
rather than writing new ones, and leave Intake rendering exactly as approved.
**Exit:** a Sandbox-only component page (inside Central Dev) shows every
primitive in light and dark, EN and PT.

### Phase C — Application shell
Replace the header and navigation in `App.jsx` with the sidebar, icon rail,
mobile tab bar and account menu. Views render unchanged inside it. Page
containers switch from the 680 px column to the four templates; until a screen
is migrated it uses the form template width so it looks the same as today, just
without the large header.
Recommended early because it removes the largest source of wasted space and the
mobile navigation overflow for every screen at once. It can also be moved after
F if operator feedback on the lifecycle work (#76) should be collected in the
current shell first; D–G do not depend on it.
**Exit:** every existing destination reachable in at most two taps on mobile;
no horizontal scrolling at 360 px; navigation landmarks and accessible names
preserved for existing tests.

### Phase D — Services list
Dense rows, toolbar, day grouping, load-more footer. First real consumer of
`Row`, `LifecycleRailCompact`, `FilterChip`, `Skeleton`, `EmptyState`.

### Phase E — Dashboard
KPI strip, attention queue, Next 48 hours, This week, Recently completed, and
the three non-attention states.

### Phase F — Job detail
Two-column layout with decision rail, summary cards, disclosure summaries,
attention banners, mobile sticky action. The largest phase; split it:
F1 header + lifecycle + summary cards + rail (desktop), F2 disclosure summaries,
F3 mobile layout and sticky action, F4 in-app confirmation replacing
`window.confirm`.

### Phase G — Directories
Properties, then Cleaners and Clients with the same row pattern. The optional
"Next service" column ships only if an efficient read exists; otherwise the
column is omitted and the layout still holds.

### Phase H — System states everywhere
Apply first-load, refresh, stale, slow, section-error and page-error patterns to
every migrated screen. Stop returning a loading sentence in place of the page.

### Phase I — Remaining screens and forms
Payments, Payment review, Weekly close, forms, sign-in, What's new, Feedback,
then token alignment for the cleaner and public pages after a review with a
cleaner.

### Phase J — Legacy cleanup
Delete unused classes and the legacy variable aliases once no rule references
them. Remove `OperationalIcon`'s emoji map.

## What can run in parallel

- D, F and G touch different features and can be developed in parallel after B.
- H can follow each screen instead of being one phase.
- C is independent of D–G and can land before or after any of them.

## What must not be bundled

- Do not combine C (shell) with any screen migration in one release. If the
  shell causes a problem it must be revertible alone.
- Do not combine the optional contrast changes with component work.
- Do not add the Properties "Next service" read, or any other new data
  requirement, to a presentation phase.

## Rollback

Every phase is Hosting-only and presentation-only, so rollback is the previous
Hosting version, as in the current release notes. Phases A and B are invisible
and need no operator communication. C–G should each be announced in What's new.
