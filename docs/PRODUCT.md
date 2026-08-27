# CleanFlow — Product Context

## Product thesis

CleanFlow is a realtime operations platform for cleaning teams and short-term-rental turnover workflows.

The project is informed by an **anonymized design partner**: a small, growing cleaning operation coordinating multiple clients, properties and field workers across a fragmented toolchain. The repository intentionally describes workflow patterns rather than personally identifying the people or businesses involved.

The core product hypothesis is that operational coordination should move from scattered messages and manual records into one structured system while preserving low-friction mobile access for field workers.

## Problem space

As service operations grow, managers commonly accumulate responsibilities across:

- scheduling and job intake;
- worker availability and assignment;
- property instructions and access information;
- checklists and completion evidence;
- operational issue handling;
- reservation reconciliation;
- client billing status;
- worker payout tracking;
- historical reporting and auditability.

When these workflows live across messaging apps, reservation platforms and flexible databases, the manager becomes the integration layer. CleanFlow aims to make the software the integration layer instead.

## Current operating environment

Observed workflows may involve combinations of:

- WhatsApp or similar messaging;
- Notion-style operational databases;
- Hospitable;
- Guesty;
- Airbnb-connected reservation flows;
- external payment channels.

These systems expose different slices of the operation. CleanFlow should provide a unified operational model without copying provider-specific state blindly into the core domain.

## Primary operational flow

```text
Reservation / manual intake
        ↓
Cleaning Job
        ↓
Manager selects workers to invite
        ↓
Workers express interest / decline
        ↓
Manager assigns one worker
        ↓
Instructions and execution
        ↓
Checklist / photos / issues
        ↓
Completion
        ↓
Financial follow-up
```

The manager retains assignment control. Worker interest is a response to an offer, not an automatic assignment.

## Reservation versus Cleaning Job

A **Reservation** represents a guest stay or external booking fact.

A **Cleaning Job** represents the operational work that must be scheduled, offered, assigned, executed and completed.

These concepts must remain separate. Reservation changes may affect a Job, but reservation-provider state should not become the Job lifecycle automatically.

## Worker coordination

A recurring operational problem is contacting workers individually until availability is found.

The first CleanFlow workflow allows a manager to:

1. create or receive a Cleaning Job;
2. select multiple workers to receive an offer;
3. see `interested` / `declined` responses in realtime;
4. choose the assigned worker explicitly;
5. withdraw or close remaining open offers as appropriate.

Workers must not see competing workers, competing responses or the number of other interested workers.

Automatic recommendations may eventually assist the manager, but they must not silently remove manager control.

## Property information versus Job information

Reusable property data may include:

- address;
- parking instructions;
- access instructions;
- supply location;
- default checklist;
- standard photo requirements;
- pricing defaults;
- operational notes.

Job-specific information may include:

- date and scheduled time;
- assigned worker;
- guest count;
- temporary instructions;
- one-time access changes;
- issue reports;
- actual start/completion times.

Selecting a Property should populate appropriate defaults while preserving historical Job values. Editing the Property later must not rewrite what applied to previously completed work.

## Field-worker experience

The worker experience should remain:

- mobile-first;
- browser-first;
- simple;
- low-friction;
- task-focused;
- accessible from a secure link when appropriate.

Potential worker actions include:

- respond to an opportunity;
- view assigned work;
- view instructions;
- start work;
- complete checklist items;
- report issues;
- upload photos;
- report supplies;
- complete work.

A native mobile app is not required unless future requirements justify it.

## Realtime operations

Realtime updates are valuable when they reduce operational uncertainty.

Examples:

- worker expressed interest;
- Job assigned;
- Job started;
- issue reported;
- photo uploaded;
- Job completed;
- administrative override performed;
- payment state changed.

Not every event should become an interruptive notification. The product should distinguish informational activity from action-required events.

## Issues and exceptions

Real-world service operations routinely deviate from the happy path. Examples include:

- access problems;
- missing supplies;
- unusual cleaning conditions;
- damaged or non-working items;
- schedule changes;
- worker delays;
- manual manager intervention.

Issue state is intentionally separate from Job lifecycle state. A Job may remain `IN_PROGRESS` while an Issue is `OPEN`.

Administrative overrides should be explicit and auditable.

## Financial domain

Financial workflows should keep separate concepts separate:

- invoice delivery state;
- client payment state;
- worker payout state;
- payment reconciliation;
- operational profitability.

A sent invoice can remain unpaid. A worker payout can occur independently of whether a client receivable has cleared. These should never be collapsed into one generic status.

Real payment processing is outside the current prototype scope.

## Internationalization

CleanFlow is designed for multilingual operation.

Static interface translation and translation of user-generated content are different concerns. UI strings should live behind an i18n layer; future AI-assisted translation may handle unstructured content when appropriate.

## AI philosophy

AI is not the default solution for deterministic workflow rules.

Potential future AI uses include:

- interpreting unstructured job intake;
- translating user-generated content;
- summarizing operational activity;
- classifying ambiguous reports;
- assisting managers with natural-language queries.

Known state transitions, permissions and financial calculations should remain normal deterministic application logic.

## Product expansion hypothesis

Potential future users include:

- small cleaning operators;
- larger cleaning teams;
- short-term-rental operators;
- property managers;
- related field-service operations.

The immediate priority remains proving reliable operational workflows rather than prematurely generalizing the system into a broad SaaS platform.

## Public-repository privacy rule

This repository documents product patterns and engineering decisions, not private design-partner details. All committed fixtures must be fictitious, and public documentation should use generic roles such as **design partner**, **operations manager**, **client**, **worker/cleaner** and **property**.
