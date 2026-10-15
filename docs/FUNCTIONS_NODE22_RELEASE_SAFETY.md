# Issue82 — Firebase Functions Node22 release safety

Status: **READY FOR NODE22 RELEASE DECISION — preparation only**.
No deployment, merge/push, billing or customer-data access occurred.

## Source and live baseline

- Isolated branch: `codex/functions-node22-migration`.
- Base: `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526` (verified remote main).
- Live Hosting: `5c2e52492331577a7cbdc4aa41a8f1a6b9771b45`.
- Base versus live application source is identical; only CURRENT_STATE differs.
- Runtime implementation checkpoint: `911d291df2012494558d1e351f9c555317c7954b`.
- This does not prove byte-equivalence of every deployed backend archive. The
  inventory records deployed build/revision/source hash metadata separately.
- Main Intake/Telemetry WIP, V2RC `7f941b7` and MultiPhotoRC `588a1fd5` preserved.

## Actual production inventory (metadata-only, 2026-10-15 UTC)

31 existing Functions: **all ACTIVE, nodejs20, gcfv2, us-central1**.
24 callable,3 public HTTP,2 Firestore triggers,2 scheduled.
31 deployed revisions recorded.13 service configurations have maxInstanceCount20;
all31 concurrency80. Environment values/service identities were retained only as
digests; secret binding names/versions are metadata, never secret payloads.
Existing explicit reminder-provider values are FCM; omitted values use the
unchanged server default FCM. No provider switch is proposed.

Firestore triggers remain document-created, location `nam5`, retries disabled:

- `notifyManagersOperationalEvent`:
  `organizations/{orgId}/jobs/{jobId}/managerNotificationDeliveries/{eventId}`
- `notifyManagersChecklistReadyForReview`:
  `organizations/{orgId}/jobs/{jobId}/checklistRuns/{runId}/managerNotificationDeliveries/{eventId}`

Schedules are ENABLED, POST, America/Los_Angeles:
`sendTomorrowPlanningReminder` = `0 19 * * *`;
`sendTodayExecutionReminder` = `0 7 * * *`.
Exact revisions/configuration/coverage are in the sanitized handoff inventory.

## Minimal implementation

Functions package and matching root lock engine:20→22. No dependency version,
resolution or integrity changed. Installed Functions tree matches all252 locked
packages, with zero missing/mismatched packages.
Admin13.10.0 requires Node>=18; Functions6.6.0 requires Node>=14.10.0.
Firebase CLI15.28.1 consumes `nodejs22`; firebase.json has no runtime override.
Tests ran with Node **v22.23.2** (independent review also tested v22.12.0).

An actual SDK manifest regression exposed reset values for omitted configuration.
Added `setGlobalOptions({ preserveExternalChanges: true })` before all31
declarations, preventing implicit resets of live caps/identity settings.
All business-handler bytes and other51 server files remain unchanged except this
configuration import/option. No schema/rules/storage/index/frontend changes.

This option is not a blanket configuration-equivalence guarantee. Even without
dotenv, CLI15.28.1 resolves nonempty MANAGER_REMINDER_PROVIDER=fcm, marks the
codebase environment-managed and skips merging existing environment maps.
27 live functions explicitly have fcm;4 omit it. Candidate preparation can add
the unchanged fcm default to those4. The empty Sandbox-project parameter is not
added by the nonempty-param loop; emulator local parameters are not production
inputs. No other custom live environment key was observed in this inventory.
This is a **blocking preflight gate before the first deployment**: resolve the
actual candidate environment per function, privately compare existing keys/
values and bindings, and stop on any unexplained removal/change/addition.
An explained default-key addition is not the same as exact full-map hash equality.
Existing source-explicit settings remain authoritative; no-dotenv alone proves
neither environment preservation nor configuration equality.

## Validation and boundaries

