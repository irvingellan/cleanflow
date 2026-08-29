# CleanFlow — Business Rules

This document is the concise source of truth for stable business rules. It
uses **CURRENT**, **PLANNED**, and **OPEN QUESTION** labels so implementation
status is not confused with validated product direction.

## Documentation hierarchy

- **BUSINESS_RULES.md** defines normative business semantics.
- **DATA_MODEL.md** describes conceptual domain representation.
- **WORKFLOWS.md** describes sequence and state flows.
- **DECISIONS.md** records rationale plus accepted and open decisions.
- **ROADMAP.md** sequences implementation work.

## Organizations and roles

- An Organization represents one operating business.
- Operational and financial records belong to an Organization.
- **PLANNED:** roles may include owner/admin, manager, supervisor, and Cleaner.
- **CURRENT:** development authorization is not yet the final multi-role model.

## Clients and Properties

- A Client is the party responsible for service payment.
- A Property belongs to an Organization and should reference its Client when a
  canonical Client record exists.
- Property defaults may populate new Jobs; later Property edits must not rewrite
  historical Job-effective values.
- **CURRENT legacy compatibility:** Client names and Property snapshots remain
  readable where canonical IDs are absent.

## Jobs

- A Job is one operational service event, not a Reservation.
- **CURRENT:** a legacy Job owns its overall schedule, operational lifecycle,
  Job-effective snapshots, evidence, and Issues.
- **PLANNED TARGET MODEL:** a Job may have zero, one, or many Cleaner
  Assignments and can own billing eligibility.
- **VALIDATED REQUIREMENT / PLANNED:** an optional guest name is Job-specific
  operational context and is not public cleaner-link data by default.

## Offers

- An Offer is an invitation to one Cleaner.
- Allowed Cleaner responses are `PENDING`, `INTERESTED`, and `DECLINED` in the
  current workflow; expiry/withdrawal are future supported concepts.
- `INTERESTED` means only that the Cleaner expressed interest.
- Interest never automatically creates an Assignment.
- Offers and competing Cleaner responses are private from other cleaners.

## Assignments — planned target model

- **CURRENT legacy implementation:** a Job stores one optional assigned Cleaner
  directly on the Job record.
- **PLANNED:** an Assignment is the manager's explicit selection of one Cleaner
  for one Job; one Job can have multiple active Assignments.
- **PLANNED:** each Assignment independently owns its execution state, worked
  hours, approved hours, compensation, and payout state.
- **PLANNED:** canonical Cleaner IDs identify the participant; name snapshots
  preserve historical context.

## Team Jobs — planned target model

- **PLANNED:** a Job may require multiple cleaners.
- **PLANNED:** starting or submitting one Assignment does not, by itself, start
  or complete every other Assignment.
- **PLANNED:** future Assignment changes must be explicit manager actions.
- **OPEN QUESTION:** the exact add, remove, replace, and reassignment policy
  must be decided before implementation.

## Job lifecycle

- **CURRENT legacy lifecycle:**
  `UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`.
- **PLANNED lifecycle:**
  `UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → WAITING_FOR_QA → COMPLETED`.
- Job lifecycle is separate from Issue state and Assignment lifecycle.
- A Job must not auto-complete merely because a Cleaner submits work.

## Assignment lifecycle

- **PLANNED lifecycle:**
  `ASSIGNED → IN_PROGRESS → SUBMITTED → APPROVED`.
- `SUBMITTED` is Cleaner-reported completion of that Assignment's work.
- `APPROVED` is manager approval of the work/hours/compensation relevant to QA
  and payout.

## Pricing — planned target model

- **PLANNED:** Job client pricing may be fixed or hourly.
- **PLANNED:** Cleaner Assignment compensation may independently be fixed or
  hourly.
- **PLANNED:** Client charges, Cleaner compensation, Client payment, and
  Cleaner payout are separate concerns.
- **PLANNED:** a final approved amount is historically stable; later default-
  price changes do not rewrite it.

## Hours — planned target model

- **PLANNED:** worked hours are tracked per Cleaner Assignment, not inferred
  globally from a Job timestamp.
- **PLANNED:** approved hours are a manager decision and may differ from
  reported hours.
- **PLANNED:** Client-billable hours and Cleaner-payable hours are separate
  concepts.
- **OPEN QUESTION:** the client-billable-hour basis for multi-cleaner hourly
  Jobs requires an explicit policy.

## QA and completion

- **PLANNED:** Cleaner submission and manager completion are separate events.
- **PLANNED:** a Job enters `WAITING_FOR_QA` when all active Assignments have
  been `SUBMITTED`.
- **PLANNED:** manager review and approval occur after `WAITING_FOR_QA`; manager
  finalization then moves the Job to `COMPLETED`.
- **OPEN QUESTION:** exceptional completion behavior remains undecided.

## Cleaner payouts

- **CURRENT:** legacy payouts are Job-level and single-cleaner compatible.
- **PLANNED:** a payout covers approved, unpaid Cleaner work, and one payable
  Assignment must not be included in two payouts.
- **PLANNED:** a payout may occur before Client payment is received.
- **PLANNED TARGET MODEL:** new payouts are Assignment-aware.

## Client invoicing and payments

- **VALIDATED REQUIREMENT / PLANNED:** an Invoice represents money owed by a
  Client and may include multiple Jobs.
- **PLANNED:** invoice delivery state and Client payment/reconciliation state
  are separate.
- **PLANNED:** a sent invoice can remain unpaid.
- **PLANNED:** Client payment state must never be collapsed into Cleaner payout
  state.
- **PLANNED:** invoice generation, delivery, payment allocation, and bank
  reconciliation require dedicated workflows.

## Rescheduling

- **VALIDATED REQUIREMENT / PLANNED:** a reschedule is an auditable operational
  change.
- **PLANNED:** it must preserve prior schedule, new schedule, revision, actor,
  timestamp, and optional reason.
- **PLANNED:** a reschedule must not silently discard Offers, Assignments, or
  history.
- **OPEN QUESTION:** reconfirmation and reminder behavior after a schedule
  revision requires explicit policy.

## Property defaults versus Job snapshots

- Reusable Property instructions, checklists, reference photos, access context,
  supply information, and pricing defaults can populate a Job.
- Job-effective snapshots preserve historical truth.
- Editing a Property later does not rewrite prior Jobs.

## Cleaner visibility and privacy

- Cleaner-facing experiences are mobile-first and action-focused.
- A Cleaner must not see competing cleaners, other Offers, other Assignments,
  other compensation, client charges, profit, internal notes, or unrelated
  financial state.
- Public links never grant anonymous direct Firestore access.
- Sensitive property access information requires stronger authorization than
  ordinary operational metadata.

## Issues

- Issues are separate from Job lifecycle.
- An open Issue does not silently change Job status.
- Resolution is an explicit manager action with preserved history.

## Reminders

- Cleaners should not have to repeatedly inspect a calendar to find work.
- Potential reminders include new Assignment, upcoming Job, expected-start,
  late/not-started, and weekly payroll reminders.
- **OPEN QUESTION:** delivery channel, cadence, time zone, opt-in/control,
  retry, and idempotency policies remain undecided.

## Historical and audit rules

- **VALIDATED REQUIREMENT / PLANNED:** important manager overrides, state
  transitions, reschedules, approvals, and financial mutations must be
  auditable.
- Historical snapshots are preserved; canonical IDs improve current navigation
  and relationship integrity.
- Legacy records remain readable through additive compatibility behavior rather
  than destructive bulk rewriting.
