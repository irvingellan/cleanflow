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

## Release B preparation and qualification

Work in `codex/notification-release-b-85` at its clean full SHA, with Node 22.
Keep the original Release A assets, manifest, seal and COMPLETE publish receipt
together in the A review directory. Release B uses the published A SHA
`12f432dd46a6c93e45bfb78ac1993568143c3840` as its live baseline. The B source SHA
can differ. The preflight is read-only in Production and can build locally.

1. Obtain separate authorization to configure the dedicated Production Web app
   named `CleanFlow Cleaner Hub Messaging`, only if absent. Its project,
   sender and public API binding must match the deployed manager configuration.
   Confirm the existing public Production VAPID fingerprint in Firebase
   Console. Compare fingerprints and keep private key material out of the run.
2. Run the B preflight to prepare Production assets. Expect the physical
   gate to block until the pilot exists. Retain the output manifest and copy
   the exact assets. A missing app or a mismatched live A receipt blocks build.
3. With separate authorization, use the configured `sandbox` Firebase project
   and its own manager app, dedicated cleaner app, VAPID and opted-in test
   accounts. The same candidate source can build its enabled worker with
   `VITE_CLEANFLOW_SANDBOX_PUSH_PILOT=enabled`,
   `VITE_FIREBASE_SANDBOX_VAPID_KEY`, the Sandbox cleaner app ID,
   `VITE_NOTIFICATION_INBOX_MODE=enabled` and
   `VITE_AUTOMATIC_OFFERS_MODE=disabled`. Use
   `npm run hosting:prepare -- "$candidate_sha" sandbox` to preserve its manifest.
   Normal Sandbox builds keep push disabled. The standard Production VAPID
   variable remains forbidden in Sandbox. Review the isolated backend and
   recipient set before authorizing any Sandbox deploy or test send.
4. Test the actual manager and cleaner roles on iPhone and Android. On
   iPhone, use the Home Screen app and tap the in-app opt-in. On Android,
   allow notifications for the browser and the site when prompted. Enroll
   by the normal login/access-code flow with consenting test accounts.
   Record permission, registration, provider acceptance, device display,
   open and Inbox availability independently. Confirm Inbox access after
   denying or disabling push. Do not record tokens, access codes or user IDs.

```sh
npm run release:notifications -- --stage B --sha "$candidate_sha" \
  --env-dir "$approved_production_env_dir" --previous-manifest "$a_dir/hosting-manifest-A.json" \
  --a-plan "$a_dir/release-plan.json" --a-receipt "$a_dir/publish-receipt.json" \
  --verification "$b_dir/verification.json" --vapid-console-sha256 "$prod_public_vapid_fingerprint" \
  --report "$b_dir/preflight-B.json" --build
```

After a separately authorized physical pilot, rerun with
`--pilot-manifest "$sandbox_manifest" --physical-verification "$physical_receipt"`.
The physical receipt carries the exact candidate `sha`, Production cleaner
`appId`, Production `vapidFingerprint` and `hostingManifestSha256`, plus
`environment: "isolated-pilot"`, `pilotProject`, `pilotManifestSha256`, a
distinct `pilotVapidFingerprint` and `releaseAuthorized: true`. Its
`observations` contain one row per `role` (manager or cleaner) and
`platform` (ios-home-screen or android), a non-identifying `evidenceId` and
true values for `permissionGranted`, `registered`, `providerAccepted`,
`displayed`, `opened` and `inboxAvailable`. This qualifies the same source
in Sandbox. Production device acceptance still requires its own observation
after a separately authorized publication.

See [Firebase Web Messaging](https://firebase.google.com/docs/cloud-messaging/web/get-started),
[WebKit Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
and [Chrome Android notification prompts](https://developer.chrome.com/blog/notification-prompts-android).

### Seal, activate and roll back B

After the final preflight passes, copy the exact `dist` to `$b_dir/assets-B`
and the prepared manifest to `$b_dir/hosting-manifest-B.json`. Seal locally.

```sh
node scripts/releaseNotificationB.mjs seal --sha "$candidate_sha" --dir "$b_dir" --a-dir "$a_dir"
```

Execute only after authorization of the printed plan hash and an exclusive
Production window covering all operators and CI.

```sh
node scripts/releaseNotificationB.mjs publish --sha "$candidate_sha" --dir "$b_dir" --a-dir "$a_dir" \
  --approve "publish:$plan_sha256" --exclusive-window
```

The scope is the two status and deactivation callables, verified Hosting,
the enrollment callable, then the sender trigger. Inbox and manager FCM
stay enabled. Automatic Offers stay disabled. The sender claims an event
before FCM and does not retry an uncertain provider result. Matching
completed receipts are verified no-ops on repeat. A failed partial deploy
retains the mutex and journal and needs reconciliation.

```sh
node scripts/releaseNotificationB.mjs rollback --sha "$candidate_sha" --dir "$b_dir" --a-dir "$a_dir" \
  --approve "rollback:$plan_sha256" --exclusive-window
```

With separate rollback authorization and a matching COMPLETE B receipt, the
script disables the sender, disables enrollment, then restores exact
Inbox-enabled A Hosting. Status and deactivation remain available. The
procedure preserves Inbox events, receipts and device/session records.
Provider messages already accepted before the switch can still arrive.
