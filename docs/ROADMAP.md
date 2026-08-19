# CleanFlow — Early Roadmap

This roadmap intentionally prioritizes learning and vertical slices over feature quantity.

## Phase 0 — Discovery and architecture

Status: In progress

Goals:

- observe Gabriela's real workflows
- inspect Notion structure
- understand current tools
- map current-state operations
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

Authentication and authorization for cleaner mobile links must be decided before implementing the real mobile invite flow.

This phase is intentionally more important than invoice, AI or external integrations.

## Phase 3 — Property and checklist structure

Potential goals:

- properties
- permanent property instructions
- checklist templates
- per-job checklist runs
- special instructions
- cleaner mobile execution experience

## Phase 4 — Photos and attachments

Potential goals:

- Firebase/object storage integration
- image upload
- compression strategy
- thumbnails
- photo requirements
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
- realtime activity
- issue management

Validate layout against Gabriela's actual desktop workflow.

## Phase 6 — Financial workflows

Only after additional discovery.

Potential goals:

- cleaner payout view
- accounts receivable
- invoice generation
- client-specific billing rules
- payment status

Do not directly process real payments initially unless explicitly scoped and reviewed.

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

Automatically create/update CleanFlow jobs from reservation data.

Prefer these integrations before attempting direct Airbnb integration.

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
