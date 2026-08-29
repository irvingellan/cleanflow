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
Job records operational work: scheduling, Offers, Assignments, execution, QA,
and completion.

A reservation date change or cancellation may require a manager to reconcile a
related Job. It does not automatically impose an external status on the Job.

## Offer → interest → Assignment

**CURRENT:** a manager creates a Job, selects multiple cleaners, and creates
one Offer per cleaner. A cleaner can respond `INTERESTED` or `DECLINED`; the
manager retains assignment control.

**VALIDATED REQUIREMENT / PLANNED:** the manager may create one or more Cleaner
Assignments from interested Offers.

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

## Team Job execution

**CURRENT:** the prototype uses one legacy assigned-cleaner field and a Job
lifecycle that moves directly from `IN_PROGRESS` to `COMPLETED`.

**PLANNED:** a Job can have several active Assignments, each with its own work
state.

```text
Job ASSIGNED
→ one cleaner starts
→ Job IN_PROGRESS
→ each cleaner submits their work independently
→ all active Assignments submitted
→ Job WAITING_FOR_QA
→ manager approves/finalizes
→ Job COMPLETED
```

One cleaner submitting work does not finish the whole Job. A Job must not
auto-complete merely because the final Cleaner submits work.

## Job lifecycle

**CURRENT legacy lifecycle:**

```text
UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED
```

**PLANNED validated lifecycle:**

```text
UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → WAITING_FOR_QA → COMPLETED
```

`CONFIRMED`, `CANCELLED`, and `REOPENED` are not part of the currently planned
core lifecycle. They require separate discovery before addition.

## Assignment lifecycle

**PLANNED:**

```text
ASSIGNED → IN_PROGRESS → SUBMITTED → APPROVED
```

- `SUBMITTED` means the Cleaner has reported their work complete.
- `APPROVED` means the manager has approved the relevant work, hours, and
  compensation for QA/payment purposes.

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

**VALIDATED REQUIREMENT / PLANNED:**

```text
Manager changes Job schedule
→ prior schedule is recorded
→ Job schedule revision advances
→ existing Offers and Assignments remain historically intact
→ manager reviews any required reconfirmation/reminder action
```

The system must not silently delete an Offer, Assignment, or history because a
date changes.

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

A Job can remain `IN_PROGRESS` or `WAITING_FOR_QA` while an Issue is open.
Confirmed categories include access, supplies, broken item, heavy cleaning, and
other. Categories aid filtering but must not block descriptive reporting.

## Reminder concepts

**VALIDATED REQUIREMENT / PLANNED:** reminders may include:

- new Assignment notification;
- upcoming service reminder;
- expected-start reminder;
- late/not-started escalation;
- weekly payroll reminder.

Reminder delivery channel, timing, timezone behavior, retry policy, and
idempotency rules remain **OPEN QUESTIONS**. Reminders must use the current
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
