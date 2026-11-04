# Issue #85 · Release A runbook

Release A publishes the durable Inbox on the manual Offer workflow. The
[review matrix](NOTIFICATIONS_RELEASE_A_MATRIX.md) lists all four creates,
18 updates and seven exclusions. Both A Hosting variants keep automatic
distribution and cleaner push off. The source retains the #86 domain
contracts and tests in a separately opted-in emulator profile.

## Local review

From the exact clean Issue #85 checkout on Node 22, collect the exact-SHA
seven-suite receipt described in [Phase 2](NOTIFICATIONS_V1_85_PHASE2.md).
The manager security group includes the release mutex emulator test.
The build and preflight commands inspect Production and build locally.

```sh
candidate_sha=$(git rev-parse HEAD)
release_dir=.tmp/issue85-release-a/review
# Populate the directory with verification.json and the prior Hub manifest.
npm run release:notifications -- --stage A --sha "$candidate_sha" \
  --env-dir "$approved_production_env_dir" --previous-manifest "$prior_hub_manifest" \
  --verification "$release_dir/verification.json" --report "$release_dir/preflight-A.json" --build
cp -R dist "$release_dir/assets-A"
cp .firebase/hosting-prepared-manifest.json "$release_dir/hosting-manifest-A.json"
npm run release:notifications -- --stage A --sha "$candidate_sha" \
  --env-dir "$approved_production_env_dir" --previous-manifest "$prior_hub_manifest" \
  --verification "$release_dir/verification.json" --report "$release_dir/preflight-rollback.json" \
  --build --compatibility
cp -R dist "$release_dir/assets-rollback"
cp .firebase/hosting-prepared-manifest.json "$release_dir/hosting-manifest-rollback.json"
npm run release:notifications:a -- seal --sha "$candidate_sha" --dir "$release_dir"
```

Use a fresh review directory. Retain the exact asset folders locally. The
portable handoff contains manifests and the review plan. The seal binds the
checkout, tool versions, test receipt, both manifests, exact Rules, the
ordered target lists and the current Production releases and revisions.

## After explicit Production authorization

An operator must reserve an exclusive window for all deployment mechanisms
with access to this project. Use the authenticated Firebase CLI operator
whose IAM probe passed. Replace the variables below with the sealed values
and keep the plan and receipts in the review directory.

```sh
npm run release:notifications:a -- publish --sha "$candidate_sha" --dir "$release_dir" \
  --approve "publish:$plan_sha256" --exclusive-window
```

The command checks the immutable assets, extracts source from the approved
Git object, sets explicit non-secret runtime modes, and acquires the shared
Firestore mutex `cleanflowReleaseControl/production` with an atomic
absence precondition. Rules go first, then session readers and normal
notification Functions, manager device registration, cleaner redemption,
cleaner code issuance, and finally Hosting. The
script checks the exact live snapshot before each step and compares the
result and unchanged resources before advancing. It verifies public assets
before writing the completed receipt. The lock document has no browser
access. Removal requires the exact lock update timestamp.

The mutex serializes operators using these scripts. Firebase deploy has no
cross-service compare-and-swap. Direct Console, API or CI writers can bypass
the lock between a check and a write, so the exclusive window is part of
approval. A failure after deployment starts stops further steps and leaves
the mutex and receipt for reconciliation. Confirm the recorded step, latest
versions, actual operations and mutex timestamp before releasing the lock.
An incomplete receipt cannot drive an automatic rollback.

## Compatible rollback

Use separate approval and the completed publish receipt. The script verifies
that Production still matches the release receipt. It disables the three
Inbox endpoints and publishes the compatibility Hosting artifact with its
own PWA update marker. Existing notifications, session-aware Rules,
checklists, manual offers and agenda continue on the compatible backend.
Durable records remain stored.

```sh
npm run release:notifications:a -- rollback --sha "$candidate_sha" --dir "$release_dir" \
  --approve "rollback:$plan_sha256" --exclusive-window
```

The older Hosting client compares only the scalar session field and rejects
additional devices. This command preserves the array-aware client. An
incident in the session, checklist or agenda code needs a compatible forward
fix or separately reviewed server recovery.

## Release B pilot

