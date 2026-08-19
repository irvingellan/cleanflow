# CleanFlow — Initial Domain Model

This document describes conceptual domain entities.

It is NOT yet a final Firestore schema.

We first model the business domain, then determine the best persistence structure.

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
- default checklist reference
- standard photo requirements
- operational notes
- active status

Sensitive property-access data may require special permission handling.

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

## Job

Represents one specific cleaning/turnover.

A job references a property.

Conceptual fields:

- id
- organizationId
- clientId
- propertyId
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

Conceptual fields:

- id
- organizationId
- jobId
- cleanerId / uploadedBy
- storagePath
- type
- createdAt
- metadata

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
- status
- lineItems
- subtotal
- adjustments
- total
- issuedAt
- dueAt
- paidAt

Do not implement invoice rules until billing workflows are better observed.

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

Client invoice payment and cleaner payout must remain separate concepts.

## Important relationships

Conceptually:

Organization
→ Clients
→ Properties
→ Jobs

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

Some duplication/denormalization may be intentional in Firestore.

Document those decisions when they are made.
