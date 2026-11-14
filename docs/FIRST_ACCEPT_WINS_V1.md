# First Accept Wins V1

**Issue #86 · GitHub single-slot contract and local multi-slot draft.**

Production build `b4821d3` has 57 Functions. The administrative inventory
returned no `createAutomaticJobOffers` Function. The first delivery of that
writer needs a separately reviewed release. The contract below describes
existing unversioned batches. The multi-slot implementation has its own
additive rules.

## Multi-slot contract draft

- The option starts checked for an eligible new Job while the reviewed feature
  mode is enabled. Managers can choose manual distribution before sending.
- New automatic batches freeze a capacity of 1–10 and a versioned opening
  context. A valid acceptance atomically adds one canonical Assignment and
  stores its identity on the recipient's Offer. Ordinary checklist revision
  changes from these acceptances do not invalidate the remaining recipients.
- Once the roster fills, a durable close marker prevents reopening that
  batch. A manager's direct override also closes the automatic batch.
  Subsequent roster correction stays within the frozen capacity.
- Each accepted Assignment has its own durable manager notice. Filling
  the batch adds one distinct notice. Replayed delivery reuses its receipt.
- Keep the unversioned single-slot interpretation and existing manual Offers.
  New Job and Offer metadata stays server-owned. Revalidate with Rules and
  browser integration before opening this branch for review.

The draft awaits Rules integration, the full concurrency matrix and joint
review of pending offers after a schedule change.

The source baseline is release `a593daf636024d6830bf89c75bd7f6353b4b759f` with its
documentation checkpoint `5469a32a3d7890b7a4e00ad0031ca1be8f09595b`. The 14
public Hosting files match the previous release manifest. See the
[release registry](engineering/WORKTREE_RELEASE_CANDIDATE_REGISTRY.md) for the
recorded Hosting version and the [Cleaner Hub runbook](CLEANER_HUB_V1.md) for
existing session and device handling.

## Contract and compatibility

- Default distribution uses the legacy interest/decline flow. A manager
  explicitly selects automatic distribution on a new, unassigned, non-archived
  schema-v2 Job with an empty roster and no prior Offers or Assignments.
  Existing Jobs keep their manual semantics and need no migration.
- `createAutomaticJobOffers({ jobId, cleanerIds })` verifies active manager
  membership and recipient profiles in a transaction. It publishes one batch
  of 1–50 unique recipients with a seven-day server expiry. The Job stores
  `offerDistributionMode: FIRST_ACCEPT_WINS`, manager UID and offered timestamp.
  Each Offer stores the same mode, its own recipient, original invited
  schedule, and the Job's checklist context revision. The batch mode is
  immutable. Each still-open invitation can be revoked by a manager.
- The cleaner sees and accepts the offer in authenticated `/agenda`. The
  optional public link routes to the Hub. Its response contains only mode and
  language while open. Forwarding it grants no identity or service details.
  The invitation can be shared without sending anything from the application.
- `respondToMyOffer({ jobId, status: "ACCEPTED" })` derives the recipient from
  the active account, membership, cleaner profile and current session. It
  rechecks them and reads the authoritative Job, Offer, and active Assignments
  in a Firestore transaction. A pre-award context revision change, archive,
  expiry, revocation, multi-slot Job or existing roster prevents a new award.
  `DECLINED` only closes the recipient's invitation.
- The same commit creates the canonical Assignment, marks the winner's Offer
  `ACCEPTED`, sets the v2 Job roster and status `ASSIGNED`, advances checklist
  context, and records `firstAcceptClaim` and `offerDistributionClosedAt`.
  The Assignment stores the source Offer, method, accepting account and server
  time. An active winner's retry returns `assigned` without another write.
  Late competitors return `already-taken` while the invitation is in its
  validity window. The stored close marker survives roster correction.
- The manager's direct assignment transaction competes for that same single
  slot. To correct an active assignment before work starts, remove it using the
  existing roster action, then use direct assignment. The automatic batch stays
  closed. Rescheduling an unclaimed automatic Job invalidates the current
  batch. In V1 a fresh automatic batch requires a new eligible Job.
- The existing three agenda triggers re-derive the recipient-scoped projection
  transactionally. The winner appears under assigned Jobs and retains the same
  checklist path. Other pending invitees see a closed offer through the original
  validity window, with the original invitation schedule and no winner data.
  This projection is eventually consistent. Acceptance returns the actual
  transaction result, and the UI waits for it before showing confirmation.
- The same commit creates one existing `ASSIGNMENT_CONFIRMED` manager event.
  The existing at-most-once FCM dispatch policy applies. The Hub works without
  push. Automatic offers leave proposed compensation unset. Optional public
  links preserve that snapshot and expiry. Acceptance creates no payout or
  payment record.

## Source and verification

