# Multi-Photo V1 + Node22 — integrated release candidate

Status: LOCAL RELEASE CANDIDATE; no Production execution authorized.
Issues81/82/83. Functional engineering only; no new styling or Workspace/V2 work.

## Source composition and preservation

Start: Multi-Photo `ba3fa84a18e1afb6349e9a31b9d3a0320de20316`.
Selectively apply PolicyB from `1d8a6b6940f7f7651ab5ce1dd2f467641860d4b1`.
Integration source checkpoint: `3f21ab5dfad6cf6ab4e85ab9d32b9e18d3464912`.
Final exact delivery SHA and Hosting manifest are recorded in the local handoff.

Only three production-source files differ from Multi-Photo:
Functions package root engines20→22 in package/lock, plus the index import/call
`setGlobalOptions({ preserveExternalChanges: true, maxInstances: 20 })`.
Direct Storage7.22.0 and the dependency graph are preserved. All handlers,
other backend files, frontend, Rules, indexes and existing tests remain byte-identical.
The runtime/SDK/CLI test is reused, with the existing publicChecklist60s
timeout asserted. No gallery, optimizer or evidence-model rebuild.

Original Multi-Photo, Node22, completion, private-origin, V2, V3, Intake/WIP,
main/origin and source-preservation backups remain untouched. Original
PRODUCTION_STOP and later RELEASE_STOP are hash-verified, NOT cleared.
The integrated branch is local only, not merged/pushed/deployed.

## Current read-only Production baseline

2026-10-21 metadata:31ACTIVE,26nodejs22/5nodejs20.
Main/origin:8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526.
Hosting build:5c2e52492331577a7cbdc4aa41a8f1a6b9771b45;
Hosting version6130ee0f019cbff4. Main differs from live only in documentation.

Remaining runtime-only/combined upgrades are exactly:
publicChecklist,publicClientReport,publicOffer,
sendTodayExecutionReminder,sendTomorrowPlanningReminder.
Do not replay the historical21-target plan or the first10updates.

Fresh serialized SDK/CLI/config comparison plans8updates, zero create/delete/
recreate/IAM/service-account mutation.186 comparisons:175identical,11explained:
five Node20→22, five explicit empty Sandbox-ID defaults (no new privilege),
and publicClientReport omitted Function/revision max→explicit20.
All service-level caps are20; omission is NOT historical-equivalence proof.
The deliberate20policy is preserved, not a throughput/billing guarantee.
The explicit publicChecklist60s already equals observed live60.

Control-plane metadata includes all31Function/revision/scaling/identity/IAM,
bound/latest secret VERSION metadata, both Eventarc triggers and existing schedules.
No secret payload, customer record, object/photo, bearer token or operational URL read.
The23excluded Functions have captured revisions/configuration digests; this is
not a claim that arbitrary historical deployments were source-byte-equivalent.

Bucket metadata confirms existing regionalUS-WEST1 bucket and already-enabled
billing, without billing changes. Run/Functions/Storage quota metadata is visible.
Current bucket IAM and default-object ACL have no public principal; individual
objects/ACLs were not inspected. Exact-bucket Monitoring returned an aligned
aggregate gauge of61,456,790bytes over the preceding24h. Its aligned interval
end is NOT proof of the raw sample time or real-time consumption.
Quota limits are not measured remaining headroom or a zero-cost guarantee.
The bounded21:27:52–21:37:52UTC HTTP-log window had0requests, no pagination.
This is historical metadata only: no future quiet-window or absent-draft claim,
and it does NOT clear the STOP.

## Exact deployment scope and order — NOT EXECUTED

Eight existing Functions total, plus one exact-SHA Production Hosting bundle:

| Stage | Targets | Reason / gate |
|---|---|---|
|A1|publicOffer|Remaining Node20→22 only; no Offer behavior change|
|A2|sendTodayExecutionReminder,sendTomorrowPlanningReminder|Remaining Node20→22 only; no scheduler/provider/notification behavior change|
|B|publicChecklist,publicClientReport,getChecklistRun,getChecklistEvidence|Compatible V2 read/write/report; first2 also finish Node22, latter2 are explicit feature updates to already-Node22 Functions|
|C|Hosting|Exact integrated SHA, Production-bound reviewed manifest; no fixtures/harness|
|D|createChecklistRun|Explicit feature update to already-Node22 Function; LAST, activates policy2 on NEW Runs|

Expected runtime counts:26/5→27/4→29/2→31/0; stagesC/D do not change counts.
After A1/A2/B validate before the next group. No unfiltered Functions deploy.
The other23Functions retain their revisions. No new Functions, Rules,
Storage rules, indexes, secrets, providers, billing or notification logic release.
No synthetic events, production fixtures, test pushes or operational QA writes.

Production source inputs: exact local SHA, Node22.23.2/CLI15.28.1, locked SDKs.
Functions ignored local parameters retain only existing defaults:
DEV_CENTER_SANDBOX_PROJECT_ID empty, MANAGER_REMINDER_PROVIDER=fcm;
canonical input digest930b4625a4745717af7362b8d6480ecc99806df3fa22078e2cdd970cfa4c57fb.
Hosting public Firebase config matches the existing live worker; existing public
VAPID/OneSignal/navigation parameters match the live bundle and are preserved.
Local config is ignored, never printed, committed or included in the review ZIP.

Use existing `npm run hosting:prepare -- FULL_FINAL_SHA`; inspect manifest,
environment/project/buildID and fixture exclusion. Deploy only after a separate
GO; preparation has no deploy executor. New Runs must NOT be activated by
deploying createChecklistRun early. No client flag can override frozen policy.

