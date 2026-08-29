# CleanFlow — Domain Model

This document describes CleanFlow's conceptual business domain. It is
provider-agnostic: the concepts and invariants come first; Firestore paths,
indexes, and service APIs are implementation decisions.

Labels in this document distinguish **CURRENT** implementation behavior from
**VALIDATED REQUIREMENT** and **PLANNED** domain evolution.

## Core distinctions

These entities remain separate:

- **Organization** — one operating business using CleanFlow.
- **Client** — the customer that engages and pays the Organization.
- **Property** — a service location with reusable operational defaults.
- **Reservation** — an external or manual guest-stay/intake record.
- **Cleaning Job (Job)** — the operational aggregate for one service event.
- **Offer** — an invitation to one Cleaner, including their response.
- **Assignment** — the manager's selection of one Cleaner to perform work on a
  Job.
- **Cleaner / Worker** — a person eligible for operational assignments.
- **Issue** — an operational exception separate from Job lifecycle.
- **Invoice / Client Payment** — money owed by or received from a Client.
- **Cleaner Payout** — money paid or owed to a Cleaner for approved work.

A Reservation can create or alter the need for a Job, but Reservation and Job
do not share a lifecycle. An Offer can lead to an Assignment, but interest is
never assignment by itself.

## Organization and roles

An Organization represents one operating business. Records should remain
organization-aware so CleanFlow can evolve from the initial design-partner focus
without treating it as a permanent single tenant.

Potential roles include owner/admin, manager, supervisor, and cleaner. The
exact authorization model remains **PLANNED**; authentication identity and a
business profile may remain separate.

## Client

A Client is the business/customer responsible for service payment.

Conceptual fields include:

- identity and Organization relationship;
- name and permitted contact metadata;
- billing preferences and invoice schedule;
- active/status information.

New Jobs should eventually retain canonical `clientId` where available, plus a
historical client-name snapshot for display. **CURRENT:** legacy Properties and
Jobs can still be name-based; migration must preserve them safely.

## Property

A Property is a physical service location with reusable defaults. It may have:

- Client relationship;
- name/address as authorized operational data;
- access, parking, and supply information;
- checklist and reference-photo configuration;
- default client pricing and cleaner-compensation guidance;
- operational notes and active status.

Property defaults populate a new Job but must not rewrite historical Job
snapshots. Sensitive access information requires stronger authorization than
ordinary operational data.

## Reservation

A Reservation represents a guest stay or booking received from an external
provider or manual intake.

Conceptual fields include Organization, Client, and Property references;
provider/source reference; check-in/check-out; guest count; cancellation and
sync metadata.

Provider-specific statuses must not be copied into the Job lifecycle.

## Cleaning Job

A Job is the operational aggregate for one cleaning/turnover event. It owns
schedule, operational lifecycle, Job-effective snapshots, Offer/Assignment
relationships, issues, evidence, and client-billing eligibility.

Conceptual fields include:

- identity, Organization, Client, Property, and optional Reservation reference;
- property/client snapshots and optional `guestName`;
- scheduled date/time, timezone, current schedule revision, and audit history;
- overall operational status;
- Job-effective instructions, checklist/evidence references, and notes;
- client pricing model and resolved client charge;
- assignment summary suitable for manager queries;
- client-invoice linkage when invoiced;
- actual start, QA-ready, completion, and audit timestamps.

### Job lifecycle

**CURRENT legacy implementation:**

```text
UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED
```

**VALIDATED REQUIREMENT / PLANNED evolution:**

```text
UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → WAITING_FOR_QA → COMPLETED
```

The Job is not a proxy for any one cleaner's work. `WAITING_FOR_QA` represents
the point at which all active Assignment work is submitted and manager review
is required before final operational completion.

## Cleaner Assignment

An Assignment represents one Cleaner's operational and financial participation
in one Job. A Job may have zero, one, or multiple active Assignments.

Conceptual fields include:

- Job, Organization, and Cleaner references;
- cleaner-name snapshot and optional source Offer reference;
- assignment lifecycle and per-cleaner timestamps;
- fixed or hourly compensation configuration;
- worked hours and manager-approved hours;
- calculated amount, optional override, and immutable approved payable amount;
- payout status/linkage;
- minimal Job/schedule projections when needed for worker-history or payout
  queries.

### Assignment lifecycle

```text
ASSIGNED → IN_PROGRESS → SUBMITTED → APPROVED
```

`SUBMITTED` means the Cleaner says their part of the work is finished.
`APPROVED` means the manager has approved the work/hours/compensation relevant
to payment. A future explicit removal/reassignment state may be needed, but is
an **OPEN QUESTION**, not a current lifecycle rule.