| Area | Review points |
|---|---|
| Functions | New `createAutomaticJobOffers`. Updated `respondToMyOffer`, `assignCleanerDirectly`, `publicOffer`, `syncCleanerAgendaOnJobWrite`, `syncCleanerAgendaOnAssignmentWrite`, and `syncCleanerAgendaOnOfferWrite`. |
| Rules | Job provenance and Assignment method are server-owned. Automatic browser Offer updates can only mint a token or revoke a still-pending invitation. Cleaner reads remain scoped to her agenda projection. |
| Manager UI | `JobWorkflowViews.jsx`, `JobDetail.jsx`, and the Job services/controller. Existing direct assignment, roster removal, manual Offer and checklist paths. |
| Cleaner UI | `CleanerHubApp.jsx`, `cleanerAgendaModel.js`, public Offer section of `App.jsx`, and localized copy. |
| State footprint | Additive fields on new automatic Jobs, Offers and Assignments. No backfill, indexes, Storage rules, billing, IAM or dependency updates. |

Run with Node 22, lock-matched root and Functions dependencies, Java 21, and
Playwright WebKit and Chromium. Use a synthetic `demo-cleanflow` project.

```sh
npm ci
npm --prefix functions ci
npm test
npm run test:security
npm run test:cleaner-hub:security
npm run test:cleaner-hub:e2e
CLEANER_HUB_BROWSER=chromium npm run test:cleaner-hub:e2e
node --test scripts/sandboxBuildGuards.test.mjs scripts/functionsRuntime.test.mjs scripts/prepareHosting.test.mjs
git diff --check
```

If an emulator port is occupied, use an isolated supported configuration and
leave the existing process alone. The Hub browser runner builds emulator Hosting
in `dist`. Run the exact-SHA local `hosting:prepare` after the last browser run
using the verified production Web build binding. The command produces a manifest
for review. Deployment is a separate operation.

## Release and rollback gates

1. Review the exact local commits, run manifest, tests, privacy boundaries and
   static diff. Recheck live Functions revisions, Rule identity and Hosting
   manifest before authorizing a release. Keep the unrelated Notification
   Reliability line separate.
2. Under explicit release approval, stage compatible Rules, then the named
   Functions. Verify existing public/manual behavior and three agenda triggers
   before activating the new manager callable. Publish the exact Hosting build
   only after the callable is healthy. Use metadata and read-only probes for
   Production verification until the owner separately authorizes an operational
   pilot Job and recipients.
3. Enable only through the unchecked per-Job opt-in. First run one manager and
   two already linked cleaners under the device protocol below. Observe one
   Assignment, both agenda outcomes, manager audit, and the winner's checklist.
   Record device outcomes separately from provider notification or emulator
   evidence. Stop creating batches on mismatch.
4. For rollback before any automatic records exist, restore the verified Hub
   Hosting/Rules baseline and the affected Functions from the release snapshot.
   Review cloud metadata before selecting each version. Preserve Cloud state and
   prior Hub access.
5. Once any automatic batch exists, stop new batches and retain the compatible
   Rules, public/Hub responders, direct assignment gate and agenda triggers.
   For a hard disable, prepare a narrowly reviewed release that hides the
   checkbox and disables the creation callable. Use a forward compatibility
   build for existing invites. If operations must stop pending work, a manager
   explicitly revokes remaining invitations or archives affected Jobs through
   normal controls. Keep committed Assignments, timestamps and event receipts.
   A blind rollback to the old Functions could re-enable public interest or
   widen the roster for automatic Jobs.

## Two-phone pilot and visual review

**Existing published Hub V1:** use two authorized test accounts and separate
private single-use codes. On iPhone add the agenda from Safari to the Home
Screen before redemption and redeem inside the installed app. On Android install
if offered, then redeem. Close and reopen. Confirm Today/Upcoming and Offers
are distinct and update without push. While open, briefly disconnect and
reconnect to review stale and last-confirmed messages. Verify expired-code and
revoked-access messaging only with approved disposable access. Open an eligible
checklist without submitting. The earlier “Reconnect notifications” image was a
visual simulation.

**Issue #86 after an authorized pilot release:** choose one eligible service and
two linked recipients. In separate phones, have both accept within the same
short window and reopen the Hub. Record the server-confirmed winner, unavailable
message on the other phone, one manager roster entry with method and timestamp,
and checklist entry for the winner. Test a repeated tap and a forwarded public
link with the two approved accounts. Record browser/OS, install mode, time and
outcome, using redacted evidence.

**Claude visual review:** use the existing components and styles. Review the
unchecked opt-in, manager assignment source and timestamp, awaiting/expired/
unavailable/revoke controls, public Hub CTA, and Hub pending/sending/confirmed/
taken/offline states. Check focus, screen reader status, contrast and long
Portuguese, English and Spanish strings on installed 360–390 px screens.
Keep the confirmed state tied to the server response. No visual dependency
blocks the local functional path.
