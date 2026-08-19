# CleanFlow — Initial Workflows

These workflows are conceptual and will evolve through real user observation.

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

Automatic eligibility and cleaner recommendation rules are deferred until after the first vertical slice.

Authentication and authorization for cleaner mobile links remain intentionally open and must be decided before implementing the real flow.

## Cleaner execution workflow

Potential flow:

1. Cleaner opens job.
2. Cleaner views instructions.
3. Cleaner starts job.
4. Cleaner executes checklist.
5. Cleaner uploads required photos.
6. Cleaner reports supplies if needed.
7. Cleaner reports issues if needed.
8. Cleaner completes job.

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
