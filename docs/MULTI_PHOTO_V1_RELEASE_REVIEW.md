# Multi-photo V1 — Production-compatible release review

Status: READY FOR CONTROLLED RELEASE REVIEW, **not deployment authorization**.
Issue #81; isolated branch `codex/checklist-multi-photo-v1`. Existing code
checkpoint cc1bf99, integration e231120 and candidate documentation 1ee5ec9.
This final checkpoint changes documentation only. No redesign, new dependency,
migration, billing change, merge, push or cloud deploy.

## Requirements and evidence

1. Gallery/limits/optimization/readiness preserved: 20 photos / 50 MiB frozen
   policy2, sequential native optimization, required belongings photo only
   satisfied by server receipt. Additional photos optional; DRAFT-only correction,
   immutable after submission. No Job completion/payment side effect.
2. Historical policy-absent Runs retain legacy behavior without migration;
   actual emulator historical upload/review/report/image regression passes.
3. Actual authorized manager projection and twenty private image reads, and
   twenty-image client report decode, pass in Chromium/WebKit. Manager browser
   uses real callable projections with a REST port adapter, not the full Auth
   application shell. Manager report creation/approval business logic unchanged.
4. Actual quota/concurrency/capability/retry/removal/cleanup security tests pass.
   Shared ledger transactions charge saved and pending bytes/count; late writers
   must recheck capability/context/rotation/lease/DRAFT. Storage is outside
   retryable transactions; exact-content retries deduplicate; removal receipts
   and tombstones prevent resurrection. Lost commit responses are reconciled
   before generation-safe cleanup. Unknown writers remain conservatively charged.
5. Official Node20.20.2 arm64 binary checksum verified:
   `466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6`.
   Temporary runtime only, no global installation. Functions ESM/affected exports,
   full 119 files/1,349 units, 82 security cases and four actual integration cases
   pass under Node20. Functions emulator logs confirm `Using node@20 from host`.
   Deployed affected Functions were read-only observed ACTIVE/nodejs20.
6. Fresh native Chromium/WebKit optimizer28 and gallery4 tests pass. Synthetic
   JPEG/label/low-light/damage comparisons and original/output byte CSVs are
   included. No personal photos collected. Warm loopback upload is not cloud
   latency or actual cellular bandwidth; cold uploads were not benchmarked.
7. MIME/signature/privacy checks and native orientation1–8 tests pass; V2 outputs
   reject/strip EXIF/GPS/unsupported metadata. Safe projections never contain
   filenames, internal paths/content hashes or permanent Storage URLs. Actual
   emulator direct manager/anonymous namespace access is denied. GET-only
   Production metadata has no public bucket IAM/default-ACL principal; existing
   objects/individual object ACLs were not inspected. No real-photo cloud test.
8. Billing already enabled, not changed. Default bucket is firebasestorage.app,
   US-WEST1, REGIONAL; uniform access disabled, public-access prevention inherited.
   Metadata queries were GET-only; no API enabling or object listing/download.
9. Remote main/local main8bc7016; live5c2e524, production/clean-flow-prototipo.
   5c→8bc differs only in CURRENT_STATE; source baselines agree. Existing approved
   completion576afd1/test911d558/private-origin82ead8c ancestors remain intact.
   No new private-origin exception; Production cannot activate the test binding.
10. Separate V2 RC7f941b7 remains clean/unchanged; no V2 source was imported.
11. Unit/emulator/security/Chromium/WebKit evidence above is actual execution,
    not syntax-only checks. Production/Sandbox builds use synthetic config for
    compile/exclusion only; a later authorized release must use real matching
    environment config and its exact prepared manifest.
12. Canonical code remains local Git; review ZIP includes provenance, sanitized
    evidence, synthetic screenshots/benchmarks, this plan and remaining gates.
13. Owned temporary multi-photo gateway/Serve/emulators stopped via PID/start/
    command/group verification; test emulators exited normally. Tailscale remains
    connected; original older loopback runtime and unrelated services untouched.

## Human acceptance scope

Issue #81 comment6164322809 confirms ten photo uploads and persistence after
reload on physical iPhone Safari, private emulator-backed environment. It does
not separately verify camera append, optimization bytes/fine detail, removal,
retry, final submission/report/manager flow, thermal/low-memory or installed PWA.
Earlier private WebKit render/worker gate passed; private Chromium automation
was inconclusive. Bounded PT+StrictMode comparison did not reproduce a defect.
No claim that the affected real cleaner/device incident is resolved.

