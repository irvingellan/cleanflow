# CleanFlow notifications V1 · Phase 2

This checkpoint extends the same Issue #85 branch at
`230fa2df53eb5b23142ecd5ec47450498169e516`. The candidate retains the existing
Firestore data model, Firebase SDK and FCM provider. The previous
[notification contract](NOTIFICATIONS_V1_85.md) describes the event catalog.

## Changes and evidence

- Inbox authorization and source reads share a Firestore transaction. Source
  reads are batched once per distinct Job or Offer on a page. Paging uses
  timestamp and document ID. The client initially shows 25 items and the
  unread count describes the loaded window.
- Initial automatic Offer events still create one personal notice per
  recipient. Their single atomic Job write performs the agenda sync.
  Legacy Offer creates and Offer updates continue syncing.
- The send path records a durable claim, then starts the provider attempt
  without waiting for a separate audit write. The terminal result updates
  the receipt. A crash after the claim leaves UNKNOWN and prevents resend.
- Worker tests cover stale installation bindings, logout, account change and
  renewal. Manager push navigation targets the same-origin manager route.
  Cleaner registration and builds require a distinct same-project app ID and
  a syntactically valid public VAPID key.
- Operator diagnostics display current account and local browser, install,
  permission and worker state alongside server registration age and
  eligibility. Latest Inbox metadata and provider results are separate.
  Receipt and physical display remain distinct observations.

The pinned SDK is Firebase JS 12.18.0 with Messaging 0.13.2. The installed SDK
stores token details by Firebase app ID and checks worker subscription
parameters during token reuse. The cleaner worker uses its own app ID and
scope. The official Web setup permits the public VAPID key in getToken for
the installed token API. The preflight also checks that the key is a
canonical P-256 point and matches the published manager build. A console
fingerprint is required for the enabled cleaner build.
[FCM Web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started)

## Read-only release preparation

Run the preflight from the clean Issue #85 worktree with Node 22 and the
installed dependencies. It reads Firebase Management, Hosting, Firestore
Rules, Functions, Service Usage and scoped IAM permission metadata. The IAM
probe uses the pinned Firebase CLI permission set and tests actAs for the
observed runtime identity. The report includes no keys, tokens, accounts or
configuration values. It checks the local SHA, prior public asset hashes,
runtime inventory, Rules hash, SDK, selected stage and verification receipt.
The test receipt must name the SHA and record positive pass counts and exit
code 0 for unit, manager-rules, hub-rules, webkit, chromium, guards and
worker-browser. The build flag creates the local manifest.

```sh
npm run release:notifications -- --stage A --sha <full-sha> \
  --env-dir <reviewed-local-production-env-directory> \
  --previous-manifest <verified-published-Hub-manifest.json> \
  --verification <local-final-test-receipt.json> --build
```

The dry-run report lists the Functions to create or update, Rules and
Hosting, plus the prior Hosting version and ruleset for rollback. Release A
publishes the Inbox with cleaner FCM disabled. An authorization to release
is separate from a passing dry-run. Once users have additional sessions,
rollback needs a compatibility build that preserves the new session reader
and authorization. Restore the earlier scalar-session stack only if
additional sessions have never been issued.

For Release B, the same tool requires the live Release A manifest, a verified
dedicated Cleaner Hub Web app and the public VAPID fingerprint confirmed in
Firebase Console. It emits a setup action for an absent app, and recognizes
an existing app with the exact dedicated name on rerun. App creation needs
separate cloud authorization. The portfolio app is outside this release.
Supply a physical verification receipt bound to the SHA, dedicated app ID and
fingerprint, with observed iPhone Home Screen and Android delivery and
separate Release B authorization. Verify the dedicated worker before enabling
the two cleaner transport Functions. Disable their cleaner push mode first
if rolling back B. Keep the Inbox, audit and read receipts.

## Device investigation

For #46, compare the two actual installations under the same authorized
manager account. Record local permission, worker and install context, exact
server eligibility, registration age, latest Inbox event and the provider
result. Record physical display and opening separately in the device
session. An offline or legacy manager installation may still have a queued
notification from before a switch. The real incident stays unproven until
the physical installation is identified and observed. This checkpoint made
no production resource changes or real sends.
