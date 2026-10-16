# Issue82 — Node22 Policy B candidate (LOCAL ONLY)

Policy accepted by the owner on 2026-10-15: numeric maxInstances20 is a NEW
deliberate per-Function policy for exactly31existinggen2Functions in us-central1.
Historical scaling equivalence was NOT proven. Local implementation/testing and
Git checkpoint are authorized; production deployment/merge/push are NOT.

## Minimal source change

`setGlobalOptions({ preserveExternalChanges: true, maxInstances: 20 })`

No handler, dependency, lockfile, Rules, Storage, index, schema, UI or business
rule change. All31declarations must emit numeric20; region remains us-central1.
Other unspecified runtime options remain preserved, not null/reset. Exact export
inventory and actual SDK→CLI serialized body/update-mask tests prevent a future
new or renamed export from silently joining this reviewed31-function inventory.

The source declaration applies to31, but the proposed deployment targets ONLY
the21still onNode20. All ten already-Node22 Functions are excluded from planning.
Do not repeat batch0 for configuration normalization.

## Current cloud baseline and historical disposition

Read-only preflight checks31ACTIVE:10Node22/21Node20, with unchanged stopped-state
revisions. All31current Run Services have service-level max20. Of21remaining,
10already have explicit Function/revision max20 and11omit it. The new candidate
explicitly sets revision/Function max20 for those11; this is an intentional
policy change, not an omitted-equals-preserved claim. Both layers must be read
back after any separately authorized future deployment.

These seven earlier omitted→20 findings remain in the investigation evidence:

- abandonChecklistRunAndCompleteJob
- approveChecklistRun
- assignCleanerDirectly
- completeJobWithoutChecklist
- createClientReport
- getChecklistCapability
- getChecklistEvidence

Disposition: **DELIBERATELY ACCEPTED NEW POLICY; HISTORICAL EQUIVALENCE UNPROVEN**.
No repair/redeploy of these seven is requested. The other three already-migrated
Functions are clearDevCenterData, createChecklistRun, generateDevCenterScenario.
Original PRODUCTION_STOP.json is retained byte-identical. Policy acceptance does
not clear it or authorize any cloud update.

## Exact remaining inventory / proposed groups

| Group | Kind | Exact targets |
|---|---|---|
|1|Callable10|getChecklistRun, getClientReportCapability, getDevCenterAccess, getManagerNotificationDiagnostics, issueChecklistCapability, previewManagerReminder, registerManagerPushDevice, reportManagerNotificationHealth, rescheduleJob, revokeChecklistCapability|
|2|Callable4|revokeClientReport, sendCurrentManagerTestNotification, sendDeveloperTestNotification, submitFeedback|
|3|Firestore2|notifyManagersChecklistReadyForReview, notifyManagersOperationalEvent|
|4|PublicHTTP3|publicChecklist, publicClientReport, publicOffer|
|5|Scheduled2|sendTodayExecutionReminder, sendTomorrowPlanningReminder|

Exactly21updates; zero create/delete/recreate. Never use unfiltered functions
deployment. No synthetic event, replay, real push, fake Job or customer record QA.
Event triggers retain nam5, existing created-document paths, disabled retries,
identities and destinations. Schedules retain07:00/19:00 America/Los_Angeles.

## Effective input and invariant contract

Pinned tooling: Node22.23.2, CLI15.28.1, SDK6.6.0, Admin13.10.0;252locked dependency
entries unchanged. The existing ignored local project parameter input contains
only DEV_CENTER_SANDBOX_PROJECT_ID empty and MANAGER_REMINDER_PROVIDER fcm.
Canonical input digest:
`930b4625a4745717af7362b8d6480ecc99806df3fa22078e2cdd970cfa4c57fb`.
Do not add credentials or other env overrides. Without the pins, noninteractive
CLI resolution fails: this is an intentional negative control, not a successful
candidate with missing inputs.

Expected candidate deltas on the remaining21:

-21runtime changes Node20→22;
-21explicit empty Sandbox-ID defaults, no Sandbox privileges;
-2explicit fcm values where current code already defaults to fcm:
 getDevCenterAccess and previewManagerReminder;
-11numeric20 Function/revision pins under accepted new PolicyB.

Provider behavior is unchanged, but full environment byte equality is NOT claimed
for the additive defaults above. Automatic FUNCTION_SIGNATURE_TYPE injection may
be platform metadata; it must be explained separately, never excuse other drift.
All other environment/build-environment values, handlers, IAM/invokers, service
identities, secret bindings/resolved versions, CPU/memory/concurrency, timeouts,
ingress, triggers and scheduler configuration must match the reviewed comparison.
Metadata is read; secret payloads and customer records are never accessed.

## Per-group authorization and verification gates

Before any future write:

1. Obtain a separate explicit deployment GO naming the newly committed SHA,
   the exact21targets/groups, approved deltas and recovery policy. Resolve the
   existing STOP explicitly; this preparation never deletes or disables it.
2. Refresh real runtime/revision/inventory and complete effective preflight with
   the exact reviewed source, toolchain and input digest. Compare both Run layers.
   Unknown/new targets, unset intended maximum, reset masks, IAM/secret/provider
   drift, creates/deletes/recreates or unavailable metadata → STOP.
3. Confirm operator availability and a new sufficiently long quiet maintenance
   window. Prior quiet logs are historical only. Check bounded request/error
   metadata for all31services, especially public checklist/photo activity, without
   URLs, bearer tokens or payloads. Active cleaner usage → defer. Avoid06:30–07:30
   and18:30–19:30 America/Los_Angeles; leave at least30minutes recovery margin.
4. Deploy only one explicitly named group, at most10Functions, after a separate
   GO. This document is not a deploy script. No other Firebase surface.

After EACH group, before authorizing the next:

- CLI completion AND each intended Function ACTIVE/nodejs22 with new revision;
- previously migrated ten retain original Node22 revisions, no accidental updates;
- all not-yet-targeted Functions retain their prior runtime/revisions;
- intended Function, Run Revision AND Run Service each explicitly max20;
- traffic points to expected ready revision; no unexplained split or conditions;
- complete invariant read-back including IAM/identity, resolved secret versions,
  env/buildenv, ingress/CPU/memory/concurrency/timeouts;
- for group3: Eventarc ready, same paths/type/nam5/retry/identity/destination;
- for group5: Scheduler enabled, unchanged cron/timezone/target/auth/retry config;
- bounded metadata health observation for new exceptions, 429/5xx, startup/latency,
  instance saturation, queueing/concurrency. No synthetic operational events.
- optional separately approved invalid-token checks only; never a real bearer link.

Any unexplained delta, readiness failure, API denial, new sustained error pattern
or active operational use → STOP all later groups and record actual mixed state.
Do not blindly retry an ambiguous deployment or assume CLI exit0 is acceptance.

## Recovery / fix-forward

Preserve pre-group immutable source SHA, Function/Service/Revision config and
revision references before any future GO. Default recovery is to stop subsequent
groups and retain ready services while investigating. A code-only fix-forward on
supported Node22 with the approved20policy is preferred if a concrete regression
is proven. There is currently no handler change to roll back.

Do NOT assume redeploying e90040b restores historical scaling: it omits the cap.
Do not automatically downgrade Node22→20, reset a cap to null/undefined, set100,
switch Cloud Run traffic, delete claims or replay events. Event/scheduled paths
are not safely reversed by a generic HTTP traffic switch. A prior revision can
aid investigation but is not a validated all-trigger rollback procedure.

If a capacity problem is confirmed, changing max20 is a NEW capacity/cost
decision requiring exact target/value authorization. No recovery write is
authorized by the present preparation, including changes to the first ten.

## Capacity and monitoring limitations

Service-level and revision-level limits are distinct; the lower applicable
ceiling constrains scaling. Explicit source20 predicts new revision20, not a
measured throughput guarantee. Platform reconciliation must still be verified
after a future write. Max20 is not reserved capacity, a hard cost cap, guaranteed
1600concurrent successful requests or a project-wide620instance entitlement.
Shared CPU/memory quotas and startup/handler duration matter; transient platform
overages are possible. The previous low-usage sample does not prove burst safety.

Recommended post-release observation: before/after each group and after complete
rollout, then first real operational peak and next-day review. Compare per-service
request errors, frontend429s, latency including startup where available, instance
counts/concurrency/queueing, and scheduled/event readiness. Cloud Run request_count
alone excludes some pre-container rejections and cannot prove zero429s. Distinguish
per-series/hour percentiles from true peaks. Use safe aggregate metadata, not
customer payloads, invasive fingerprinting or physical-user attribution.

Actual burst adequacy and cost delta remain UNKNOWN until real observations.
Review billing metrics/budgets separately; no billing setting is changed here.
No alerting platform, synthetic production load, queue, worker or service added.

## Validation and evidence boundary

30focused runtime/model/resource tests;113files/1237unit tests;78isolated security tests;
Chromium and WebKit synthetic manager→photo→review→client-report journeys.
Actual SDK/CLI requests are generated with transport intercepted, not sent.
Full SHA-bound preflight, receipts and local checkpoint details are delivered in
the sanitized handoff. This is READY for an explicit deployment DECISION only,
not deployed, production-load proven or automatically authorized to continue.

Official references: [Firebase options](https://firebase.google.com/docs/functions/manage-functions),
[Run scaling layers](https://docs.cloud.google.com/run/docs/configuring/max-instances).