- Runtime-selection test: observed RED(nodejs20), then GREEN(nodejs22).
- SDK reset-preservation test: observed RED; GREEN for all31 declarations.
- Final runtime tests:2/2.
- Final unit/server suite:113 files /1,237 tests passed.
- Final isolated authorization/security emulator suite:78/78 passed.
- Actual Functions emulator imported all31 declarations;29 initialized. Scheduled
  execution was intentionally not forced; its service logic/claim/transport is
  covered by existing unit/mock/security assertions.
- Actual Chromium and WebKit:2/2 authenticated manager callable/public photo flows.
  Synthetic Auth→manager membership→create Run/capability→incomplete422/DRAFT→
  native File/Blob PUT→private Storage bytes/metadata→idempotent retry→saved
  answers→server-confirmed READY once→manager projection→public report image.
  Unauthorized calls/random token denied; no auto-completion/payment change.
- Manager Auth/callables above use actual emulator REST from Node, not a claim
  of manager UI acceptance. Public checklist/report rendering is real browser.
- Existing separate worker transport test: Chromium PASS; WebKit FAIL waiting
  for updated worker build within5s (repeated). It fails before Blob PUT.
  Its source is unchanged, and it does not call Functions. No established causal
  link to runtime migration; do not call the entire browser suite green or the
  failure proven preexisting under Node20. Hosting is excluded from this release.
- One overlapping post-fix emulator rerun ended unexpectedly after57 tests.
  Sequential rerun completed78/78; only this run's verified orphan was stopped.
- Emulator-only application build passed; all server JS syntax checked in Node22.
- No production application-endpoint/customer-data calls; metadata-only
  control-plane reads occurred. No real pushes, physical-device or cloud rollback
  acceptance are claimed. No real identity is inferred from a browser/account.
- Independent final review: no remaining introduced P1/P2 after cap preservation;
  explicit configuration/release gates and validation limitations recorded.

## Existing dependency advisories (no blind upgrade)

Functions npm audit:13 affected package nodes (1critical,1high,11moderate).
Client production dependency audit:4high propagated nodes for the existing gRPC
advisory; npm suggests an inappropriate major downgrade, which was not applied.
Audit counts are not distinct exploit counts and the audit is NOT clean.

- proxy-addr: critical [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)
  requires malformed trust subnet plus IP-based security. No such app/SDK
  authorization path found; authentication uses Firebase credentials/membership.
- gRPC: [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j)
  and low error-message advisory concern server certificate contexts/handlers;
  inspected Firestore usage is a client, not a gRPC server/getAuthContext ACL.
- qs: [comma parsing](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) is disabled
  in inspected parser configuration. [Stringify issue](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)
  requires hostile-object reserialization; inspected outbound libraries use
  built-in querystring, not qs.stringify. Handler validation alone is NOT a
  defense against parsing that occurs before the handler.
