# Billing Statement V0 — design

Status: design + pure model (`src/features/billing/billingStatementModel.js`).
Nothing is stored, sent or published by this change. Implements the open
questions of DEC-020, DEC-026 and DEC-028 only as a proposal for the manager.

## What the manager does today

- Two clients are billed weekly. For one, the manager builds a table of the
  week's services and sends it by WhatsApp; for the other, a PDF by email.
- A third client pays through the short-term-rental platform. The manager
  reconciles each payout against the platform and her bank account, by guest
  name, every week.
- Cleaners are paid weekly, on a fixed weekday. That is the existing payout
  flow and stays separate (DEC-028).
- Most services are fixed-price turnovers in a fixed daily window. One client
  pays by the hour, so the start and end time matter. Post-construction and
  move-out cleanings have no time limit.
- When a house is far dirtier than normal, the manager tells the client, sends
  photos and charges an extra amount, chosen case by case today.

The statement must show, per service: address, service date and total
charged; an **additional fee** with its reason when there is one; and, for an
hourly client, the hours.

## Proposal

One **Statement** per client per service period (normally Monday–Sunday,
the same week as the Weekly Close). It is built from data the app already has.

| Statement field | Source today | Gap |
| --- | --- | --- |
| Services | completed, non-archived Jobs of the client in the period whose Property still belongs to the client | none |
| Address | `Property.address` | some Properties may have none → "needs review" |
| Date | `Job.scheduledDate` | none |
| Fixed price | `Job.clientPrice` (defaults from `Property.defaultClientPrice`) | missing price → "needs review" |
| Hourly rate | new `Property.defaultHourlyRate`, copied to `Job.billing.hourlyRateCents` | new field |
| Hours | new `Job.billing.hours` = start, end, break, **approved by the manager** | new; never inferred from checklist timestamps (DEC-027) |
| Additional fee | new `Job.billing.additionalFees[]` = amount + reason (+ optional report photos) | new |

### Lifecycle

`DRAFT → ISSUED → SENT → PAID / PARTIALLY_PAID`, with delivery and payment as
separate dimensions (DEC-020):

1. **Draft** — built live for a client and period. Lines with a missing price,
   address, rate or unapproved hours are listed under "Needs review" and block
   issuing. Nothing missing is shown as zero.
2. **Issued** — the manager reviews and issues. The lines and totals are frozen
   with a number (`CF-2026-0001`). Later price or Property edits never change
   it. Each Job can be on only one issued statement.
3. **Sent** — the manager sends it herself, the same way as the client report
   (DEC-051): a revocable private link plus a ready WhatsApp message, or the
   print/PDF view attached to her own email. No paid email service.
4. **Paid** — the manager records each payment received (amount, date,
   method). Partial payments add up; a replayed receipt counts once; the
   balance is derived, never typed.
5. **Corrections** — an issued statement is never edited. The manager voids
   it (with a reason) and issues a corrected one; its payments move with it.

### Platform-paid client

That client receives no statement. V1 adds a **reconciliation list** for the
period: each completed service with its guest name and the expected amount,
which the manager marks as received when the platform payout arrives. This
replaces the weekly side spreadsheet without connecting to the platform.

## Decisions for the manager (before building)

1. **Name of the extra charge** shown to clients. Proposal: "Additional
   cleaning fee", with the reason under it.
2. **Rule for the extra charge**: free amount per case (today), or presets
   (e.g. light / heavy) she can adjust.
3. **Hourly clients**: who records start and end (cleaner in the checklist,
   then the manager approves, or only the manager); minimum hours; rounding
   (exact minutes or up to 15 min); whether a team of two counts double hours.
4. **Taxes**: none on the statement (current practice), or a sales-tax line.
5. **Payment terms** printed on the statement (e.g. "due on receipt").
6. **Pilot client**: one of the two weekly-billed clients (fixed price),
   before the hourly client.

## Build plan (after the decisions)

1. Billing fields on Job and Property, editable in Job detail (fee + reason,
   hours approval). Server-validated; only managers write.
2. Statement draft screen per client and period, reusing the Weekly Close
   reads (#103) and this model.
3. Issue + number + snapshot, in one transaction that also marks each Job as
   billed (no double billing).
4. Private statement link and print view, reusing the client report link.
5. Payments received, balance, and the reconciliation list for the
   platform-paid client.

Each step ships separately, behind the manager screen only; client-facing
links start with the pilot client.
