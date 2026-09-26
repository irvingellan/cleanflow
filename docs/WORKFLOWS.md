# CleanFlow — Operational Workflows

These workflows describe validated product semantics and planned evolution.
They are not a claim that every workflow is already implemented.

## Status legend

- **CURRENT** — behavior present in the prototype today.
- **VALIDATED REQUIREMENT** — confirmed operational need.
- **PLANNED** — intended workflow that requires design and implementation.
- **OPEN QUESTION** — behavior deliberately not invented yet.

## Reservation versus cleaning work

A Reservation records a guest stay from a provider or manual intake. A Cleaning
Job records operational work: scheduling, Offers, Assignments, execution,
evidence, and completion.

A reservation date change or cancellation may require a manager to reconcile a
related Job. It does not automatically impose an external status on the Job.

## Offer → interest → Assignment

**CURRENT:** a manager creates a Job, selects multiple cleaners, and creates
one Offer per cleaner. A cleaner can respond `INTERESTED` or `DECLINED`; the
manager retains assignment control.

**CURRENT transition:** an Assignment-aware Job may retain one or more explicit
manager-created Cleaner Assignments from interested Offers.

```text
Manager creates Job
→ Manager sends one or more Offers
→ Cleaner expresses interest or declines
→ Manager reviews private responses
→ Manager creates one or more Assignments
```

Interest never automatically assigns a Job. `accepted` is not an Offer status.
Cleaners must not see competing Offers, responses, assignment count, or another
cleaner's compensation.

**Current required cleaner count:** new Assignment-aware Jobs start with an
explicit `requiredCleanerCount` of `1`, with a bounded pilot maximum of `4`.
Missing values on existing Jobs read as `1`; no migration is required. Sending
Offers and receiving interest remains independent of this number, so interested
Offers remain unchanged when the team is full. An active manager may edit the
count only while a non-archived Job is `UNASSIGNED`, `OFFERED`, or `ASSIGNED`,
and cannot lower it below the current active Assignment count. Manager
Assignment, removal, replacement, count changes, and the Job start capacity
check use server transactions; direct browser roster/count/start writes are
denied. A full roster blocks further Assignments without changing other Offers.
The Job cannot enter `IN_PROGRESS` until it has at least the required number of
active Assignments. A legacy singular-cleaner Job reads as one and retains its
existing direct-cleaner compatibility path without a synthetic Assignment.

**CURRENT public Offer handoff:** before creating or replacing a pending
cleaner's public link, the manager confirms that cleaner's offered amount. The
amount is snapshotted on the Offer and is shown both on `/offer/:token` and in
the copyable manual WhatsApp message. If it remains blank, both show an explicit
“Amount not set / To be agreed” value. Only an older single-cleaner Offer with
no amount snapshot may fall back to its legacy Job payout; Assignment-aware Job
totals are not divided or treated as individual compensation. Interest/decline
and manager-controlled Assignment behavior are unchanged.

## Normal and team Job execution

**CURRENT:** most Jobs use one Cleaner. Legacy Jobs use one assigned-Cleaner
field and move directly from `IN_PROGRESS` to `COMPLETED`; Assignment-aware
Jobs retain a manager roster for exceptional team work.

**VALIDATED REQUIREMENT / PLANNED:** a team Job can have several active
Assignments, each with its own timing/work state.

```text
Job ASSIGNED
→ one cleaner starts
→ Job IN_PROGRESS
→ each Cleaner can finish independently
→ Job-level evidence/checklist may arrive later from one Cleaner
→ Job COMPLETED
```

One Cleaner finishing does not finish every other Assignment. Exact aggregate
completion for a future execution model remains to be validated; manager QA is
not a mandatory normal completion gate.

## Job lifecycle

**CURRENT legacy lifecycle:**

```text
UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED
```

## Checklist context revision

**CURRENT Phase 5A foundation:** a Job has a monotonic
`checklistContextRevision` used only to invalidate a future cleaner checklist
capability when its access context changes. Missing legacy values are treated as
`0`; no read backfills them.

```text
Property / schedule / archive state / cleaner roster changes
→ Job revision advances atomically once
→ a future stale cleaner capability must be rejected
```

The initial eligible execution set is `ASSIGNED` and `IN_PROGRESS`; moving
within that set does not advance the revision. Pricing, payout, payment, notes,
provenance, and checklist answers are outside this revision boundary.