The pilot uses the existing Production project, manager public VAPID key and
a dedicated cleaner Messaging Web App. The app split is needed because the
pinned SDK keys its Messaging registration cache by Firebase app ID. Scope
and Firebase app instance name do not partition that cache. The manager and
cleaner both retain the existing token APIs. Migrating to FID is separate.
See [Firebase Web Messaging](https://firebase.google.com/docs/cloud-messaging/web/get-started)
and the [pinned SDK storage code](https://github.com/firebase/firebase-js-sdk/blob/firebase%4012.18.0/packages/messaging/src/internals/idb-manager.ts).

### Configure and seal locally

Use the clean `codex/notification-release-b-85` checkout and Node 22. Supply
the actual COMPLETE A review directory, which contains the original seal,
publish receipt, manifest and assets. A has published SHA
`12f432dd46a6c93e45bfb78ac1993568143c3840`. B has its own candidate SHA.

The configuration command is read-only without `--approve create-cleaner-web-app`.
With that specific approval, it may register exactly the named Web App when
absent. It compares Production with the A receipt and refuses ambiguous
inventory. Repeated configuration reuses the same app. It uses the approved
Production environment directory and prints only public identifiers and hashes.

```sh
node scripts/configureCleanerMessaging.mjs --a-dir "$a_dir" \
  --env-dir "$approved_production_env_dir" --report "$config_receipt"
node scripts/prepareReleaseBPilot.mjs --a-dir "$a_dir" \
  --env-dir "$approved_production_env_dir" --dir "$b_dir" \
  --verification "$test_receipt" --vapid-console-sha256 "$prod_public_vapid_fingerprint"
```

The second command compares live A, builds B, checks the manager worker bytes,
scoped cleaner worker and agenda manifest, and seals the pilot. It performs
no deployment. Sandbox is optional for local qualification. A Sandbox
inventory permission error does not govern this Production pilot.

### Activate only after the separate authorization

With the exact plan hash authorized and an exclusive release window, the B
executor stages the two status and deactivation Functions, verifies Hosting,
then installs the enrollment Function and sender. Each pilot Function is
bound to the exact B SHA. Push remains closed until an individual approval
exists. Rules, the manager sender and its schedules, the Inbox and manual
offers remain on their reviewed contracts. #86 remains disabled.

```sh
node scripts/releaseNotificationB.mjs publish --sha "$candidate_sha" --dir "$b_dir" --a-dir "$a_dir" \
  --approve "publish:$plan_sha256" --exclusive-window
```

A consenting cleaner uses their normal authorized session. Account settings
show a pairing reference for that installation. The operator records that
reference with the approved cleaner, organization and expiry in a private
local request under `.tmp/` with mode 0600. Fields are `organizationId`,
`cleanerId`, `pairingCode` and `expiresAt` (UTC ISO 8601 with milliseconds).
Use an absolute path. Inspect and approve the exact request hash using the
approval script. No receipt should contain pairing
references, account identifiers or registration tokens.

```sh
node scripts/approveCleanerPushPilot.mjs --dir "$b_dir" --request "$private_request"
node scripts/approveCleanerPushPilot.mjs --dir "$b_dir" --request "$private_request" \
  --approve "grant:$request_sha256"
```

Approvals bind account, organization, cleaner, session, installation and SHA,
expire within 24 hours and apply only to later events. The cleaner rechecks
status before opting in. A permission denial leaves the Inbox available.
A repeat of the same grant does not extend expiry. New devices require their
own authorization. A completed release can be verified again without deploy.
A partial deploy retains the mutex and requires reconciliation.

### Test on authorized physical devices

On iPhone, add the agenda to the Home Screen, open it by its icon and tap
the in-app opt-in after approval. On Android, open the Chrome/PWA agenda
and allow site and browser notifications. Use only approved devices, test
accounts and events. Record device permission, registration, provider
acceptance, actual OS display and opening separately. Test foreground and
background, denied permission, account switch, device revocation, app return
after restart and Inbox without delivery. Repeat for iPhone and Android.
Check manager interest, confirmation and checklist-ready using the existing
authorized manager flow. See [WebKit Home Screen push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
and [Chrome Android permissions](https://developer.chrome.com/blog/notification-prompts-android).
A passing emulator or provider acceptance does not complete physical validation.

### Rollback

With separate authorization and the matching COMPLETE B receipt, rollback
disables sender then enrollment before restoring exact Inbox-enabled A
Hosting. It preserves Inbox entries, receipts, device and session records.
Status and deactivation stay available. Previously accepted messages may
still arrive. Use the live snapshot and mutex gates for every step.

```sh
node scripts/releaseNotificationB.mjs rollback --sha "$candidate_sha" --dir "$b_dir" --a-dir "$a_dir" \
  --approve "rollback:$plan_sha256" --exclusive-window
```
