# CleanFlow Product Context

## Origin

CleanFlow began from a real operational problem.

Gabriela manages cleaning services for multiple short-term-rental clients and properties.

As the operation grew, administrative work became increasingly manual and began limiting her willingness to accept more business.

She currently performs several roles herself, including:

- cleaner recruiting / coordination
- scheduling
- operational communication
- property instruction management
- supply reporting
- financial tracking
- client billing follow-up
- cleaner payouts
- administrative record keeping

A significant portion of the work currently happens through WhatsApp and a large Notion database.

## Current clients and job intake

Different clients use different systems.

Current examples include:

1. A client who sends cleaning needs manually through WhatsApp.
2. A client using Hospitable connected to Airbnb. Gabriela has calendar access and manually identifies upcoming cleanings.
3. A client using Guesty connected to Airbnb. This is newer in her workflow.

Turno was previously used with one client but is no longer being used in that relationship.

One discovery question that remains important is:

Why did Turno not eliminate the operational pain that still exists?

## Cleaner coordination

Gabriela currently works with approximately ten cleaners she knows.

There is no consistent reserved weekly schedule with them.

For a new cleaning, Gabriela often contacts cleaners individually through WhatsApp until she finds someone available.

Selection is not based only on availability.

Factors may include:

- experience
- quality
- speed
- job difficulty
- whether the cleaner works with a partner/spouse
- cost
- suitability for heavier jobs
- availability

The current product hypothesis is:

A job can be offered to multiple cleaners simultaneously.

For the first vertical slice, the manager manually selects which cleaners receive the offer.

Cleaners can respond as interested or declined. In the interface, these responses may appear as “Tenho interesse” and “Não posso”.

Gabriela can then manually choose who receives the job.

The system may eventually recommend cleaners, but the manager should retain control unless later research supports automation.

## Instructions

Property/job instructions can be extensive.

Examples include:

- address
- parking
- key / lockbox information
- access code
- supply location
- cleaning instructions
- special requests
- checklists
- required photos
- guest information
- property-specific details

Instructions sent through WhatsApp become long and can become buried in conversation history.

A key distinction is:

### Property information

Information that generally belongs permanently to a property, such as:

- address
- owner/client
- default price
- parking
- access instructions
- lockbox
- supply location
- default checklist
- standard photo requirements

### Job information

Information specific to one cleaning, such as:

- date
- scheduled time
- assigned cleaner
- guest count
- special request
- temporary access change
- actual start time
- completion time
- one-time notes
- issue reports

## Cleaner completion workflow

After / during cleaning, Gabriela may need:

- checklist completion
- supply levels
- final photos
- damage reports
- issues
- start/end times for hourly work
- completion confirmation

Some cleaning jobs are fixed-price.

Some are hourly.

The system therefore must eventually support at least:

- fixed compensation
- hourly compensation

## Finance

Financial workflows currently differ by client.

Examples:

### Client flow A

Gabriela sends the week's total, then receives payment through Zelle.

### Client flow B

The client closes payments weekly and sends money through Relay.

### Client flow C

Payments arrive through an Airbnb-related automatic payment flow.

These payments can be harder to reconcile because multiple amounts may arrive together.

Gabriela currently marks payment status manually in Notion.

Cleaner payouts are currently performed every Tuesday, often through Zelle, regardless of whether Gabriela has already received client payment.

This creates two conceptually separate concerns:

- Accounts Receivable: money clients owe the business
- Accounts Payable / Cleaner Payouts: money the business owes cleaners

They should not be modeled as the same state.

## Top pain points identified by Gabriela

When asked what three tasks she would eliminate immediately, she chose:

1. Generate invoices automatically and send them to clients.
2. Stop contacting cleaners one-by-one to find availability.
3. Automatically send job instructions and reminders after assignment.

These are important priorities, but they do not automatically define implementation order.

## Manager experience

Gabriela often works from a MacBook.

The manager experience should eventually take advantage of a larger screen.

Potential desktop concepts include:

- today's operation
- jobs needing attention
- upcoming calendar
- cleaner availability
- properties
- finance
- invoices
- cleaner payouts
- realtime activity
- issues/exceptions

Gabriela currently changes/reorders Notion columns depending on the task she is doing.

Examples:

- paying cleaners
- collecting client payments

This suggests CleanFlow should provide task-specific views instead of forcing one giant table to represent every workflow.

## Worker / cleaner experience

Cleaner experience should be:

- mobile-first
- simple
- low-friction
- usable through the browser
- accessible from a WhatsApp link

A native app is not required for initial development.

WhatsApp can be the notification/entry channel.

Structured work should happen inside CleanFlow.

Potential cleaner actions:

- express interest in / decline opportunity
- view assigned jobs
- view instructions
- start cleaning
- complete checklist
- report issue
- upload photos
- report supplies
- finish cleaning

## Realtime operations

One major product concept is a realtime operations center.

Examples of realtime events:

- cleaner became interested in job
- job assigned
- cleaner started
- cleaner uploaded photos
- cleaner reported issue
- supply shortage reported
- job completed
- admin resolved issue
- payment state changed

Not every event should interrupt the manager.

The interface should distinguish:

- informational activity
- important events
- events requiring action
- urgent issues

## Issues and exceptions

Real operations do not always follow the happy path.

The manager must be able to intervene.

Examples:

- cleaner cannot access property
- guest is still inside
- cleaner is late
- unusual cleaning conditions
- property damage
- missing supplies
- cleaner forgot to use the system
- cleaner assignment changes
- job must be reopened
- job completed manually

Admin overrides should be explicit and auditable.

## Multilingual product

CleanFlow should be multilingual by design.

Likely early interface languages:

- English
- Portuguese
- Spanish

Other languages may be added later without reworking application architecture.

There are two translation concerns:

1. Static UI translation through i18n.
2. User-generated content translation, potentially using AI later.

Example future scenario:

Manager writes in Portuguese.

Cleaner reads Spanish.

Cleaner reports issue in Spanish.

Manager reads translated Portuguese.

This is a future capability, not an MVP requirement.

## Product expansion hypothesis

CleanFlow may eventually be useful beyond the initial design partner.

Potential users include:

- small cleaning operators
- larger cleaning teams
- short-term-rental operators
- property managers

However, the current priority is to solve and understand the first real operation rather than prematurely building a generic SaaS platform.
