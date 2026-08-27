# CleanFlow — Domain Model

This document describes the conceptual business domain. It is intentionally provider-agnostic: domain concepts come first; Firestore structure is an implementation decision.

## Core distinctions

These entities must remain separate:

- **Organization** — one business using CleanFlow.
- **Client** — a customer that engages and pays the Organization.
- **Property** — a physical service location with reusable operational defaults.
- **Reservation** — an external or manually entered guest-stay/intake record.
- **Cleaning Job (Job)** — the unit of operational work that is scheduled, offered, assigned, executed and completed.
- **Cleaner / Worker** — a person eligible to perform Jobs.

A Reservation may create or change the need for a Job, but Reservation and Job are not the same record and do not share one lifecycle.

## Organization

Represents one tenant/business using CleanFlow, including the anonymized design-partner organization and future operators.

Conceptual fields:

- `id`
- `name`
- `timezone`
- `defaultLanguage`
- `status`
- `createdAt`

Operational records should be organization-aware to support future multi-tenant authorization.

## User

Represents an authenticated identity.

Potential roles:

- owner/admin
- manager
- supervisor
- cleaner/worker

Authentication identity and business profile may remain separate concepts.

## Client

Represents the business/customer responsible for service payment.

Conceptual fields:

- `id`
- `organizationId`
- `name`
- contact metadata
- billing preferences
- invoice schedule
- status

## Property

Represents a physical short-term-rental/service location.

Conceptual fields:

- `id`
- `organizationId`
- `clientId`
- `name`
- `address`
- pricing defaults
- parking instructions
- access instructions
- supply information
- checklist reference
- photo requirements
- operational notes
- active status

Sensitive access information requires stronger authorization than ordinary operational data.

Property defaults should populate new Jobs without silently rewriting historical Jobs when those defaults later change.

## Cleaner / Worker

Represents a worker available for operational assignment.

Conceptual fields:

- `id`
- `organizationId`
- `userId` when authenticated
- `name`
- `preferredLanguage`
- active status
- capability/preferences metadata
- internal operational notes

Subjective ranking/recommendation logic should not be encoded until product discovery supports reliable criteria.

## Reservation

Represents a guest stay or booking received from an external platform or manual intake.

Conceptual fields:

- `id`
- `organizationId`
- `clientId`
- `propertyId`
- `source`
- `externalReference`
- `sourceStatus`
- `checkInAt`
- `checkOutAt`
- `guestCount`
- `cancelledAt`
- `lastSyncedAt`
- timestamps

Provider-specific statuses must not be copied directly into the Job lifecycle.

## Cleaning Job

Represents one specific cleaning/turnover operation.

Conceptual fields:

- `id`
- `organizationId`
- `clientId`
- `propertyId`
- optional `reservationId`
- `scheduledDate`
- `scheduledStart`
- `assignedCleanerId`
- `operationalStatus`
- compensation type/value
- client price
- guest count
- special instructions
- actual start/completion timestamps
- source/external reference
- timestamps

Initial operational lifecycle:

`UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`

Job-effective instructions, checklist references and financial values must remain historically accurate even when Property defaults change later.

## Job Invite / Offer

Represents an offer of one Job to one Cleaner.

Conceptual fields:

- `id`
- `organizationId`
- `jobId`
- `cleanerId`
- `status`
- `sentAt`
- `respondedAt`

Initial statuses:

- `pending`
- `interested`
- `declined`
- `expired`
- `withdrawn`

`accepted` is intentionally not an Invite status. The Cleaner expresses interest; the manager performs assignment on the Job.

## Issue

Represents an exception/problem associated with a Job.

Conceptual fields:

- `id`
- `organizationId`
- `jobId`
- reporter/actor reference
- type
- severity
- description
- status
- resolution metadata
- timestamps

Issue lifecycle is separate from Job lifecycle. A Job may be `IN_PROGRESS` while an Issue is `OPEN`.

## Checklist Template & Checklist Run

A **Checklist Template** is reusable configuration, usually associated with a Property.

A **Checklist Run** captures execution for a specific Job so historical completion remains stable when templates evolve.

## Photo / Attachment

Represents metadata for an uploaded object. Binary content belongs in object storage rather than Firestore.

Important dimensions may include:

- Job association
- uploader
- storage path
- media type
- timestamps
- upload state
- delivery state

Uploading an image and delivering it to a client are different business events.

## Activity / Audit Event

Represents an important operational or administrative mutation.

Conceptual fields:

- `organizationId`
- actor type/id
- action
- entity type/id
- optional `jobId`
- timestamp
- source
- metadata

Examples include Job creation, offer response, assignment, start/completion, issue handling, administrative overrides and payment-state changes.

## Financial entities

### Invoice

Represents money owed by a Client. Invoice delivery state and payment state remain distinct.

### Client Payment / Reconciliation

Represents received money and the process of allocating it to invoices/Jobs. One transfer may cover multiple operational records.

### Cleaner Payout

Represents money paid or owed to a Cleaner for completed Jobs.

The implemented payout slice records completed payout records under:

`organizations/{organizationId}/payouts/{payoutId}`

A Job included in a payout receives payout linkage to prevent accidental duplicate payout inclusion.

Optional payment-proof images are stored in Firebase Storage, while Firestore keeps only metadata and storage references.

Client receivables and Cleaner payouts must remain separate financial concerns.

## Relationship overview

```text
Organization
 ├─ Clients
 │   └─ Properties
 │       ├─ Reservations
 │       └─ Jobs
 ├─ Cleaners
 └─ Financial records

Job
 ├─ Invites / Offers
 ├─ Assigned Cleaner
 ├─ Issues
 ├─ Checklist Run
 ├─ Photos / Attachments
 └─ Activity / Audit Events
```

## Persistence principles

Do not translate this domain diagram mechanically into nested Firestore collections.

Persistence design should account for:

- required queries;
- realtime listeners;
- authorization boundaries;
- cost;
- lifecycle and ownership;
- historical accuracy;
- index requirements;
- migration flexibility.

Some denormalization may be intentional when it improves queryability or preserves historical snapshots. Such decisions should be explicit in `docs/DECISIONS.md`.

## Privacy rule

Examples and fixtures in the public repository must be fictitious. Domain documentation should describe roles and workflow patterns, never personally identifying design-partner details, real property access data or payment credentials.
