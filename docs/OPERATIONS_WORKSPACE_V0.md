# Operations Workspace V0 — Issue #51

## Status and boundary

Branch-only interaction experiment based on `main` at `0ec3e90`. It is not a
production-navigation replacement and is not approved for deployment. Open
`/workspace-preview` only in explicit Firebase emulator mode with an active
synthetic manager membership. Outside emulator mode it refuses entry before
auth subscription or operational reads. The existing manager UI remains the
control at `/`; public routes and backend business rules are unchanged.

The experiment tests whether preserving the worklist while selecting a Job and
performing short actions reduces context switching. It does not establish
faster real-user completion, fix photo uploads, or change notification delivery.

## Current-flow baseline

Counts refer to SPA view replacement, not document reload. Form typing and field
selection are excluded from primary-action counts; confirmation buttons count.
The existing control already retains search/filter state and restores a list
anchor. It refetches the worklist on return, so context is rebuilt, not wholly
lost. No human timing measurements were collected.

| Flow | Current control | Workspace experiment |
| --- | --- | --- |
| Create → direct assign → prepare reminder | Services → creation form → Job Detail; assignment/reminder already inline | List remains mounted; existing creation form opens in panel, acknowledged Job becomes selected, assignment/reminder use panels |
| Assigned Job → checklist link | Job Detail contains current checklist/link controls; return requires Back | Same controls in checklist panel; closing leaves selection/list intact |
| DRAFT → understand/recover | Existing DRAFT guidance and link reissue; progress opens a separate Run view | Next-action guidance identifies DRAFT/stale context; same reissue panel; saved progress replaces only center |
| READY → review/approve | Job Detail → Run view → existing approval confirmation | Run in center; same approval/confirmation; list remains alongside on desktop |
| Switch 3–5 Jobs | 3–5 selections plus 2–4 Back actions; worklist reloads on re-entry | Desktop: 3–5 selections, no Back; mobile still needs 2–4 Back actions but returns to the retained list |

A panel is still a context change and closing it can cost a tap. V0 does not
promise fewer taps in every flow. The strongest observed benefit is persistent
desktop selection/search/list context, not faster backend reads. Mobile retains
the list underneath a full-width detail view rather than shrinking three columns.

Source-derived command counts through the same endpoints: A reminder preview,
5 control / 5 workspace (successful Assignment closes its panel); B prepared
link plus Copy, 5 / 5; C stale-link reissue plus Copy, 3 / 4 (extra panel entry);
D approved completion, 4 / 4; E 3–5 Jobs, 5–9 / 3–5 desktop or 5–9 mobile.
Include-checklist checkbox counts; typing/field selection does not. These are
action-path counts, not measured human performance. A–D require no Back before
their endpoints; afterward the control takes one Back (two for D). Desktop V0
does not leave its workspace; mobile takes one Back, plus panel Close if needed.

## Composition and reuse

- `useJobsWorklist` owns the existing query, filters, Cleaner lookup and paging.
  New acknowledged Jobs are upserted into that list. Old pagination responses
  cannot overwrite a changed status/date query.
- `useJobDetailController` owns existing Offers, Issues, Assignments, Run,
  capability, mutations and Manager Async Operation Telemetry. Optional shared
  active Cleaner data avoids a second detail Cleaner lookup. Selection/request
  guards reject obsolete reads and mutation responses; no new telemetry schema
  or polling was added.
- `JobsPage`, `JobDetail`, `CreateCleaningForm`, `OfferCleaners`,
  `ChecklistCapabilityControls` and `ChecklistRunDetail` are reused. Optional
  composition props move existing sections into stable portals; handlers,
  validation, sensitive-message opt-in and server confirmation are not copied.
- Job Detail and Run remain mounted while a panel closes/reopens. Newly issued
  links are not automatically replaced on reopen. Switching Jobs discards the
  former Job's local panel state, as with the existing control.
- No new persistence/service/backend/global-state library was introduced.