## Why five feature targets, not more

Existing report issuance requires READY plus the locked draft and SAVED required
alias. New multi-photo finalization/removal synchronizes that alias transactionally.
Existing createClientReport issuance, approval and capability issue/get/revoke
bodies remain compatible by source inspection; no redundant redeploy is planned.
Actual emulator checks use all-new source; mixed-version safety above is a
separate source proof, not mislabelled as an old-source cloud execution.

## New versus existing Runs

New Runs after stageD freeze policy2:20 saved/pending-photo obligations,
50MiB aggregate charged bytes,5MiB per uploaded image. At least the existing
belongings photo must be server-saved; extras are optional. Only DRAFT can remove.
Reopen/reload preserves saved gallery/order. READY stays immutable.

Historical policy-absent Runs keep exactly their single-photo contract, without
migration/backfill. Replacing/reopening their link does NOT upgrade the policy.
Existing Jobs/assignments/prices/payments/history are not rewritten.

Client optimization remains sequential: source≤20MiB/16MP,20s deadline,
longest edge1920px, JPEG.85/.80/.75, no upscale/output growth; metadata stripped
or rejected. JPEG/PNG/stillWebP supported. HEIC/HEIF remains explicitly unsupported.
Retry retains the optimized Blob; success means server receipt, never selection.
Saved data persists; unsaved Files do not survive browser reload.

## Validation and honest evidence boundaries

Fresh integrated-source checks:
- Runtime3/3: actual SDK/CLI serialization,31exports/max20/no resets/public60;
  observed RED before integration, GREEN after.
- Focused11files/225tests passed.
- Actual WebKit390x844 integration2/2 passed with hostnode22.
  Covers1/2/10/20, saved ordered reload, failed/lost response/retry, removal,
  readiness/receipt,20manager images/report, legacy, byte/count races,
  invalid signatures, revocation/expiry/context and private namespace denial.
- Environment/build/Hosting guards22/22 passed.
- Production/Sandbox builds and exact-SHA preparation are in the final receipts.
- Syntax/source-preservation/diff checks passed.

Reuse same-day ba3fa84 evidence:119files/1351unit,282focused,82security,
28native optimizer,4gallery and4Chromium/WebKit integration tests.
No broad repeated suite was needed: explicit source/dependency byte identity
ties those results to this composition, with targeted declaration/E2E reruns.

WebKit integration blocks service workers; it does not prove installed-PWA updates.
Manager component uses real authorized REST callable projections, not full shell.
Prior physical iPhone Safari10photo/reload PASS remains only that scoped human
evidence. Camera/detail/memory, removal/retry, final review/report and installedPWA
need explicit physical acceptance; no real-cleaner/cloud-Storage success claimed.

## STOP disposition and authorization required

Current STOP remains authoritative; a quiet reading cannot override it.
A NEW signed/operator-recorded authorization must name finalSHA/manifest,
all8Functions/order, numeric20 policy, listed11config deltas, and recovery.
Refresh the exact metadata/config inputs, secrets/IAM, readiness and activity
immediately before any future write. New/unexplained drift, unknown outcome,
active cleaner traffic or inaccessible invariant means STOP, not blind retry.
Confirm operator reachable and a reserved window, avoiding reminder windows
06:30–07:30 and18:30–19:30 America/Los_Angeles, with30min recovery margin.
After each group verify ACTIVE/nodejs22, intended ready revision and both Run
scaling layers; non-target revisions/secrets/IAM/provider/trigger/schedule intact.
Capture requests/errors/429/latency metadata without customer payloads.

No Production GO is granted by this document. See final handoff for a copy-ready
exact-SHA authorization statement. Any physical acceptance not yet performed
must remain explicitly pending or consciously accepted for a controlled rollout.

## Recovery

Before activation preserve live Hosting version6130ee0f019cbff4 and exact
pre-group Function/Run revisions/config digests. On divergence stop later stages.
Before any policy2 state, a coordinated rollback requires proof of that fact
and a vetted Node22/PolicyB-preserving source; never blindly downgrade runtime,
omit/reset max20, switch event traffic, replay events or erase data.

AFTER any policy2 Run exists: no single-photo backend rollback. Old writers can
desynchronize alias/ledger; old Hosting hides extra photos. Keep V2-compatible
backend/evidence and fix forward from this source. Any Hosting fallback must be
V2-compatible and separately validated; the existing live single-photo bundle
is a baseline, NOT an approved post-activation rollback.

## Short physical acceptance script

Use only nonsensitive synthetic images in the private emulator test first:
1. iPhone Safari: library batch plus camera, orientation/fine detail,10then20photos.
2. Reload; verify saved count/order; remove one, retry a failed upload, no duplicate.
3. Incomplete submit shows requirements; complete submit requires confirmation and server receipt.
4. Manager reviews all images/report; installedPWA resumes/updates. Record exact
   build, browser/device and PASS/FAIL, not inferred human identity.

After explicit Production authorization only, observe the first real new-policy
pilot separately; do not create fake Production Jobs/Runs/photos for preflight.

## Known limits

20 is the approved initial ceiling, not proof adequate for every property.
Compression reduces bytes, not operation counts/retention; no zero-bill promise.
Unknown crashed writers remain quota-charged; no orphan worker/quota reset.
Removed identical bytes cannot be re-added; choose a different image.
Native decode/read/GC is not hard-cancellable or a guaranteed memory ceiling.
No schema/data migration, multi-cleaner workflow redesign or new photo feature.