- uuid: [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
  involves buffered v3/v5/v6 calls; inspected dependency paths use v4, app uses
  crypto randomUUID/randomBytes. No caller-controlled affected buffer path found.

These are source reachability assessments, not proof of deployed exploit immunity.
Keep dependency remediation separate, narrowly tested; no SDK upgrade required
by observed Node22 compatibility. Reassess if release configuration differs.

## MultiPhoto integration boundary

Read-only three-way merge-tree against MultiPhoto588a1fd and runtime911d291:
zero conflict markers. No merge/index/branch/RC change occurred.
The added direct Storage dependency7.22.0 is compatible with Node22 and already
matches the transitive version exercised here. Preserve engine22/config option
when later integrating the separately approved feature.
This proves textual/source compatibility only, NOT a tested combined release.
The combined candidate must rerun its full MultiPhoto quotas/race/image/report/
physical-iPhone acceptance separately. No MultiPhoto code shipped in this branch.

## Exact future release sequence — authorization required

1. Fetch/verify approved migration HEAD against unchanged main; refresh live31
   metadata. Freeze existing source/revisions/config binding digests. Stop on
   unexpected drift, new function, missing trigger, changed secret version or
   active operational upload. Do not read customer records or bearer tokens.
2. Require production project `clean-flow-prototipo`, Node22, engine/CLI test,
   exact locked dependencies; no Functions dotenv/local secrets or env overrides
   that could replace deployed values. Resolve the concrete CLI candidate
   environment BEFORE first deploy, including environment-managed parameters;
   privately compare every preserved key/value, service identity and secret
   version against captured metadata. Stop on unexplained drift. The4 missing
   provider keys may acquire the existing fcm default; explicitly disposition
   this known additive normalization rather than asserting identical hashes.
3. Only update existing names. NO create/delete/rename/recreate; no IAM workaround,
   secret changes, rules/index/Storage/Hosting deployment or billing activation.
4. Deploy the24 callables (exact command below), then verify runtime/state/config.
5. Deploy the2 existing Firestore triggers; verify intended event paths, nam5,
   retries disabled and Eventarc ready BEFORE public handlers. Stop on failure.
6. Deploy publicChecklist/publicClientReport/publicOffer. Perform only safe
   bounded invalid-token requests; no real Run, upload or report creation.
7. Deploy the2 scheduled functions away from their07:00/19:00 execution windows;
   verify exact cron/timezone/claim configuration. Never force/replay reminders.
8. Metadata must show all31 ACTIVE/nodejs22 with preserved configuration values,
   identities, secret versions, caps, concurrency, event paths and schedules.
   Compare hashes against the approved prepared maps (not blindly against old
   full maps if the4 explained provider-default additions occurred).
   Retain old/new revision inventory. No real delivery/display claim.

Commands below are documentation ONLY; none was executed:

```sh
firebase deploy --project clean-flow-prototipo --only functions:abandonChecklistRunAndCompleteJob,functions:approveChecklistRun,functions:assignCleanerDirectly,functions:clearDevCenterData,functions:completeJobWithoutChecklist,functions:createChecklistRun,functions:createClientReport,functions:generateDevCenterScenario,functions:getChecklistCapability,functions:getChecklistEvidence,functions:getChecklistRun,functions:getClientReportCapability,functions:getDevCenterAccess,functions:getManagerNotificationDiagnostics,functions:issueChecklistCapability,functions:previewManagerReminder,functions:registerManagerPushDevice,functions:reportManagerNotificationHealth,functions:rescheduleJob,functions:revokeChecklistCapability,functions:revokeClientReport,functions:sendCurrentManagerTestNotification,functions:sendDeveloperTestNotification,functions:submitFeedback
firebase deploy --project clean-flow-prototipo --only functions:notifyManagersChecklistReadyForReview,functions:notifyManagersOperationalEvent
firebase deploy --project clean-flow-prototipo --only functions:publicChecklist,functions:publicClientReport,functions:publicOffer
firebase deploy --project clean-flow-prototipo --only functions:sendTodayExecutionReminder,functions:sendTomorrowPlanningReminder
```

## Rollback

Stop remaining batches on first failed readiness/config gate. Preserve immutable
old/new revisions and original source8bc/package lock; redeploy ONLY affected
existing names from separately approved rollback source with preserved config.
Preferred rollback keeps Node22 and rolls application source back, since runtime
decommission is imminent. Do not promise HTTP traffic redirection restores
Firestore/scheduled behavior; verify each trigger/schedule too.

[Google runtime support](https://docs.cloud.google.com/functions/docs/runtime-support):
Node20 deprecated2026-04-30, decommission2026-10-30. Node20 create/update is not
supported after decommission; workloads may be disabled. Any earlier Node20
runtime rollback requires a freshly verified supported-window/API decision.
After that date, fix forward/restore previous business source on supportedNode22.
Never delete/replay notification claims or backfill events as rollback.

## Decision

Prepared for human Functions-only release decision, not authorization to deploy.
Runtime/server/security gates passed; advisory dispositions and the independent
Hosting/WebKit regression remain disclosed. No Hosting release is required.
Real cloud rollout/rollback and combined MultiPhoto acceptance remain future gates.