Initial control detail has up to six independent read operations: Offers,
Issues, Assignments, Run, capability and active Cleaners. The workspace reuses
Cleaners from the worklist and retains the other five independent operations.
Status/date query changes can still reload list/Cleaners. Subsection failures do
not erase the selected Job; failed/pending reads are not treated as absent Runs.
Server-owned mutations commit UI only after acknowledgement.

## Interaction behavior

Desktop uses a persistent list, detail and next-actions composition. Tablet
places actions above detail beside the list; below 1000px it uses one full-width
layer. Mobile Back restores window scroll and selected-card focus. Desktop list
scroll stays in the same node. Selection has `?job=<id>` history/deep-link
support; malformed identifiers fail locally and missing/denied reads show error.

Next actions are a tested pure presentation derivation: direct assignment or
Offers for unassigned Jobs, reminder/optional checklist for assigned Jobs,
explicit DRAFT link/progress/recovery, READY review and historical viewing only
for completed/archived Jobs. Existing server eligibility is authoritative.
Optional DRAFT abandonment stays in the existing Run view; no lifecycle gate is
reimplemented. Advanced archive/provenance actions remain in the control UI.

Short actions use desktop drawers/mobile sheets with selected identity, Close,
Escape, focus trapping and an inert background. EN/PT/ES, 44px action targets,
safe-area padding and reduced motion use current patterns. The existing
ScrollToTopButton is mounted once; its mobile offset follows the measured
sticky-action height and it hides while a sheet is open.

New Service reuses Property search, date, editable 11:00 default and price
suggestions. The list updates and selects the created Job only after the
existing service confirms it; closing/replacing an in-flight panel cannot
unexpectedly reopen it or change a newer selection.

## Local scenarios

The existing runner now also accepts:

```bash
npm run scenario -- workspace-direct-assign --fast
npm run scenario -- workspace-draft-recovery --fast --mobile
npm run scenario -- workspace-ready-review --watch --mobile
npm run scenario -- workspace-direct-assign --fast --repeat 3
```

FAST/WATCH/RECORD and the original three scenarios remain available. The runner
builds emulator mode and pins `demo-cleanflow`; workspace scenarios also reject
non-local browser HTTP requests. Fixtures, capability rotation, photos and
completion are synthetic/local only. Their evidence is not real-device proof.

Viewport checks cover 2560×1080, 1920×1080, 1440×900, 768×1024 and 390×844.
Scenario checks include list/filter/scroll retention, creation defaults,
authorized Assignment, reminder preview without send, stale-link recovery
without answer loss, delayed old-Run reads, saved evidence/review/approval,
completed action suppression, sheet close and scroll-control non-overlap.

Validation on 2026-09-30: 158 focused workspace/Job Detail/controller/pagination/
access tests, 794 full unit tests, and 29 standard emulator E2E tests passed.
The three workspace scenarios passed desktop and mobile; direct assignment
passed FAST repeat-three and headed mobile WATCH, and the original three control
scenarios passed. Final scoped card/header CSS also passed desktop/mobile/WATCH
with geometry assertions. Both emulator and ordinary builds, syntax and diff
checks passed. The existing large-bundle build warning remains.

An early run accidentally served an ordinary build: synthetic sign-in was
rejected before operational reads. Final workspace runs use the emulator build
and block non-local HTTP requests. No production operational data was accessed
or changed; no deployment was performed.

## Evaluation limits

Use this branch to compare the same synthetic tasks with Irving, then decide
whether to test with the operations manager. It is not a release candidate.
Chromium viewports are not installed-iPhone/Android proof; keyboard and real
network latency still need human observation. The workspace does not reduce
the existing backend work inside each micro-read. Broad Offers/Issues and
historical payment tasks were not redesigned. No conclusion about the unresolved
real photo incident, #48 installed-PWA recovery, #49 diagnostics or #50 validation
reasons changes follows from this experiment.
