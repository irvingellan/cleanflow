# Release A + Claude UX integration

Local candidate on `codex/release-a-claude-ux-85`. This document records scope;
exact final SHA, test results, build manifests and Production snapshot are in
the sealed local receipts. Nothing in this work authorizes publication.

## Provenance and preservation

- Original Release A: `codex/notification-reliability-v1-85`,
  `1faf4ba4837e1ec8a5871bfa6b68c59461e13206`.
- Visual source: `feature/gabi-feedback-ux-v1`,
  `0b1f686e9799f73d4c42c68feb77904d8d0e13cb`, based on
  `5469a32a3d7890b7a4e00ad0031ca1be8f09595b`.
- [Claude contract](PILOT_FEEDBACK_UX_V1.md) is preserved as source history;
  the integration decisions below supersede its unconnected previews.
- The isolated integration worktree starts at the original exact Release A.
  Visual changes are selectively ported by component. No directory replacement,
  merge of the older backend, dependency update or new backend endpoint.
- Original branch, worktree, manifests, seal and release scripts remain available.
  Only the new candidate's preflight branch binding changes, and its required
  verification receipt adds `pilot-visual`. The publication/rollback engine and
  ordered Function targets remain byte-identical to original A.
- Reuse decision: EXTEND the existing React components, Firebase boundaries,
  Vitest and Playwright harnesses. No external package or new abstraction is
  required for this compatibility port.

## GO / NO-GO comparison

GO here means eligible for an owner-authorized publication only after the exact
SHA gate and fresh Production drift check pass. Both options are local until
published. A deployment mutex plus an exclusive operator window remains required.

| Change | Original A | Integrated A | Risk / evidence gate |
|---|---|---|---|
| Durable Inbox, paged reads, total vs loaded unread counts | GO | GO, unchanged semantics | Inbox authorization, pagination, stale routes and count tests; browser links |
| Manual interested-cleaner decision | Existing Offers assignment | GO: prominent decision panel; primary action follows zero/one/many interested; manual picker secondary | Same eligibility and assignment callback; emulator proves no assignment before explicit confirmation |
| Interest event deep link | Opens current Job | GO: current Job plus focus on eligible decision or safe Offers fallback | Server-authorized destination unchanged; no cached destination authorization |
| Full future agenda | Existing upcoming view | GO: labelled count, all / by month | More than seven real emulator projections across months, rebuild/removal/isolation; UI all/month/cache tests |
| Checklist action and record | Existing detail | GO: action visible, service record collapsed, safe fallback | Unknown projection never claims pending; multi-session and stale async response tests |
| Pending checklist projection | Absent | DEFER | Requires current Run status/started projection, versioned schema and replay/multi-device triggers; no extra Function included |
| Private property access | Hidden | NO-GO for private fields; safe placeholder only | Hook explicitly disconnected, even if an injected service offers the method; Rules still deny Property reads |
| Photo guidance | Previous copy | GO: clearer copy within current limits | Existing uploader, formats, bytes and count policies unchanged; checklist/security tests |
| Required photo list | Absent | DEFER server contract; optional prepared UI only | Must freeze/version per Run; missing or legacy data has no new requirement or validation |
| Reported 16-photo stop | Unresolved | Unresolved | Synthetic 16-photo render is not failure reproduction; do not increase limits |
| #86 automatic mode | OFF | OFF | No creation endpoint deployment; synthetic opt-in emulator profile validates no second manager approval |
| Cleaner push / Release B | OFF | OFF | Dedicated Web app, VAPID confirmation, physical tests and separate authorization still required |
| Backend, Rules, Auth/session contracts, release target set | Reviewed 4 creates + 18 updates | Identical to original A | Full security, legacy/public paths, sessions and rollout guards |
| Visual acceptance | Prior layout | Claude-compatible integration | Chromium desktop + WebKit mobile, light/dark; automated behavior/layout checks and inspected screenshots |

Integrated A has the same cloud migration risk as A, plus a bounded UI regression
surface. Original A remains the smaller visual change option. Choose exactly one
seal for publication; publishing either advances Production and makes the other's
old baseline fail closed. Re-review/reseal before switching after publication.

## Preserved contracts and deferred work

Interest remains `INTERESTED`, not an Assignment. `FIRST_ACCEPT_WINS` Jobs do not
show this decision panel or ask for a second approval. Automatic mode remains
absent from the A controls and disabled on the server. Ordinary direct assignment
still has its explicit picker and confirmation.

The Inbox interest hint is presentation-only and separate from the server's
resolved destination. App fetches the current Job from the server. Stale,
archived, already-assigned, loading and failed Offer states never widen eligibility.
Cleaner Inbox links retain existing authorized JOB/OFFER resolution and fallbacks.
Offer loading is additionally bound to the current Job, opening epoch and request
sequence: late results/errors/finalizers cannot populate a different decision panel.

Agenda completeness uses all entries already supplied by the cleaner-scoped query;
o new Property or Job read is introduced. Cached/offline data is labelled possibly
incomplete. Complete current projections may lag source triggers as before.

Checklist pending UI expects `checklist: {status, started}` only when a future
safe server projection provides it. Current Production/A entries have no such
field and show the existing Open checklist action without a pending claim.
Projection delivery needs versioning, current Run selection, transition and first
save handling, replay/out-of-order tests, revocation and two-device observations.
It is deferred to avoid adding an unreviewed Run trigger to A's fixed release scope.

No `getMyJobAccess` implementation or binding is included. Private Property
fields, their exact allowlist and access window need explicit authorization.
The prepared detail shows the truthful manager-contact placeholder.

A future `photoRequirements` list must be validated and frozen per Run with its
version, legacy fallback, delivery DTO and any server-side completion enforcement.
This release does not invent required shots or change minimums/maxima. The
16-photo issue needs an authorized reproduction with count, total bytes, MIME,
individual size, interrupted/retried transfer and device evidence. Existing
20-photo/50 MiB ceilings and inherited per-Run policies are unchanged.

## Validation and release procedure

Run the original full gate plus `e2e/pilot-feedback/playwright.config.js` on the
final clean SHA: unit, manager Rules/Storage and release mutex, Hub/Inbox/push
security, real emulators in WebKit and Chromium (manual and automatic profiles),
release/build/runtime guards, browser worker lifecycle, then the four-project
synthetic visual harness. Browser evidence is not a physical-device acceptance.

Use [A runbook](NOTIFICATIONS_RELEASE_A_RUNBOOK.md) with this branch and a fresh
review directory. Bind `verification.json` to the new SHA and include a positive
`pilot-visual` pass count. Build A and compatibility variants, capture each
manifest/assets, run both read-only preflights, then seal. The old review directory
must never be overwritten. The [exact Function matrix](NOTIFICATIONS_RELEASE_A_MATRIX.md)
remains authoritative: four creates, eighteen updates, seven exclusions.

After explicit authorization, the single publish command uses the new SHA,
review directory, `--approve "publish:<new-plan-sha256>" --exclusive-window`.
Rollback requires the corresponding completed publish receipt and separate
`--approve "rollback:<new-plan-sha256>" --exclusive-window`. It disables the
three Inbox callables and publishes session-compatible Inbox-off Hosting; it does
not revert all Functions or remove the UX improvements. Restoring the original
visual layout after publication needs a separately reviewed compatible forward
release, not a blind old Hosting rollback. A partial deploy stops and retains its
mutex/receipt for reconciliation, as documented in the runbook.

No Production deploy, data mutation, real push or cloud resource setup is part of
this integration. Release B follows the original gated path after A; its physical
acceptance cannot be replaced by emulator or screenshot results.
