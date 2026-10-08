# Phase F2 — Intelligent disclosure summaries

Local, branch-only pilot from exact operator-accepted F1
`1961aa48057b1d772bc8ee8bd307057775c63056`. F1 acceptance is the explicit
product-owner decision; it supersedes the pending-acceptance text in its
historical implementation checkpoint. No merge/deploy authorization.

## Seven summaries and evidence boundary

| Existing group | Reused source | Presentation / uncertainty |
| --- | --- | --- |
| Service details | Job `scheduledDate`, `scheduledStart`; existing date formatter | Valid saved date/time only; invalid/missing date stays Not provided, missing time omitted rather than invented |
| Cleaner & assignment | Existing `getAssignedCleanerIds` / legacy singular ID; loaded `knownCleaners`, active Assignment name | Known names, otherwise known roster count. Explicit empty v2 roster or unassigned legacy state can say no cleaner. Missing/malformed roster stays unknown; no acknowledgment inferred |
| Checklist | Existing `checklistRun`, loading/error flags | DRAFT / READY_FOR_REVIEW / ABANDONED verbatim states, independent of Job completion. Null Run means none only after explicit successful load; undefined/error/unknown state stays Not provided |
| Offers | Existing full Job Offers and loading/error flags | Known pending/interested counts, or recorded count for declined-only responses. Explicit loaded-empty can say no offers recorded; missing flags/unloaded/error/malformed statuses never become zero |
| Issues | Existing full Job Issues and loading/error flags | Known OPEN count; no open issues only from explicitly successful, complete list with recognized states. Error/unverified/malformed state stays unknown |
| Financial | Neutral label naming existing section contents | Client price and cleaner payout; no amount, payment, reconciliation or margin inference |
| History & administration | Job `createdAt` via existing Timestamp formatter; `archivedAt` | Valid recorded creation time or Archived. Otherwise Not provided; no complete history claim |

The existing controller starts Job detail collections/Run in loading state;
its successful full reads end with explicit `loading=false`, `error=false`.
These flags are required for collection/Run absence claims. Missing caller
metadata does not count as a successful read. Refresh/loading suppresses old
summary evidence until the existing load resolves; error uses the neutral
fallback. No read, subscription, controller flag, domain field or state is added.
Cleaner-name lookups inside JobDetail are not duplicated; an unavailable name
in wrapper props uses the known roster count instead of fetching anything.

## Composition, accessibility and F1 preservation

The Sandbox opt-in wrapper computes a pure presentation map from its existing
props only for V2 desktop. JobDetail passes each optional string to its original
JobDetailSection. CURRENT and widths below 1100px receive no map and retain
their original headers. The seven original bodies stay mounted, including
pending forms. All 64 original event bindings remain; hooks/guards/handlers
before the presentation elements are byte-identical to F1. App, controller,
services, lifecycle model and Intent Layer are unchanged.

Native details/summary still owns Enter/Space/open state. Accessible names
remain the section title; the secondary line is an `aria-describedby` text.
No action, button or control is inserted into a header. Focus uses the approved
3px token (a scoped selector overrides the legacy 2px specificity). One-line
secondary text wraps without truncation/overflow, using V2 text-secondary and
secondary typography tokens. No new icon, color category, animation or badge.

F1's 360px rail, one primary intent, attention, lifecycle, cleaner/checklist
overview and real reveal/focus handlers remain. Mobile/F3 and confirmation/F4
are not implemented. Production stays CURRENT; its build excludes the V2
composition, helper execution and scoped CSS. The optional generic summary slot
and localized strings exist in shared modules but are unused in Production.

## Local operator pilot

```sh
npx vite --config e2e/job-detail-v2/vite.config.js --host 127.0.0.1 --port 4202 --strictPort --mode e2e
```

<http://127.0.0.1:4202/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned-draft&lang=en&theme=light>

Use `lang=en|pt|es`, `theme=light|dark`, CURRENT/V2, and the local-only scenario
selector. Scenarios include unassigned, offered, assigned, assigned-draft,
in-progress, ready, completed, archived, open-issue, stale, unknown, loading,
error. All data is fictional and memory-only. Existing synthetic Date values
are adapted to the real Timestamp interface without inventing timestamps.
Firebase imports are replaced with fail-closed stubs. No credentials, photo
bytes, capabilities, real records or cloud calls. F1 port 4201 is untouched.

## Validation and visual evidence

- Focused jobs/checklists/Phase A+B: 36 files / 522 tests, including 25 F2 tests.
- Full unit: 118 files / 1,312 tests.
- F1/F2 Playwright: 80 tests; EN/light, PT/dark, ES/light and all required
  evidence/loading/error states; native keyboard, accessible names/descriptions,
  focus, reduced motion, pending form preservation, 1100/1280/1440/1920 rail
  widths, 360/390/768 CURRENT fallback, no domain/provider calls on render.
- Existing lifecycle/Job Detail/compact regressions: 25 Playwright tests.
- Existing CURRENT visual regression: 30 byte-identical pairs; additionally
  four wrapper-vs-current component pixel comparisons within the F1/F2 suite.
- Production/Sandbox build and environment/Hosting preparation guards: 20.
  Builds use disposable all-synthetic mirrors, never local live configuration.
- Diff check passes. Existing non-blocking Node punycode/build warnings remain.
- Ignored screenshots: `artifacts/visual-smoke/job-detail-v2-f2/`: all seven
  collapsed for each scenario in light EN/dark PT; representative Financial
  expanded, pending edit retained, intermediate wrapping and mobile CURRENT.

Artboards 14/24 and 16 were inspected. Deliberate differences: saved schedule
instead of illustrative guest/note count; known cleaner name rather than an
acknowledgment claim; Run state only (no duplicated capability interpretation);
recorded Offers rather than sent-message proof; neutral text rather than new
Issue badge; only valid recorded creation timestamps. Existing F1 shell,
lifecycle symbols, action wording and confirmation behavior are retained.

This is synthetic Chromium/local evidence, not authenticated cloud/device or
real-operator F2 acceptance. After F2 acceptance, the next separately scoped
step is F3 mobile hierarchy/sticky primary, not automatic implementation.