## Bandwidth, retention and operations

Representative synthetic camera JPEG4000x3000→1920x1440:
Chromium4,320,441→224,735B (94.8% reduction);
WebKit4,916,455→527,125B (89.3%). PNG conversions are separate benchmarks;
do not apply these ratios to every real iPhone photograph. Each upload uses
one optimized image body; retries/unknown attempts can increase traffic.
Fresh warmed local HTTP acknowledgement ranges50.6–82.6ms across six JPEG/
label/low-light cases; measurements exclude encode and verification reads.

Illustrative **not measured customer usage**: at400KiB/photo, ten photos use
3.91MiB per Run, twenty7.81MiB.500 twenty-photo Runs retained occupy about
3.81GiB;1,000 about7.63GiB. Retention accumulates: capability expiry does not
delete images. The hard50MiB cap also includes ambiguous pending obligations.

For this bucket family/eligible US region, published no-cost allowances are
5GB-month storage,5,000 upload operations/month,50,000 download operations/month
and100GB download/month; they are shared, not allocated exclusively to this
feature.500 Runs×10 photos or250×20 already reach5,000 successful object uploads
before retries/other workloads. Compression reduces bytes, not object count.
Cloud Storage metadata requests also consume operations; deletion/correction
and failed attempts can add more. Each fresh upload performs reservation and
finalization writes plus stale-attempt checks; required alias adds a write.
Transaction retries raise Firestore reads. Manager+client viewing all twenty
photos can transfer another two full sets and perform metadata/read operations.
Functions compute, Firestore, cross-region transfer and billing account shared
usage are additional; these are not a promise of a zero bill. No usage totals,
budget settings or customer objects were inspected or changed.

Official references:
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- https://firebase.google.com/pricing
- https://docs.cloud.google.com/functions/docs/runtime-support

## Future controlled release — separate authorization required

1. Revalidate remote/source/live markers, clean candidate and no unrelated WIP;
   confirm current Node20 deployment window. Node20 is deprecated and scheduled
   for decommission2026-10-30; after that, deployment/update may be blocked and
   an explicitly authorized runtime migration is required. Do not silently
   upgrade all Functions or treat local Node20 success as ongoing cloud support.
2. Capture current Hosting version and affected Function revisions/source;
   establish a quiet operator window. Do not mint synthetic Production records.
3. Stage compatible existing Functions only: publicChecklist, publicClientReport,
   getChecklistRun, getChecklistEvidence. Verify ACTIVE/no unsafe token errors.
   Publish current-SHA Hosting, then update createChecklistRun to freeze new
   policy2 only when public/manager/report clients are available. Actual ordering
   must be rechecked against the approved release commit before executing.
   No scheduled reminder, notification, unrelated Function, Rules/Storage Rules,
   index, secret or billing deployment is required by this diff.
4. Build through existing hosting:prepare using the integrated SHA, correct
   Production config, manifest/artifact guards and fixture exclusion. Validate
   HTTPS/version/asset hashes read-only; synthetic invalid token only.
5. Human acceptance of new multi-photo flow on explicitly authorized operational
   usage remains separate. Do not interpret provider/HTTP acceptance as photo
   quality or customer/cleaner device acceptance.

## Rollback boundary

Before any new V2 Run exists, coordinated rollback to captured pre-release
Functions/Hosting is possible after verifying no V2 state was created.
After V2 Runs exist, **do not restore a pre-V2 backend**: legacy writes could
diverge from the V2 ledger. Preserve compatible backend and saved evidence;
prefer fix-forward or a verified V2-compatible Hosting checkpoint. An older UI
can hide extra photos and lacks the optimizer, even though its upload receipt
already accepts the evidence array. It is not full-feature rollback equivalence.
No automatic data rewind/migration/deletion is proposed. Original local
completion/private candidates remain preserved; private preview has been stopped.

## Remaining limits and exact next action

HEIC unsupported; native decode/read/GC is not hard cancellable or memory capped;
server validates containers, not full pixel decode. Unknown/crashed writers may
retain quota indefinitely; no background orphan worker. Removed bytes cannot
be re-added identically. Historical old Runs stay single-photo. No code repair
was requested by the independent final review.

Next: owner reviews this RC/ZIP and explicitly approves a scoped release window
and runtime/calendar plan, or authorizes runtime migration first. No merge/push/
deploy is implied by READY FOR CONTROLLED RELEASE REVIEW.
