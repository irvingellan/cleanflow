# Weekly Close V0 — read-only review

Issue #56. The original preview was selectively ported from `6d2de2b`
onto the then-current main `ff14c2b`.
Preview route: `/weekly-close-preview`, behind existing manager authorization,
reachable from the read-only Preview entry in Payouts. Back clears the route;
refresh/deep-link preserves the view and Payouts navigation.
No mutation, invoice generation, payout editing or migration.

## Service periods and client selection

Open **Weekly close · Preview** from Payouts. The initial view and the two week
shortcuts use Monday–Sunday in America/Los_Angeles. The date fields also accept
an explicit inclusive interval of one to 31 days. Dates apply together to avoid
running intermediate queries while the manager is changing a period. Choose a
client from the eligible services returned by that read to narrow the figures
and service rows. Client filtering runs on loaded records, using the same
canonical Client groups and separate legacy snapshot groups as the full view.

An opening reads up to four ordered server pages of Jobs, 50 at a time.
The last page can read one extra record to distinguish exactly 200 Jobs from
a truncated period. When a page is full, the next read can return an empty
page before confirming coverage. Synthetic regression cases with 10, 100 and
1,000 matching Jobs trigger 1, 3 and 4 Job queries, returning 10, 100 and 201
documents respectively, including the sentinel. These counts cover only Job
queries. The snapshot cursor includes the document ID so multiple Jobs on one
date are not skipped. The 200-record limit applies before eligibility
checks. A partial result shows the number of eligible services loaded and
known subtotals only. The totals stay incomplete after client filtering.
Choose a shorter period to review more historical services. Cases with over
200 recorded Jobs on the same day remain partial. The read is a reconciliation
view over server responses observed during loading, not a transaction snapshot
for accounting.

Context Client and Property reads include only IDs from eligible Jobs, in
batches of at most 30. Names and historical links keep their prior semantics.
No second ledger is created. Older eligible services can be reviewed by
selecting their dates. This view has no proof of an older client's unpaid
balance or approved billable hours and does not estimate either.

## Semantics

- Inclusive date-only `scheduledDate`; completion timestamps do not select a period.
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
- Reconciliation uses Firestore Lite with the signed-in manager's Firebase app.
  These reads go directly to the server without cache or locally pending writes.
  Name/context reads provide labels. Loading fails visibly after 15 seconds.
  Refresh retries and late responses cannot populate another selection.
  Cancellation stops subsequent pages and contextual batches after any
  in-flight SDK read settles.

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

The current scenario passed on Chromium with the `demo-cleanflow` emulators.
It checks manager and anonymous access, period navigation, client filtering,
exact totals, EN/PT/ES across five viewport sizes, and unchanged synthetic Job
and Payout records. For 201 fixtures over two dates it verifies that 200 loaded
records yield a known subtotal and that selecting the second date yields a
complete total for its 101 services. The Job query uses only
`scheduledDate` range/order and the payout
queries use existing single fields.

In local WebKit, both the baseline `ae77040` and the first bounded reader
stalled on the full Firestore SDK's Watch channel. The local requests reported
access-control errors while the manager shell had already opened. Forcing
long polling in the emulator recovered that read. The feature now uses an
authenticated one-shot transport shared with Dashboard, so financial results
no longer depend on a Watch subscription. The separate browser scenario
counts known local WebChannel errors on reload and fails on other page errors
or any failed financial assertion. This comparison used synthetic data and a
local WebKit engine.

Initial V0 release validation: 69 focused tests; full unit suite 103 files / 1,041 tests;
78 security/emulator tests; Scenario Runner FAST 1/1, repeat-3 3/3 and mobile
1/1. Visual matrix includes 1440px and 390x844, EN/PT/ES. Build and diff check
pass. Emulators ran in an isolated temporary mirror on separate ports because
the normal local emulator ports were already occupied; no running user demo
environment was stopped or used as test data. Existing large-bundle build
warning remains unchanged. Real billing records were not inspected.
