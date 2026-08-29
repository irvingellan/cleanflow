# CleanFlow — Product & Engineering Roadmap

This roadmap prioritizes validated operational burdens and complete vertical
slices over feature quantity. It distinguishes implemented foundations from
planned work; discovery does not automatically authorize a feature.

## Current foundation

**Status: Implemented / evolving**

The current prototype includes:

- React/Vite application and feature/service boundaries;
- Firebase Authentication, Firestore, Storage, and Functions foundations;
- manager PWA/mobile-web experience and EN/PT/ES i18n;
- Clients, Properties, Cleaners, Jobs, Offers, Issues, dashboard, and Dev
  Center foundations;
- a legacy single-cleaner Job execution model;
- a first Cleaner payout-record and optional proof flow;
- Vitest/Testing Library and Playwright with Firebase Emulators.

The current model is not yet the validated multi-cleaner, QA-aware operational
model described below.

## Phase 0 — Discovery, compatibility, and data-model preparation

**Status: Active / highest priority**

Goals:

- maintain privacy-safe design-partner discovery;
- document stable business rules and open questions;
- preserve legacy Jobs while introducing compatibility helpers;
- capture canonical Client relationships on new Jobs where available;
- establish test fixtures for legacy and future Assignment-aware records;
- decide money representation, time-zone, and schedule-revision policy.

Small independent improvements may proceed where safe:

- optional guest name on a Job;
- advanced Job date-range filters;
- clearer Job-creation UX;
- current Cleaner-name visibility in Offer/manager views.

## Phase 1 — Multi-cleaner Assignment foundation

**Status: Planned**

Goals:

- treat Job as the operational aggregate;
- introduce per-cleaner Assignment entities;
- retain explicit manager assignment control;
- preserve the Offer → interest → Assignment distinction;
- support one or more cleaners on a Job;
- add Assignment-aware cleaner history and manager displays;
- preserve legacy singular-cleaner records through additive fallbacks.

## Phase 2 — Pricing, hours, and manager QA

**Status: Planned**

Goals:

- support fixed and hourly client pricing;
- support fixed and hourly cleaner compensation per Assignment;
- record worked and manager-approved hours per cleaner;
- support explicit manager compensation override;
- introduce submission, QA, and manager finalization;
- make resolved payable amounts historically stable.

## Phase 3 — Assignment-aware payouts and financial worklists

**Status: Planned**

Goals:

- calculate unpaid work per Cleaner Assignment;
- preserve existing legacy payout records;
- prevent duplicate payment of an Assignment;
- support unpaid-to-cleaner filters;
- retain optional manager-only payment proof;
- prepare weekly payroll review/reminder foundations without automating money
  movement.

## Phase 4 — Client invoicing and receivables

**Status: Planned**

Goals:

- create Client invoices with one or more Job line items;
- keep invoice delivery and client payment states independent;
- support unpaid-by-client worklists and reconciliation;
- preserve historical Job charges and Client snapshots;
- later evaluate PDF, email, messaging, and delivery integrations.

Real payment processing remains out of scope until security, compliance, and
workflow requirements are explicitly reviewed.

## Phase 5 — Rescheduling and reminders

**Status: Planned**

Goals:

- record schedule revisions and auditable history;
- preserve Offer and Assignment context through a reschedule;
- define confirmation behavior after changed dates/times;
- add idempotent Cleaner assignment/upcoming-work reminders;
- add weekly payroll reminders with explicit manager controls.

Reminder cadence, delivery channel, and time-zone policy require discovery and
must not be guessed from implementation convenience.

## Phase 6 — Operational evidence and availability assistance

**Status: Planned / incremental**

Goals:

- Property checklist templates and per-Job checklist runs;
- reference photos and required completion evidence;
- photo upload, retry, delivery tracking, and retention strategy;
- manager-maintained Cleaner availability/preferences;
- eligibility assistance only after rules are validated.

Automatic Cleaner matching, ranking, or recommendation must not remove manager
assignment control.

## Phase 7 — External operational integrations

**Status: Planned after internal model stability**

Potential targets:

- reservation synchronization with Guesty and Hospitable;
- messaging as notification/entry channel;
- secure links and role-appropriate mobile access.

Synchronization must be idempotent, preserve external references, and explicitly
reconcile new reservations, date changes, and cancellations with related Jobs.

## Phase 8 — AI-assisted operations

**Status: Deferred until data/workflows are reliable**

Potential capabilities:

- multilingual user-generated content;
- classification of unstructured reports;
- operational summaries;
- natural-language manager assistance;
- interpretation of unstructured Job intake.

AI should enhance structured workflows, not replace deterministic state
transitions, permission checks, or financial calculations.

## Deferred until explicitly validated

- native iOS/Android applications;
- direct Airbnb integration;
- automated payment execution;
- generalized enterprise analytics;
- marketplace behavior;
- finalized SaaS billing/pricing;
- autonomous operational agents.

## Roadmap principle

A feature earns priority when it reduces a validated operational burden,
strengthens a dependency needed by later work, or materially improves
reliability/security. Plausible features are not automatically roadmap work.
