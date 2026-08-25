# CleanFlow — Initial Domain Model

This document describes conceptual domain entities.

It is NOT yet a final Firestore schema.

We first model the business domain, then determine the best persistence structure.

## Core business distinctions

These concepts must remain distinct:

- **Client** — the business/customer that engages and pays the cleaning operation.
- **Property** — the physical location with reusable operational information and defaults.
- **Reservation** — a guest stay, usually originating in an external reservation platform.
- **Cleaning Job (Job)** — the specific unit of cleaning work that is scheduled, offered, assigned, executed and completed.

A Client may be associated with multiple Properties. A Property may have multiple Reservations over time and multiple Cleaning Jobs over time. A Reservation may create or change the need for a Cleaning Job, but the Reservation and Job are not the same record and do not share one lifecycle.

## Organization

Represents one business using CleanFlow.

Examples:

- Gabriela's operation
- future cleaning company
- future STR operator

CleanFlow should eventually be multi-tenant.

Most operational records should be associated with an organization.

Conceptual fields:

- id
- name
- timezone
- defaultLanguage
- createdAt
- status

## User

Represents a person authenticated in CleanFlow.

Potential roles:

- owner/admin
- manager
- supervisor
- cleaner/worker

Authentication identity and business profile may eventually be separate concepts.

## Client

Represents the business/customer that pays for cleaning services.

A client may own or manage multiple properties.

Conceptual fields:

- id
- organizationId
- name
- contact information
- billing preferences
- payment method
- invoice schedule
- status

## Property

Represents a physical short-term-rental property.

A property belongs to / is associated with a client.

Conceptual fields:

- id
- organizationId
- clientId
- name
- address
- defaultClientPrice
- access instructions
- parking instructions
- lockbox details
- supply location
- supply requirements
- default checklist reference
- standard photo requirements
- pricing defaults
- operational notes
- active status

Sensitive property-access data may require special permission handling.

Selecting a Property for a new Job should populate these reusable values. Job-specific values should preserve what applied to that operation so later Property edits do not silently change completed-job history. The exact snapshot/version strategy remains an implementation decision.

## Cleaner

Represents a worker available for cleaning assignments.

Conceptual fields:

- id
- organizationId
- userId if authenticated
- name
- phone
- preferredLanguage
- active
- experience level
- quality / internal rating if used
- preferred areas
- worksWithPartner
- heavyCleaningCapability
- notes

Avoid prematurely encoding subjective ranking logic until discovery supports it.

## Reservation

Represents a guest stay or booking received from an external platform or entered manually.

A Reservation is an intake/source record, not the operational Cleaning Job. New reservations, date changes and cancellations may affect cleaning work and must eventually be reconciled explicitly.

Conceptual fields:

- id
- organizationId
- clientId
- propertyId
- source
- externalReference
- sourceStatus
- checkInAt
- checkOutAt
- guestCount
- cancelledAt if applicable
- lastSyncedAt if applicable
- createdAt
- updatedAt

Possible source examples:

- manual
- Hospitable
- Guesty
- future integration

Provider-specific statuses should not be copied blindly into the Job lifecycle.

## Job

Represents one specific cleaning/turnover.

A Job references a Property and may reference the Reservation that created or affected the need for cleaning. A manually created Job may have no Reservation.

Conceptual fields:

- id
- organizationId
- clientId
- propertyId
- reservationId if applicable
- scheduledDate
- scheduledStart
- assignedCleanerId
- operationalStatus
- compensationType
- cleanerRate / cleanerFixedPay
- clientPrice
- guestCount
- specialInstructions
- actualStartedAt
- completedAt
- createdAt
- source
- externalReference

The Job should retain the effective instructions, checklist association and pricing/compensation values used for that operation, whether through snapshots, version references or another documented strategy. This protects historical accuracy when Property defaults change later.

Possible source examples:

- manual
- WhatsApp intake
- Hospitable
- Guesty
- future integration

Initial operational statuses:

- UNASSIGNED
- OFFERED
- ASSIGNED
- IN_PROGRESS
- COMPLETED

`CONFIRMED` is not part of the initial lifecycle. It should be reintroduced only if future discovery identifies a real confirmation step after assignment.

`CANCELLED` and `REOPENED` remain possible future states and are not part of the first vertical slice.

## Job Invite

Represents an offer of a particular job to a cleaner.

Do not model cleaner interest as a property of the cleaner itself.

For the first vertical slice, the manager manually selects which cleaners receive an invite. Automatic eligibility and recommendation rules are deferred.

Conceptual fields:

- id
- organizationId
- jobId
- cleanerId
- status
- sentAt
- respondedAt

Initial statuses:

- pending
- interested
- declined
- expired
- withdrawn

`accepted` is not a Job Invite status. A cleaner expresses interest; the manager assigns the job. Assignment is represented on the Job, not by adding another Job Invite status.

In the interface, `interested` may appear as “Tenho interesse” and `declined` as “Não posso”.

Authentication and authorization for cleaner mobile links remain intentionally open and must be decided before implementing the real flow.

## Issue

Represents an exception/problem related to a job.

Important:

An issue should not normally replace the job's operational lifecycle status.

Example:

Job:

- operationalStatus = IN_PROGRESS

Issue:

- status = OPEN

Conceptual fields:

- id
- organizationId
- jobId
- reportedBy
- type
- severity
- description
- status
- createdAt
- resolvedAt
- resolvedBy
- resolutionNotes

Possible issue statuses:

- open
- resolved

Confirmed issue type categories include:

