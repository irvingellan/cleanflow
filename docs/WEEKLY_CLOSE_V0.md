# Weekly Close V0 — read-only review

Issue #56, selectively ported from `6d2de2b` onto current main `ff14c2b`.
Preview route: `/weekly-close-preview`, behind existing manager authorization,
reachable from the read-only Preview entry in Payouts. Back clears the route;
refresh/deep-link preserves the view and Payouts navigation.
No mutation, invoice generation, payout editing or migration.

## Semantics

- Monday–Sunday inclusive by date-only `scheduledDate`; initial previous week
  uses America/Los_Angeles, not completion timestamps or UTC's current date.
- Only REAL, COMPLETED, non-archived Jobs; historical archived Property status
  does not erase an otherwise eligible completed Job.
- Saved Job client price and cleaner payout are authoritative quotes. Current
  Property prices are never substituted. Valid zero remains zero; missing,
  invalid or unsupported values remain UNKNOWN.
- Canonical Client IDs remain separate even when names match. Legacy saved
  names are not fuzzy-matched to canonical Clients. Missing Client linkage or
  disagreement with current Property linkage needs review, not regrouping.
- Full totals require complete evidence. Known subtotals reconcile exactly to
  visible line items; gross operational margin is not net profit.
- Legacy paid evidence requires one reciprocal payout link, one Job, matching
  amount/cleaner/organization, PAID and valid paid timestamp. A batch has no
  immutable per-Job allocation. v2/team payout status stays UNKNOWN.
- Job and payout reads use `getDocsFromServer` and reject cached/pending-write
  snapshots. Name/context reads reuse current services for display only, never
  financial proof. Loading fails visibly after 15 seconds; refresh retries and
  late week responses cannot populate another selection.

## Data-gap report / questions requiring product evidence

1. Is Monday–Sunday service date the desired billing week, including late
   completion and cross-week services? V0 deliberately uses this rule now.
2. Are saved per-Job client prices final charges, or can adjustments outside
   CleanFlow change the amount owed? Missing snapshots cannot be reconstructed
   from today's Property defaults.
3. For v2/team Jobs and grouped payouts, where is the authoritative per-cleaner,
   per-Job allocation and paid confirmation? V0 does not split team totals.
4. For legacy missing/contradictory Client or payout links, which source proves
   the canonical association and actual paid amount/date? No repair is inferred.
5. Where are client payments and automated-payment confirmations recorded?
   COMPLETED does not prove received money, invoice sent or invoice paid.

These are evidence questions, not prerequisites to inspecting known subtotals.
V0 is a reconciliation aid, not a certified billing close or accounting ledger.

## Local validation

`npm run scenario -- weekly-close --fast`

`npm run scenario -- weekly-close --fast --repeat 3`

`npm run scenario -- weekly-close --fast --mobile`

Scenario uses synthetic demo-cleanflow emulators, checks manager/anonymous
access, week navigation, exact totals, EN/PT/ES at desktop/tablet/390px and
unchanged Job/Payout records. No composite index is added: the new Job query
uses only scheduledDate range/order; payout queries use existing single fields.

Release validation: 69 focused tests; full unit suite 103 files / 1,041 tests;
78 security/emulator tests; Scenario Runner FAST 1/1, repeat-3 3/3 and mobile
1/1. Visual matrix includes 1440px and 390x844, EN/PT/ES. Build and diff check
pass. Emulators ran in an isolated temporary mirror on separate ports because
the normal local emulator ports were already occupied; no running user demo
environment was stopped or used as test data. Existing large-bundle build
warning remains unchanged. Real billing records were not inspected.
