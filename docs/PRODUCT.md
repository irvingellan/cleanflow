# CleanFlow — Product Context

## Product thesis

CleanFlow is an operational coordination platform for cleaning businesses and
short-term-rental service operations. Its purpose is to move the manager from
being the human integration layer between messages, calendars, flexible
databases, properties, cleaners, reservation platforms, payments, invoices,
photos, checklists, and operational exceptions to having structured software
support that work.

The project is informed by an anonymized design partner. This repository
describes reusable workflow patterns, never private operational details.

## Target customer and problem

The initial customer profile is a small to medium cleaning operator or
short-term-rental cleaning operation coordinating multiple properties, clients,
and cleaners.

As an operation grows, the manager commonly becomes responsible for:

- scheduling and Job intake;
- finding and coordinating cleaners;
- reusable property instructions and operational evidence;
- exceptions, delays, and rescheduling;
- client billing and cleaner payouts;
- historical visibility and accountability.

When those activities are fragmented, the manager repeatedly copies context
between systems and becomes the bottleneck. CleanFlow's core value is less
manual messaging and copy/paste, fewer missed Jobs, clearer accountability,
searchable operational history, financial auditability, and more scalable
manager capacity.

## Current implementation and validated direction

**CURRENT:** the prototype supports a manager-facing operational workflow with
Properties, Clients, Cleaners, Jobs, offers, single-cleaner assignment,
execution states, issues, and a first payout record flow.

**VALIDATED REQUIREMENT:** the operational model must evolve beyond the current
singular-cleaner Job fields. A Job may require multiple cleaners, each with
their own work, approved hours, compensation, and payout state.

**PLANNED:** this evolution will be additive. Existing Jobs remain readable
while a per-cleaner Assignment model is introduced. Documentation must not be
read as claiming that this migration has already happened.

## Primary operational flow

```text
Reservation / manual intake
        ↓
Cleaning Job
        ↓
Manager selects cleaners to receive offers
        ↓
Cleaners express interest or decline
        ↓
Manager creates one or more assignments
        ↓
Assigned cleaners execute their work
        ↓
Each cleaner submits work / hours / evidence
        ↓
Manager QA and finalization
        ↓
Job completion
        ↓
Independent client-billing and cleaner-payout follow-up
```

The manager retains assignment control. Cleaner interest is a response to an
Offer, not an automatic assignment. A Job does not auto-complete merely because
the last cleaner reports that their work is finished.

## Reservation versus Cleaning Job

A **Reservation** is a guest stay or external booking fact. A **Cleaning Job**
is the operational work that CleanFlow schedules, offers, assigns, executes,
reviews, and completes.

Reservation-provider state must not become the Job lifecycle automatically. A
reservation date change or cancellation can require explicit Job reconciliation,
but it is not itself a Job state transition.

An optional guest name on a Job is a validated future requirement for
reservation and payment reconciliation. It should be treated as operationally
sensitive context, not broad list or public-link data.

## Cleaner coordination and team Jobs

CleanFlow must support a manager offering a Job to multiple cleaners and
choosing one or more cleaners to perform it. Offers and Assignments are
different concepts:

- an **Offer** records an invitation and a cleaner's interest or decline;
- an **Assignment** records the manager's explicit selection of a cleaner for
  the Job.

Cleaners must not see competing cleaners, their responses, their compensation,
or how many other cleaners received an Offer. Automatic matching or
recommendations may eventually assist the manager, but must not silently remove
manager control before eligibility rules are proven.

Cleaner availability and preferences are validated manager-maintained
information. Automatic eligibility, conflict detection, or recommendation logic
remains planned work.

## Job execution and QA

**CURRENT:** the initial implementation uses a Job lifecycle ending at
`COMPLETED` and singular assignment fields.

**VALIDATED REQUIREMENT:** cleaner execution and manager completion are
separate concepts. A future Job may enter `WAITING_FOR_QA` after all active
cleaner assignments have been submitted. The manager reviews the operational
record, approved hours, and compensation before finalizing the Job.

Photos, checklists, reference information, and issue reports are important
operational evidence. They are not interchangeable with lifecycle state: a Job
can be in progress while an Issue is open.

## Property defaults versus Job snapshots

Property information may include reusable access instructions, parking,
supplies, operational notes, checklist templates, reference photos, and default
pricing. Selecting a Property should populate relevant defaults for a new Job.

Job-effective instructions, pricing, checklists, and other operational values
must preserve historical truth. Editing a Property later must not rewrite what
applied to completed or previously scheduled work.

## Scheduling and rescheduling

Frequent rescheduling is a validated workflow. Future schedule changes must be
explicit and auditable, preserve Offer and Assignment context, and never
silently discard history. Reminder behavior must use the current approved
schedule rather than stale schedule data.

Advanced Job date filtering is also validated, including this week, custom date
ranges, and previous/next periods. The full Job history belongs in a dedicated
worklist rather than an unbounded dashboard report.

## Financial domain

Client invoicing, client payment, cleaner compensation, cleaner payout, and
profitability are separate concepts.

- A Job can have fixed or hourly client pricing.
- Each cleaner Assignment can independently have fixed or hourly compensation.
- Client-billable hours and cleaner-payable hours are separate business concepts.
- Cleaner pay can use approved hours, a calculated amount, or an explicit
  manager override; the final approved payable amount should be historically
  stable.
- A cleaner payout can occur before a client receivable clears.
- Invoice delivery state and client payment/reconciliation state must not be
  collapsed into one generic payment status.

**CURRENT:** a first manager payout-record flow exists for completed legacy
single-cleaner Jobs. Payment processing, client invoicing, reconciliation,
automated invoicing, and payroll automation are not implemented.

## Field-worker experience and privacy

Cleaner-facing experiences should remain mobile-first, low-friction,
browser/PWA-friendly, and accessible through secure links where appropriate.

Public or cleaner-facing payloads must never expose unrelated information such
as client charges, business profit, other cleaners' compensation, internal
notes, unrelated offers or assignments, or private financial state. Sensitive
property-access information requires its own carefully designed authorization
boundary.

## Reminders and integrations

Cleaners should not need to repeatedly inspect a calendar to discover new or
upcoming work. Assignment, upcoming-work, and weekly payroll reminders are
validated needs, but their cadence, delivery channel, time-zone behavior, and
idempotency rules remain planned work.

Guesty, Hospitable, messaging channels, and other platforms remain future
integrations. CleanFlow should first establish a stable internal operational
model capable of reconciling reservation changes rather than copying external
provider state into the Job lifecycle.

## Product expansion and business-model hypotheses

The immediate focus is a reliable operational wedge for cleaning and
short-term-rental service operators, not a generic enterprise platform.

**HYPOTHESES, not decisions:**

- a SaaS subscription may be organized by Organization;
- tiers may eventually reflect Jobs, cleaners, properties, automation, or
  integration needs;
- higher tiers may include automation or external integrations;
- onboarding or operational-data migration assistance may be valuable.

No pricing, revenue, market size, customer count, or monetization decision has
been validated in this repository.

## Internationalization and AI

CleanFlow is designed for multilingual operation. UI strings belong behind the
i18n layer; translation of user-generated content is a separate concern.

AI is not the default solution for deterministic lifecycle, permission, or
financial rules. Potential future uses include interpreting unstructured intake,
translation, summarization, and classification of ambiguous reports.

## Public-repository privacy rule

All committed fixtures must be fictitious. Documentation uses generic terms such
as **design partner**, **operations manager**, **client**, **property**,
**cleaner/worker**, and **organization**. It must never include real names,
addresses, access information, payment details, credentials, or private
conversations.
