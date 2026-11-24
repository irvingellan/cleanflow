# Job Detail: late issue and assignment responses (audit item C)

Follow-up to the external performance audit of 2026-11-22, checked against `main` at `1ca8dac`.

## Finding: confirmed

`useJobDetailController` loads five lists for the open Job. Offers, the checklist Run and the
checklist link already dropped a response that arrived after a Job switch. Issues and
Assignments did not: `refreshIssues` and `refreshAssignments` wrote whatever came back.

Reproduced with controlled promises before the fix (11 failing cases):

- A late response for Job A replaced the issues or the roster shown for Job B.
- A late failure for Job A showed the error state on Job B.
- A late response for Job A cleared the loading state of Job B while its own read was pending.
- Two reads for the same Job that resolved backwards left the older result on screen.
- A read that was pending when the Job was closed filled the Job after it was reopened.
- A late roster for an Assignment-aware Job appeared on a legacy Job, which has no roster.

No incident from the pilot is attached to this. The audit showed the code path, and the tests
show it can happen; nobody reported seeing it.

## Change

Issues and Assignments use the guard Offers already had: Job id, Job epoch (changes on every
open and close) and a per-list request counter. The three lists share one helper,
`currentDetailRequest`. A response that fails the check is dropped, including its error and
loading updates.

`refreshAssignments(job)` now returns without writing when `job` is not the open Job. Its
callers pass the Job they just updated, so this only matters when the manager switched away
during a mutation.

No request was added or removed. Reads, Functions, Rules and data are untouched.

## Not changed: the reload on every Job update

The audit also proposed keying the reload effect on `selectedJob?.id` instead of the Job object.
That effect is how a Job snapshot (a cleaner accepted, a schedule changed) refreshes offers,
assignments and the checklist link today, so keying it on the id would drop legitimate
refreshes. It stays as it is until a narrower trigger is designed and tested.

## Verification

- `src/features/jobs/useJobDetailController.test.jsx`: 37 tests. 11 fail on `1ca8dac`, all pass here.
- Unit suite: see the pull request for the observed run.
