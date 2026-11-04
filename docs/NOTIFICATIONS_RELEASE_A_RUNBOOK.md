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
notification Functions, redemption, issuance, and finally Hosting. The
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

## Release B

After A is live, use its exact manifest as the previous manifest for Stage B.
With separate cloud authorization, create the dedicated Web app if absent,
confirm the Console VAPID fingerprint, and produce the Stage B build. Observe
authorized iPhone Home Screen and Android delivery and record distinct
provider, display and open outcomes. The preflight then checks the physical
receipt and separate release approval. The plan adds the status and
deactivation callables before enabling the worker, followed by registration
and the new event trigger. Keep deactivation available when reversing B.
The #86 creation callable stays outside both scopes.