## Checklist photo evidence

**CURRENT Phase 5D.1 pilot flow:** a cleaner holding an active capability may
take or choose one JPEG, PNG, or WebP image (up to 5 MB) for the frozen
`living-belongings` requirement while the Run is `DRAFT`. The Function derives
the private Storage location, then rechecks capability, Job, Run, and context
before recording server-owned metadata. Retrying identical bytes is safe; the
browser never receives a Storage path or durable download URL.

```text
DRAFT + active capability
→ private evidence saved for living-belongings
→ reload shows safe evidence metadata/image through the same capability
→ READY_FOR_REVIEW requires that evidence and becomes read-only
```

This is evidence collection only, not Assignment completion, email delivery,
or a generic photo system. After `READY_FOR_REVIEW`, an active manager may
explicitly approve the reviewed Run to complete its eligible Job; that manager
action does not mark payment or payout as paid.

## Client cleaning report

**CURRENT local implementation:** once the Checklist Run is
`READY_FOR_REVIEW`, an active manager can create a client report link, copy/open
the newly issued link, replace it, or revoke it. The single report capability
expires after seven days. The client opens a mobile-friendly, read-only page
without an account; the manager manually shares the link through their existing
communication channel.

The report is projected only from the Run's frozen Property/Job snapshots,
`resolvedDefinition`, the exact saved draft revision locked by
`READY_FOR_REVIEW`, and its saved required photo. It includes checklist labels
and answers, inventory answers, cleaner-entered issue/general notes, Property
name, service date, and saved evidence. It excludes access instructions/codes,
manager notes, client/cleaner private data, prices, payout, IDs, and capability
metadata. Public reads do not mutate the Job, Run, draft, evidence, or
capability. The report does not complete the Job or change payment state.

```text
Cleaner saves checklist, inventory, notes, and required photo
→ cleaner marks Run READY_FOR_REVIEW
→ manager reviews saved Run content
→ manager creates/copies a seven-day client report link
→ client opens a read-only report without an account
```

Automatic email/WhatsApp delivery, a client account/portal, PDF generation,
manager approval, and Job completion remain out of scope. The report-link
implementation is local until its release is separately approved and deployed.

**PLANNED:** future aggregate execution derivation must retain the distinction
between Job and Assignment state. Any `WAITING_FOR_QA` state is optional and
requires a focused validated workflow.

`CONFIRMED`, `CANCELLED`, and `REOPENED` are not part of the currently planned
core lifecycle. They require separate discovery before addition.

## Assignment execution

**VALIDATED REQUIREMENT / PLANNED:** a Cleaner Assignment will own its own
start, finish, and work duration. Future submission/approval states need a
separate financial/execution design.

**OPEN QUESTION:** the exact treatment of a removed, replaced, or late-added
Cleaner Assignment requires a dedicated manager override workflow.

## Pricing and hours

### Fixed-price example

A Job may charge the Client a fixed amount. Each Cleaner Assignment may also
have its own fixed compensation. A two-cleaner Job can therefore have one Client
charge and two independently payable Cleaner amounts.

### Hourly example

A Job may charge the Client an hourly rate using manager-approved
client-billable hours. Each Cleaner Assignment may have an hourly rate using
that Cleaner's manager-approved payable hours.

```text
Cleaner reports worked hours
→ manager reviews/approves hours
→ compensation is calculated
→ manager may apply an explicit override with a reason
→ approved payable amount becomes stable
```

Elapsed time does not automatically define pay. Client-billable hours and
Cleaner-payable hours are independent business concepts.

## Payout workflow

**CURRENT:** a manager can record a payout for an eligible completed legacy
single-cleaner Job. Payment proof is optional manager-only evidence.

**PLANNED:** payouts become Assignment-aware:

```text
Completed and approved Assignment
→ unpaid Cleaner worklist
→ manager reviews selected Assignment items
→ payout record is created
→ selected Assignments are marked paid atomically
```

One Cleaner Assignment must never be included in two payouts. Payout state is
independent from whether the Client has paid an invoice.

## Client invoicing and payment

**PLANNED:**

```text
Eligible completed Jobs
→ invoice preparation
→ manager review
→ invoice sent
→ awaiting payment
→ payment received / reconciled
```