- access/key/code
- missing supplies
- broken/non-working item
- unusually heavy cleaning
- miscellaneous/unexpected

The model should allow descriptive details and should not require every unexpected situation to fit a narrow predefined category.

## Checklist Template

Represents a reusable checklist.

May be associated with a property.

Conceptual fields:

- id
- organizationId
- propertyId
- name
- items
- version
- active

## Checklist Run / Job Checklist

Represents checklist execution for a specific job.

This preserves historical completion even if the property template changes later.

Conceptual fields:

- id
- organizationId
- jobId
- checklistTemplateId
- item states
- completedAt

## Photo / Attachment

Represents metadata about an uploaded file.

The binary should live in object storage, not directly in Firestore.

A cleaning commonly produces 30 or more photos. Photo records must support job-level organization and eventual delivery to the relevant property owner/client. Upload completion and client delivery are different states.

Conceptual fields:

- id
- organizationId
- jobId
- cleanerId / uploadedBy
- storagePath
- type
- createdAt
- metadata
- deliveryStatus if applicable
- deliveredAt if applicable
- deliveryReference if applicable

## Activity / Audit Event

Represents an important operational or administrative event.

This may serve both user-facing realtime activity and system audit requirements, although these concerns may later need separation.

Conceptual fields:

- id
- organizationId
- actorType
- actorId
- action
- entityType
- entityId
- jobId if relevant
- timestamp
- source
- metadata

Example events:

- job_created
- invite_sent
- invite_interested
- cleaner_assigned
- job_started
- issue_reported
- issue_resolved
- photo_uploaded
- job_completed
- admin_override
- payment_marked_paid

## Invoice

Represents money owed by a client.

Conceptual fields:

- id
- organizationId
- clientId
- period
- deliveryStatus
- paymentStatus
- lineItems
- subtotal
- adjustments
- total
- issuedAt
- sentAt
- dueAt
- paidAt

Conceptual invoice delivery states:

- pending
- sent

Conceptual client payment states:

- pending
- received

Invoice delivery and client payment must not be collapsed into one status. A sent invoice may still be unpaid, and a received payment may require reconciliation before it can be allocated confidently.

Do not implement invoice rules until billing workflows are better observed.

## Client Payment / Reconciliation Record

Represents money received from a client or payment channel and the work required to reconcile that money.

This is distinct from an Invoice because a bank transfer may cover multiple jobs, invoices or periods.

Conceptual fields:

- id
- organizationId
- clientId
- amount
- receivedAt
- paymentMethod
- externalReference
- reconciliationStatus
- invoice/job allocation references
- notes

Exact reconciliation states and allocation rules require further discovery. Automated bank-transfer reconciliation is an important future capability, not part of the first vertical slice.

## Cleaner Payout

Represents money owed to a cleaner.

Conceptual fields:

- id
- organizationId
- cleanerId
- period
- job references / line items
- amount
- status
- paidAt
- paymentMethod

Conceptual payout states:

- pending
- paid

### Phase 1 implementation

The first payout slice records only completed payments at:

`organizations/{organizationId}/payouts/{payoutId}`

Each `PAID` record includes the Cleaner ID and name snapshot, the included Job IDs,
amount, payment method, optional payment-contact snapshot and note, plus `createdAt`
and `paidAt`. The same transaction writes `payoutId` and `payoutPaidAt` to every
included Job. This keeps the payout record as the payment history while preventing a
Job from being included in a second payout.

### Phase 2 payment proof

One optional payment-proof image can be attached after a `PAID` payout exists. The payout
document stores only `proofStoragePath`, `proofFileName`, `proofContentType`,
`proofSizeBytes` and `proofUploadedAt`; the image binary lives at
`organizations/{organizationId}/payouts/{payoutId}/proof/payment-proof` in Firebase Storage.

The payout transaction remains the financial source of truth. A proof upload failure does not
undo or duplicate a payout, and a manager can retry attaching the proof to the existing record.
Proof is optional; legacy payouts without it remain valid.

Client invoicing and bank-transfer reconciliation remain separate future capabilities.

Client invoice payment and cleaner payout must remain separate concepts.

## Financial totals and profit

Financial views need to expose relevant totals and profit. These should be calculated deterministically from the underlying client charges, cleaner compensation, adjustments, invoices, payments and payouts rather than maintained through unrelated manual status changes.

The exact treatment of fees, taxes, refunds and partial payments still requires discovery. Until those rules are confirmed, `profit` is a reporting concept rather than a finalized persisted field.

## Important relationships

Conceptually:

Organization
→ Clients
→ Properties

Property
→ Reservations

Property
→ Jobs

Reservation
→ related Job if applicable

Organization
→ Cleaners

Job
→ Invites
→ Cleaner responses

Job
→ assigned Cleaner

Job
→ Issues

Property
→ Checklist Template

Job
→ Checklist Run

Job
→ Photos

Job / system actions
→ Activity / Audit events

Client
→ Invoices

Client
→ Payments / reconciliation records

Cleaner
→ Payouts

## Firestore note

Do not automatically translate these entities into nested Firestore subcollections.

The persistence schema should be designed around:

- required queries
- realtime listeners
- permissions
- cost
- lifecycle
- data ownership
- future migration flexibility

Historical operations require efficient filtering by date range, client, cleaner and property. Persistence and index design must account for those access patterns without coupling the UI directly to provider-specific queries.

Future Guesty and Hospitable synchronization will also require stable external references, idempotent writes and an auditable approach to new reservations, date changes and cancellations.

Some duplication/denormalization may be intentional in Firestore.

Document those decisions when they are made.