## Offers

An Offer represents an invitation to one Cleaner. Its response is private from
other cleaners.

Conceptual statuses:

- pending;
- interested;
- declined;
- expired;
- withdrawn.

`accepted` is intentionally not an Offer status. The Cleaner expresses
interest; the manager creates one or more Assignments.

For future individual compensation, an Offer may carry only the safe proposed
compensation relevant to its recipient. It must not expose client charges,
profit, other cleaner compensation, internal notes, or competing Offers.

## Pricing, hours, and compensation

### Client pricing

A Job may be priced as:

- **FIXED** — predetermined client charge;
- **HOURLY** — rate multiplied by manager-approved client-billable hours;
- **OVERRIDE** — explicit manager-approved final charge when required.

### Cleaner compensation

Each Assignment may independently be:

- fixed compensation;
- hourly compensation using approved payable hours;
- manually overridden by a manager with an audit reason.

Client-billable hours and cleaner-payable hours are separate concepts. The
model must not assume that elapsed Job time, total team labor, or client billing
hours are interchangeable.

The resolved payable amount should become historically stable once approved.
Money representation, rounding, and currency policy remain implementation
details that require an explicit decision before financial migration.

## QA, evidence, and issues

Cleaner submission, manager QA, and Job completion are separate business
events. Checklists, photos, and reference information are operational evidence;
they do not automatically prove manager approval.

An Issue remains independent from lifecycle. A Job can be `IN_PROGRESS` or
`WAITING_FOR_QA` while an Issue is `OPEN`.

## Scheduling and reschedule history

Frequent schedule changes are a validated workflow. A reschedule should retain:

- previous and new schedule values;
- schedule revision;
- actor, timestamp, and optional reason;
- Offer and Assignment context rather than deleting or overwriting it.

Whether a reschedule requires a cleaner to reconfirm, withdraws a pending Offer,
or triggers a reminder is an **OPEN QUESTION**. The audit model must support
those later choices.

## Cleaner availability and preferences

Cleaner records may hold manager-maintained availability/preferences, capability
metadata, language, and limited internal operational notes. They must not become
an excessive personal-data profile.

Automatic matching, ranking, or recommendations are **PLANNED** only after
eligibility rules, scheduling policy, and authorization boundaries are proven.

## Financial entities

### Cleaner Payout

A Cleaner Payout records money paid or owed to a Cleaner for approved
Assignments. It is separate from client invoicing and client payment.

**CURRENT legacy implementation:** payout records group completed,
single-cleaner Jobs and mark the Job with payout linkage to avoid duplicate
payment.

**PLANNED:** payouts become Assignment-aware so one Job can contribute payable
work to more than one Cleaner while each Assignment can be paid exactly once.
Payment proof remains optional evidence, not payment processing.

### Invoice

An Invoice is a financial aggregate representing money owed by a Client. It may
contain multiple Job line items and has its own delivery state.

### Client Payment / Reconciliation

Client payment records represent received money and reconciliation to invoices.
Invoice delivery and payment state remain separate: a sent invoice can be
unpaid, and a received transfer may require reconciliation.

## Historical snapshots and migration

Historical correctness is more important than silently normalizing old records.
Canonical IDs and current live names can improve navigation/display, while
snapshots preserve what was operationally or financially true at the time.

**CURRENT legacy fields** such as `assignedCleanerId`, `assignedCleanerName`,
`cleanerPayout`, `payoutId`, and `payoutPaidAt` remain readable during an
additive migration. New Assignment-based behavior must provide safe fallbacks
for records that do not yet have Assignment entities.

## Relationship overview

```text
Organization
 ├─ Clients
 │   └─ Properties
 │       ├─ Reservations
 │       └─ Jobs
 ├─ Cleaners
 └─ Financial records
     ├─ Invoices / Client Payments
     └─ Cleaner Payouts

Job
 ├─ Offers
 ├─ Assignments
 ├─ Issues
 ├─ Checklist Runs
 ├─ Photos / Attachments
 ├─ Schedule-change history
 └─ Activity / Audit Events
```

## Persistence and privacy principles

Do not mechanically translate this diagram into one persistence layout. Storage
design must consider required queries, authorization, cost, lifecycle,
historical accuracy, indexes, and migration flexibility.

Intentional denormalization is acceptable when it improves queryability or
preserves historical snapshots, but the authoritative source and update rules
must be explicit.

Public-repository examples and fixtures must be fictitious. Public/cleaner
payloads must be minimized and must never expose unrelated financial,
operational, or private property information.
