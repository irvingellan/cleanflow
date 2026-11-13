# Notification outcome audit

Issue #85. Extends the published PR #97 from `ae77040`. This candidate has not
been deployed and sends no real notifications during verification.

## Reproduced observability gaps

The operational manager sender returns `acceptedByFcmDevices`, but the log
projection discarded that field. Known FCM failure codes contain `/`, which
the projection rejected. The cleaner sender persisted counts internally but
returned only its status to the logging wrapper. These made a successful
Function execution insufficient to answer what the provider accepted.

The existing projection now retains the accepted/rejected/unknown counters,
allowlisted provider failure codes and cleanup flag. Unknown is `null`, never
zero. Invalid/nonfinite/negative/fractional counters are dropped. The cleaner
sender returns an explicit aggregate projection and whether the final audit
write succeeded. Private per-device records, tokens, IDs, text and stages are
not returned to the logging wrapper. Sending, claim/idempotency, eligibility,
provider timeouts and notification payloads are unchanged.

Three regressions failed against the baseline helper before correction. Existing
synthetic sender tests now assert the actual output through that helper, including
two installations, duplicate events, stale token cleanup, ambiguous timeout and
failed receipt persistence. An ambiguous attempt and a failed final audit write
still do not trigger a resend. The durable Inbox remains the source for later
reading. No external provider is used by these tests.

## Evidence ladder

| Stage | Existing evidence | Remaining limit |
| --- | --- | --- |
| Operational event | Job/Offer/Checklist transaction plus committed notification record | No assertion that an unrecorded real incident happened |
| Eligibility | Current membership, assignment, device/session and pilot checks | No real device registry audit in this assignment |
| Attempt | Claimed sender and per-device internal audit | Logs intentionally omit identities |
| Provider result | Acceptance/rejection/unknown counts and safe code | Acceptance is not physical display |
| Inbox | Durable role-scoped item | Independent of push success |
| Client receipt/open | Existing client/worker health signals when available | No guaranteed delivery/read receipt, physical acceptance pending |

The four wrappers use distinct Function identities, so aggregate logs remain
attributable to the event type without person IDs. A status alone is not a
per-device diagnosis. Correlation to a specific real device would require an
authorized, private read of its existing diagnostics. No new tracking collector,
provider, polling, token export or production diagnostic send is introduced.

## Release and rollback

Only the same four existing Functions as PR #97 need updating:
`sendTomorrowPlanningReminder`, `sendTodayExecutionReminder`,
`notifyManagersOperationalEvent`, and `notifyCleanerInboxEvent`. Preserve the
other 53 revisions and every runtime/pilot/schedule/IAM setting. Rules, indexes,
Hosting config and data schemas do not change. A release must use the exact
integrated SHA and a sealed baseline snapshot/rollback receipt under separate
Production GO. Returning these helpers to `ae77040` restores prior log detail
without reversing any operational data. No deployment is part of this PR.
