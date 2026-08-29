# CleanFlow — Business Model Context

This document records product and business-model context without presenting
unvalidated hypotheses as decisions. It contains no confidential design-partner
details, pricing, revenue, market-size, or customer-count claims.

## Target customer

CleanFlow initially targets small to medium cleaning operators and
short-term-rental service operations. The primary user is an operations manager
coordinating multiple Properties, Clients, and Cleaners.

## Problem

Operational coordination becomes fragmented as an organization grows. A manager
may need to bridge messaging, calendars, flexible databases, Property context,
reservations, cleaner responses, photos/checklists, exceptions, invoices, and
payouts manually.

This creates repeated copy/paste, missed handoffs, inconsistent history,
financial ambiguity, and a manager-dependent operating model.

## Value proposition

CleanFlow aims to become the structured operational integration layer:

- organize Jobs, Properties, Clients, Cleaners, Offers, Assignments, and Issues;
- keep manager assignment control while reducing coordination friction;
- preserve operational and financial history;
- support mobile-friendly Cleaner participation;
- separate operational, QA, payout, invoice, and payment concerns;
- create a foundation for later reminders and external integrations.

## Current design-partner validation

Validated discovery supports the need for:

- coordinated work across multiple Properties and Clients;
- private Cleaner Offers with explicit manager assignment;
- team Jobs with independent Cleaner work and compensation;
- reliable schedule-change history;
- operational evidence, instructions, and issue handling;
- Cleaner payout tracking separate from Client receivables;
- searchable history and practical manager worklists;
- mobile/browser access for Cleaners.

This validation informs the product direction. It does not establish a general
market claim or an implementation commitment for every possible feature.

## Differentiation and operational wedge

The initial wedge is not generic property management, a messaging replacement,
or payment processing. It is structured cleaning-operation coordination where
the manager currently acts as the integration layer.

Potential differentiation comes from combining:

- Job, Offer, Assignment, and QA semantics;
- reusable Property context with historical snapshots;
- mobile-friendly Cleaner actions;
- manager-controlled multi-cleaner coordination;
- operational exceptions and evidence;
- explicit financial auditability.

## Expansion hypothesis

**HYPOTHESIS:** once the core operational model is reliable, CleanFlow may
expand through:

- client invoicing and receivables;
- reminders and messaging integrations;
- reservation-platform synchronization;
- availability-informed operational assistance;
- checklist/photo delivery workflows;
- related field-service use cases.

Expansion should follow validated workflow fit, not generic platform ambition.

## Monetization hypotheses

These are hypotheses, not finalized business decisions:

- Organization-level SaaS subscription;
- tiers influenced by operational scale such as Jobs, Cleaners, Properties, or
  automation/integration needs;
- higher-tier integrations or automation;
- optional onboarding or operational-data migration assistance.

No price, billing unit, free tier, contract model, or revenue target is decided.

## Potential cost drivers

Potential future cost drivers include:

- database reads/writes and realtime listeners;
- image storage, upload, retention, and delivery;
- Cloud Functions and scheduled automation;
- messaging/email/push delivery;
- reservation-platform integration;
- support and onboarding work.

Cost design should remain proportional to validated operational value and avoid
premature infrastructure.

## Risks and assumptions

- Cleaner access must remain lower friction than the tools it replaces.
- Multi-cleaner, pricing, QA, and payout foundations must be correct before
  payroll-style automation.
- Rescheduling/reminders require careful time-zone and idempotency policies.
- Financial records require stronger authorization and auditability than basic
  operational lists.
- External integrations should follow, not distort, the internal domain model.
- The initial design-partner focus should not be prematurely generalized into
  unsupported enterprise claims.

## Evidence needed before pricing

Before monetization decisions, CleanFlow needs evidence about:

- sustained manager and Cleaner usage;
- which workflow saves meaningful operational time or reduces missed work;
- willingness to pay and preferred pricing basis;
- implementation/support cost per Organization;
- value and reliability expectations for reminders, evidence, financial tools,
  and integrations;
- retention and expansion signals across more than one compatible operation.