An Invoice may include multiple Jobs. Invoice delivery state and client payment
state are separate. A cleaner payout may occur before corresponding Client money
is received.

PDF generation, email/WhatsApp delivery, bank-transfer reconciliation, and
payment processing are not currently implemented.

## Rescheduling workflow

**VALIDATED REQUIREMENT / CURRENTLY IMPLEMENTED ON AN ISOLATED FEATURE BRANCH
(NOT MERGED OR DEPLOYED):**

```text
Manager changes Job schedule
→ prior schedule is recorded
→ Job schedule revision and checklist context revision advance atomically
→ existing Offers and Assignments remain historically intact
→ Job worklists and reminder calculations use the current Job schedule
→ manager is warned that manually sent external messages may be stale
```

The system must not silently delete an Offer, Assignment, or history because a
date changes. Only non-archived `UNASSIGNED`, `OFFERED`, and `ASSIGNED` Jobs
can be rescheduled. In-progress/completed/archived Jobs are locked. If the
initial Checklist Run exists, rescheduling is locked so its frozen schedule
snapshot and capability context cannot become inconsistent. Browser clients
cannot update schedule fields directly; a manager-authorized callable writes
the Job and its `scheduleHistory` record in one transaction.

**OPEN QUESTION:** whether changed schedules automatically require cleaner
reconfirmation, withdraw pending Offers, or send a reminder is not yet decided.

## Property defaults and Job snapshots

When a manager selects a Property, CleanFlow can populate reusable instructions,
access information, parking, supply requirements, checklist references, photos,
and default pricing.

Job-specific changes do not silently overwrite the Property. Later Property
edits do not rewrite what applied to historical work.

## Cleaner-facing workflow and privacy

Cleaner experience remains mobile-first, browser/PWA-friendly, and low friction.
Potential actions include responding to an Offer, viewing assigned work,
starting work, submitting evidence/hours, reporting an Issue, and submitting
completion.

Public or cleaner-facing views show only action-relevant information. They must
not expose client charges, profit, other cleaner compensation, internal notes,
unrelated Offers/Assignments, or private financial state.

## Issue workflow

Issues are separate from Job lifecycle:

```text
Cleaner reports Issue
→ Issue becomes OPEN
→ manager reviews/intervenes
→ manager resolves Issue explicitly
```

A Job can remain `IN_PROGRESS` while an Issue is open. A rare callback after
completion should be an explicit Issue/callback concept, not a normal lifecycle
rollback.
Confirmed categories include access, supplies, broken item, heavy cleaning, and
other. Categories aid filtering but must not block descriptive reporting.

## Reminders

**CURRENT DESIGN-PARTNER PILOT:** a manager may copy a cleaner-safe message and paste it
manually into WhatsApp. Manager push summaries run at 19:00 America/Los_Angeles
for tomorrow's Jobs and 07:00 America/Los_Angeles for today's Jobs. They contain
counts only, use the current Job schedule, skip archived/non-operational Jobs,
and send no push when the target date has no operational Jobs.

**VALIDATED REQUIREMENT / PLANNED:** later reminders may include:

- new Assignment notification;
- upcoming service reminder;
- expected-start reminder;
- late/not-started escalation;
- weekly payroll reminder.

Cleaner reminder delivery channel, timing, timezone behavior, retry policy, and
user controls remain **OPEN QUESTIONS**. Manager planning/execution summaries
use a durable at-most-once delivery claim; reminders must use the current
schedule revision and must not duplicate payment or operational actions.

## Historical operations workflow

Managers need one cross-client operational history with date range, Client,
Cleaner, Property, status, and financial-state filters. The dashboard should
remain bounded and action-oriented; the Jobs worklist holds deeper history.

Financial filters must distinguish at least:

- unpaid to Cleaner;
- unpaid by Client.

They must not be represented by one generic payment status.

## Future reservation synchronization

Guesty, Hospitable, and related synchronization remain future work after the
internal Job/Assignment model is stable.

```text
New external reservation
→ create or associate Reservation
→ create or reconcile related Job

External schedule change
→ update Reservation fact
→ explicitly reconcile Job schedule

External cancellation
→ update Reservation fact
→ explicitly review related Job, Offers, and Assignments
```

Synchronization must be idempotent, preserve external references, and audit
meaningful changes.
