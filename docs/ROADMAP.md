# CleanFlow — Product & Engineering Roadmap

This roadmap prioritizes validated workflows and complete vertical slices over feature quantity. Product discovery is informed by an anonymized design partner and converted into reusable engineering requirements rather than person-specific implementation.

## Phase 0 — Discovery and architecture

**Status: Active / ongoing**

Goals:

- observe real operational workflows;
- map current-state processes and tool boundaries;
- identify repeated sources of manual coordination;
- document domain language and invariants;
- validate prototype concepts;
- record architecture decisions;
- keep public technical documentation privacy-safe.

## Phase 1 — Project foundation

**Status: Implemented / evolving**

Foundation includes:

- React + Vite;
- Firebase service boundaries;
- Firebase Authentication;
- Firestore realtime state;
- Firebase Storage foundations;
- PWA/mobile-web support;
- internationalization structure;
- fictitious development data;
- Vitest / Testing Library;
- Playwright + Firebase Emulator Suite.

## Phase 2 — Core realtime operational slice

**Status: Active development**

Target end-to-end scenario:

```text
Manager creates Job
→ Job appears in realtime
→ Manager selects workers
→ Offers are created
→ Worker opens mobile offer
→ Worker responds interested / declined
→ Manager sees response in realtime
→ Manager assigns worker
→ Worker starts Job
→ Manager sees IN_PROGRESS
→ Issue can be reported and resolved
→ Worker completes Job
→ Manager sees COMPLETED
→ Important actions are auditable
```

Initial Job lifecycle:

`UNASSIGNED → OFFERED → ASSIGNED → IN_PROGRESS → COMPLETED`

Manager assignment remains explicit; worker interest never automatically assigns a Job.

## Phase 3 — Property & execution structure

Goals:

- reusable Property records;
- persistent property instructions;
- access-information boundaries;
- supply requirements;
- pricing defaults;
- checklist templates;
- per-Job checklist execution;
- historical preservation of Job-effective values;
- worker-facing Job pages.

## Phase 4 — Photos & attachments

Goals:

- Firebase/object-storage integration;
- image upload and validation;
- compression strategy;
- upload progress and retry behavior;
- photo requirements;
- job-level organization;
- client-delivery tracking distinct from upload state;
- issue attachments;
- retention/cost strategy.

## Phase 5 — Operations dashboard

Goals:

- desktop-oriented manager dashboard;
- today / upcoming views;
- attention-required queue;
- current Jobs;
- unified operational history;
- date/client/worker/property filters;
- realtime activity;
- issue and exception handling.

## Phase 6 — Financial workflows

Only after the operational model is reliable.

Goals may include:

- worker payout view;
- accounts receivable;
- invoice delivery state;
- client payment state;
- payout state;
- financial totals and profitability;
- invoice generation;
- payment reconciliation.

Real payment processing remains out of scope until security, compliance and workflow requirements are explicitly reviewed.

## Phase 7 — Notifications & messaging

Potential goals:

- official messaging-platform integration;
- worker opportunity notifications;
- assignment confirmation;
- reminders;
- secure deep links.

Messaging should remain an entry/notification channel while structured work stays inside CleanFlow.

## Phase 8 — Reservation-platform integrations

Potential targets:

- Hospitable;
- Guesty.

Synchronization must be idempotent, preserve external references and explicitly reconcile new reservations, date changes and cancellations with the related operational Jobs.

## Phase 9 — AI-assisted operations

Only after operational data is sufficiently structured.

Potential capabilities:

- multilingual user-generated content;
- classification of unstructured reports;
- live-operation summaries;
- natural-language manager assistant;
- risk detection;
- interpretation of unstructured job intake.

AI should enhance reliable workflows, not replace deterministic state transitions or permissions.

## Deferred until validated

- native iOS/Android applications;
- direct Airbnb integration;
- automated payment execution;
- enterprise analytics;
- marketplace behavior;
- generalized SaaS billing;
- autonomous operational agents.

## Roadmap principle

A feature earns priority when it reduces a validated operational burden, strengthens the core workflow, or materially improves reliability/security. Plausible features are not automatically roadmap features.
