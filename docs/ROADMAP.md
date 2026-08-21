# CleanFlow — Early Roadmap

This roadmap intentionally prioritizes learning and vertical slices over feature quantity.

Discovery has confirmed that reservation reconciliation, bank-transfer payment reconciliation and manual invoice generation are major administrative pain points. They are important future capabilities, but they do not displace the first operational vertical slice or justify premature external integrations.

## Phase 0 — Discovery and architecture

Status: In progress

Goals:

- observe Gabriela's real workflows
- inspect Notion structure
- understand current tools
- map current-state operations
- document why prior cleaner workflows in Turno and Taskbird created access and manager-workload friction
- validate prototype concepts
- document domain
- establish repository architecture

Do not prematurely implement every feature Gabriela mentions.

Look for repeated operational patterns.

## Phase 1 — Project foundation

Goals:

- initialize React + Vite
- establish feature-based directory structure
- configure lint/build basics
- establish i18n foundation
- configure Firebase through services
- use fictitious data
- create initial development environment

No production user data.

## Phase 2 — First operational vertical slice

Goal:

Prove the core realtime workflow end-to-end.

Target scenario:

Manager creates job
→ job exists realtime
→ manager manually selects cleaners
→ manager offers job to the selected cleaners
→ cleaner opens mobile browser invite
→ cleaner responds "interested"
→ manager sees response realtime
→ manager chooses and assigns cleaner
→ cleaner sees assignment
→ cleaner starts job
→ manager sees IN_PROGRESS
→ cleaner reports issue
→ manager sees issue realtime
→ manager resolves issue
→ cleaner completes job
→ manager sees COMPLETED
→ important actions appear in audit/activity history

Use fictitious properties and cleaners.

The initial Job lifecycle for this slice is:

`UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`

Automatic cleaner eligibility/recommendation, `CONFIRMED`, `CANCELLED` and `REOPENED` are outside this slice.

Cleaner interest remains private from other cleaners, and the manager retains assignment control.

Authentication and authorization for cleaner mobile links must be decided before implementing the real mobile invite flow.

This phase is intentionally more important than invoice, AI or external integrations.

## Phase 3 — Property and checklist structure

Potential goals:

- properties
- permanent property instructions
- reusable access information and supply requirements
- pricing defaults populated when a property is selected
- checklist templates
- per-job checklist runs
- historical preservation of the property values applied to each job
- special instructions
- cleaner mobile job pages exposing the relevant instructions and checklist

## Phase 4 — Photos and attachments

Potential goals:

- Firebase/object storage integration
- image upload
- compression strategy
- thumbnails
- photo requirements
- reliable handling of 30 or more photos per cleaning
- photo review and delivery to the property owner/client
- delivery tracking separate from upload tracking
- issue attachments
- retention strategy

Do not retain unlimited original-resolution images without measuring cost.

## Phase 5 — Operational dashboard

Potential goals:

- desktop manager dashboard
- today
- needs attention
- current jobs
- upcoming jobs
- unified cross-client job history
- filters by date range, client, cleaner and property
- realtime activity
- issue management

Validate layout against Gabriela's actual desktop workflow.

## Phase 6 — Financial workflows

Only after additional discovery.

Potential goals:

- cleaner payout view
- accounts receivable
- explicit invoice pending/sent state
- explicit client payment pending/received state
- explicit cleaner payout pending/paid state
- financial totals and profit
- invoice generation and delivery
- bank-transfer payment reconciliation
- client-specific billing rules

Do not directly process real payments initially unless explicitly scoped and reviewed.

Automated invoice generation and automated payment reconciliation require additional discovery and should be introduced only after the underlying financial states and review workflows are reliable.

## Phase 7 — Notifications / WhatsApp

Potential goals:

- official WhatsApp Business Platform integration
- cleaner opportunity messages
- assignment confirmation
- reminders
- secure job links

Use official APIs and comply with messaging/template requirements.

## Phase 8 — External reservation integrations

Potential targets:

- Hospitable
- Guesty

Goal:

Synchronize Reservation records and explicitly reconcile related Cleaning Jobs when Guesty or Hospitable reports:

- a new reservation
- a date change
- a cancellation

Prefer these integrations before attempting direct Airbnb integration.

Reservation and Cleaning Job must remain separate domain concepts. Provider synchronization must be idempotent, preserve external references and audit meaningful changes.

## Phase 9 — AI-assisted operations

Only after operational data is sufficiently structured.

Potential capabilities:

- multilingual user-generated content
- classify cleaner reports
- summarize live operation
- natural-language manager assistant
- detect operational risks
- interpret unstructured job intake

AI should enhance the operational system, not replace reliable deterministic workflows.

## Explicitly not urgent

- native iOS app
- native Android app
- direct Airbnb API
- automated Zelle payments
- enterprise analytics
- complex marketplace
- generalized SaaS billing
- advanced AI agents

These may be explored later if validated.
