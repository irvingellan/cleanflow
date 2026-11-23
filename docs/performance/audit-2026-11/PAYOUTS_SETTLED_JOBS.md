# Payments: agreement reads for Jobs that are already paid (audit item A)

Follow-up to the external performance audit of 2026-11-22, checked against `main` at `1ca8dac`.

## Finding: confirmed in the code, measured on synthetic data only

`getUnpaidCompletedJobs` reads every `COMPLETED` Job of the organization, then drops the ones
with `payoutId` or `payoutPaidAt`. Those two fields are only written for legacy Jobs. A team Job
(schema version 2) records its payments in `payoutIdsByCleaner`, so it passed the filter even
when every cleaner was paid, and `enrichPayoutAgreements` read its Assignments and Offers on
every load of the Payments screen. The Job was discarded afterwards.

The cost per paid team Job is one Assignment query plus one Offer read per cleaner. Jobs are
enriched in batches of 10, one batch after another, so the wait grows with the paid history.

The audit's figures were not taken as given. Nothing was measured in Production: the numbers
below come from an in-memory Firestore in `payoutSettledPrefilter.test.js` that counts requests
and returned documents.

## Change

`payoutSettledOnJobRecord(job)` returns true when the Job document alone proves nothing can be
owed or reviewed: a team Job with fixed pay and fixed billing where every cleaner on the roster
has a non-empty payout link and no link names anyone else. Those Jobs skip the agreement reads.

Everything else keeps the full check: legacy Jobs, hourly pay or hourly billing, a partly paid
team, an empty or malformed roster, an empty or stray payout link.

Not touched: `recordPayout`, its transaction, the payout documents, Rules, indexes and stored
data. No field was added.

## Result on a synthetic history

300 completed Jobs: 60 legacy paid, 20 legacy unpaid, 180 paid team Jobs (120 with one cleaner,
60 with two), 10 half-paid pairs, 20 unpaid team Jobs, 5 hourly, 5 archived.

| One Payments load | Before | After |
| --- | ---: | ---: |
| Server requests | 521 | 101 |
| Documents returned | 890 | 410 |
| Sequential agreement batches | 24 | 6 |

The returned Jobs, their unpaid shares and both review flags are identical before and after on
this history and on six added edge cases (zero and unknown agreements, a revoked Offer, an
hourly agreement, a stray link, a paid Job billed by the hour).

## One behavior difference, by design

Before, a fully paid fixed-pay team Job would still appear under "hours to review" if a verified
personal agreement of one of its paid cleaners were hourly. The Payments screen cannot record a
payout for an hourly agreement, so the application cannot produce that state; it would need a
manual data edit or a changed Offer after payment. After this change such a Job is not listed.
Legacy Jobs already behave this way (`payoutId` hides the Job from the review list).

## What this does not fix

The first query still returns every completed Job, 300 of the 410 documents above, and it grows
with history. Bounding it needs a queryable "settled" marker on the Job: a new field written in
the payout transaction, a backfill of existing Jobs, a composite index and a rollback plan. That
is a data-model decision and was not started.

Open pull requests touch the same files: the organization work (#192, #222 to #226) edits
`payoutService.js`, and #238 edits `payoutShares.js` and `payoutAgreements.js`. This change adds
one function at the end of `payoutShares.js` and one condition in `getUnpaidCompletedJobs`.
Whoever merges second re-runs `payoutSettledPrefilter.test.js`; if #238 lands first, check that
an hourly Job with approved work is still excluded from the shortcut (it is today, through
`job.pay.mode`).
