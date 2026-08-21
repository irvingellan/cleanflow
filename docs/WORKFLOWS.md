# CleanFlow — Initial Workflows

These workflows are conceptual and will evolve through real user observation.

## Domain boundary: reservation versus cleaning work

A Reservation records a guest stay received from a source such as Guesty or Hospitable. A Cleaning Job records the operational work CleanFlow schedules, offers, assigns, executes and completes.

A reservation may create or change the need for a cleaning, but reservation state is not the Job lifecycle. In particular, a future external reservation cancellation must be reconciled explicitly; it does not add `CANCELLED` to the first vertical-slice Job lifecycle.

## Job lifecycle

Initial conceptual lifecycle:

```text
UNASSIGNED
    ↓
OFFERED
    ↓
ASSIGNED
    ↓
IN_PROGRESS
    ↓
COMPLETED
```

`CONFIRMED` is not part of the initial lifecycle. It should be reintroduced only if future discovery identifies a real confirmation step after assignment.

Possible future states/transitions may include:

- CANCELLED
- REOPENED

These future states are not part of the first vertical slice.

Do not add unnecessary states until requirements justify them.

## Issue state

Issue state is separate from job lifecycle.

Example:

Job:
IN_PROGRESS

Issue:
OPEN

After intervention:

Job:
IN_PROGRESS

Issue:
RESOLVED

This avoids incorrectly changing a job from in_progress to issue.

## Cleaner availability / invite workflow

Initial hypothesis:

1. Manager creates or receives a job.
2. Manager manually selects which cleaners should receive the offer.
3. Invite is sent to the selected cleaners.
4. Each cleaner can respond:
   - interested (“Tenho interesse” in the interface)
   - declined (“Não posso” in the interface)
5. Manager sees responses in realtime.
6. Manager manually chooses one interested cleaner.
7. Manager assigns the job to the selected cleaner.
8. The selected invite remains interested; assignment is represented on the Job.
9. Selected cleaner receives an assignment notification.
10. Other open invitations become withdrawn as appropriate.

Do not implement “first cleaner wins” unless explicitly requested later.

Do not use `accepted` as a Job Invite status. Interest is a cleaner response; assignment is a manager action.

Cleaner interest is private from other cleaners. A cleaner should not see:

- which other cleaners were invited
- which other cleaners responded
- how many other cleaners expressed interest

The manager sees the responses and retains assignment control.

Automatic eligibility and cleaner recommendation rules are deferred until after the first vertical slice.

Authentication and authorization for cleaner mobile links remain intentionally open and must be decided before implementing the real flow.

## Property defaults applied to a cleaning

When a manager selects a known property for a Cleaning Job, CleanFlow should populate the reusable property information relevant to that operation:

- persistent instructions
- access information
- checklist
- supply requirements
- pricing defaults

The manager may apply job-specific changes. Those changes should not silently overwrite the Property, and later edits to Property defaults should not rewrite the historical record of completed work.

## Cleaner execution workflow

Potential flow:

1. Cleaner opens job.
2. Cleaner views the relevant property instructions and access information.
3. Cleaner views the checklist for this cleaning.
4. Cleaner starts job.
5. Cleaner executes checklist.
6. Cleaner uploads required photos.
7. Cleaner reports supplies if needed.
8. Cleaner reports issues if needed.
9. Cleaner completes job.

A typical cleaning may produce 30 or more photos. Upload design, progress feedback and recovery from interrupted uploads therefore matter to cleaner usability, even though photo implementation is outside the first vertical slice.

## Photo delivery workflow

Future conceptual flow:

Cleaner uploads required photos
→ photos remain associated with the Cleaning Job
→ manager reviews/completes the operational record as needed
→ photos are delivered to the relevant property owner/client
→ delivery is recorded

Photo storage and client delivery are separate concerns. Storing a photo does not by itself mean the owner/client received it.

## Administrative override workflow

Manager must not be trapped by the happy path.

Potential admin actions:

- change cleaner
- change scheduled time
- edit special instructions
- change compensation
- manually start
- manually complete
- create issue
- resolve issue
- resend reminder

Possible future actions, outside the first vertical slice:

- cancel job
- reopen job

Significant overrides should generate activity/audit events.

If possible, capture reason for important overrides.

## Example issue workflow

1. Job is IN_PROGRESS.
2. Cleaner reports an issue.
3. Issue document becomes OPEN.
4. Dashboard shows attention required.
5. Manager investigates/intervenes.
6. Manager adds resolution notes.
7. Manager resolves issue.
8. Job remains IN_PROGRESS unless its actual operational state changed.
9. Audit/activity records the intervention.

Confirmed issue categories include:

- access, key or code problems
- missing supplies
- broken or non-working items
- unusually heavy cleaning
- miscellaneous unexpected situations

Issue categories should help filtering and response without preventing a manager or cleaner from describing an unexpected situation that does not fit a predefined category.

## Realtime activity workflow

Dashboard may subscribe to recent activity for the current organization.

Potential event classes:

### Informational

- cleaner started
- photo uploaded
- job completed

### Important

- cleaner interested in unassigned job
- supply level low

### Action required

- job approaching date without cleaner
- open operational issue

### Urgent

Defined later based on real operational needs.

Do not make every activity event a disruptive notification.

## Reminder workflow

Potential future reminders:

- assignment notification
- one day before cleaning
- several hours before cleaning
- expected start time
- late/not started

Exact reminder behavior still requires discovery.

## Hourly job workflow

For hourly work:

- actual start time matters
- actual completion time matters
- total cleaner compensation may depend on elapsed approved time

Do not assume every job is hourly.

## Fixed-price job workflow

For fixed-price work:

- compensation is predetermined
- start/end may still be operationally useful
- elapsed time does not automatically define pay

## Client receivable workflow

Still under discovery.

Conceptually:

Jobs eligible for billing
→ invoice preparation
→ manager review
→ invoice sent
→ awaiting payment
→ paid / reconciled

Client-specific rules differ.

Invoice delivery and client payment are distinct dimensions:

- invoice: pending or sent
- client payment: pending or received

A sent invoice can still have pending payment. A received bank transfer may still need reconciliation to determine which invoice, jobs or period it covers.

## Cleaner payout workflow

Current real-world pattern:

- cleaners are paid weekly on Tuesday
- payment may happen even before client receivables have cleared

Conceptually:

Completed payable jobs
→ group by cleaner
→ calculate payout
→ review
→ pay
→ mark/record payment

Do not couple payout status to client invoice payment status.

Cleaner payout state must be explicit:

- pending
- paid

Financial views should expose relevant totals and profit using deterministic calculations from the underlying client charges, cleaner compensation, adjustments and payment records. Invoice generation and bank-transfer reconciliation remain future workflows.

## Historical operations workflow

The manager needs one cross-client history of Cleaning Jobs, with filters for:

- date range
- client
- cleaner
- property

This unified history preserves the operational visibility currently available only through Notion. Exact table, calendar and export behavior remains to be designed.

## Future reservation synchronization workflow

Guesty and Hospitable synchronization is important future work after the internal operational domain is stable.

Conceptually:

New external reservation
→ create or associate a Reservation
→ create or update the related Cleaning Job when appropriate

External reservation date change
→ update the Reservation
→ identify and explicitly reconcile any affected Cleaning Job schedule

External reservation cancellation
→ update the Reservation
→ identify and explicitly reconcile any affected Cleaning Job, invitations and assignment

Synchronization should be idempotent, preserve source references and audit meaningful changes. Detailed provider rules, conflict handling and cancellation behavior require further design and are not part of the first vertical slice.
