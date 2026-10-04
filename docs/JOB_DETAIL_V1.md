# Job Detail V1 — progressive disclosure (#74)

Presentation-only, Sandbox-first review of the existing Job Detail. No new
route, provider, domain state machine or authorization path.

## Primary view

Back, Property title, compact service date/time/Client, existing proved
attention cards, unchanged lifecycle rail, assigned Cleaner, unchanged saved
checklist progress and the existing primary intent. Completed services retain
the recorded completion time (or the existing missing-value fallback).

Seven secondary groups and **More actions** start closed. COMPLETED/archived
services retain their historical primary path without operational intents.
Financial/provenance/history details do not compete with the next step.

Native `details`/`summary` provides keyboard disclosure with ≥44px targets.
Content stays mounted: closing a group never cancels/discards an existing form.
Opening a group invokes no domain handler. Intents reveal the existing target
group before focus/scroll; existing Run navigation remains the same read path.
Queued focus is ignored after Job switches; unmount leaves no target to focus.
The existing new-Offers acknowledgement still reveals/focuses Offers once.

## Inventory — no function removed

| Before location | V1 section/path |
| --- | --- |
| Schedule intention → date/time form | More actions → Service details |
| Guest/notes edit + saved notes | Service details |
| Full price snapshot + Edit prices | Financial |
| Create/open Checklist Run | Checklist; primary intent opens existing Run |
| Cleaner capability issue/copy/replace/revoke | Checklist |
| No-checklist completion confirmation | Checklist; completion intent reveals it |
| Checklist review/approval navigation | Existing Run read path, unchanged |
| Legacy Start cleaning / execution controls | Checklist |
| Direct assignment/search/confirm | Cleaner & assignment; primary assignment reveals picker |
| Roster/replace/remove/acknowledgment | Cleaner & assignment |
| Offers/compensation/public link/message | Offers; legacy assignment intent still reveals Offers |
| Reminder preview/explicit sensitive opt-in/copy/WhatsApp | Cleaner & assignment |
| Issues/resolve/refresh | Issues; open-Issue attention remains above the rail |
| Saved Property/Client/guest/status/timestamps | History & administration; date/time/Client remain compact above |
| DataProvenanceBadge/Review | History & administration, original component unchanged |
| Archive/restore and confirmation | History & administration, original control unchanged |
| Existing simulation action (where eligible) | Offers, eligibility unchanged |

The primary intent derivation and all guards, save/assignment/completion/
capability/reminder handlers remain unchanged. A DRAFT schedule attempt retains
the protection explanation and opens the existing checklist only; it neither
unlocks scheduling nor suggests deleting/recreating the Job.

## Synthetic visual review

Reuse `Service lifecycle · Preview` in the Sandbox. Existing synthetic fixtures
and seed definitions are unchanged; no seeding is required for this slice.
The loopback Playwright harness renders this same Job Detail, not a Workspace.

```sh
npm test -- src/features/jobs/JobDetailDisclosure.test.jsx src/features/jobs/JobDetail.test.jsx src/features/jobs/JobLifecycleIntegration.test.jsx src/features/jobs/ServiceLifecycleComponents.test.jsx src/features/jobs/serviceLifecyclePresentation.test.js src/lib/presentation.test.js
npx playwright test --config playwright.lifecycle.config.js
```

Ignored screenshots under `artifacts/visual-smoke/` include desktop UNASSIGNED,
ASSIGNED+DRAFT, IN_PROGRESS, READY and COMPLETED; mobile UNASSIGNED, IN_PROGRESS,
stale, COMPLETED, archived and unknown. `job-detail-v1-{1440,390}-assignment-open.png`
shows one operational disclosure open. Ordinary captures start with all seven
groups and secondary intents closed. Browser checks cover native keyboard
Enter/Space, focus routing, touch target size, no horizontal overflow and no
domain/provider calls. Production builds exclude the synthetic preview/harness.

Publication is branch/Draft PR plus **Sandbox Hosting only** for human review.
Production merge/release requires separate authorization. Sandbox Functions/
Storage remain billing-gated; synthetic preview is not cloud mutation evidence.
