# CleanFlow source / worktree / release-candidate registry

Issue #83 remains the canonical ledger. Latest source snapshot is below; historical observations are retained, not silently overwritten.

## 2026-11-03 canonical development consolidation — LOCAL ONLY

**Canonical development line: `codex/development`, worktree alias `<CODEX_WORKTREES>/cleanflow-development/Clean Flow Gabriela`.** This is one permanent local integration line, not a renamed Production release or remote main. No source was pushed, no main merge or deploy occurred, and no original feature branch was rewritten.

### Verified base and bounded import

| Identity | Exact source / evidence | State |
|---|---|---|
| Production Hosting | `b7b0eeac5374a8ffb072972c671f8803b680a1a0`; fresh13-file static hashes match approved manifest `12ba2eb7f8c015f80b9242386b3c8325c4ea897861f6fea870e93aa29349f878` | IN PRODUCTION; no new backend source-equivalence claim |
| Main / origin/main | `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526` | Unchanged; historical remote reference, not the current deployed application |
| Canonical functional source | `b7b0eea → a931468262252c2d46bb0405d7519995fc2d7bb4 → 2eaa5fd849bcb2e1c878b28ac8d5c05ab0959cec` | Two-commit fast-forward only; later canonical commits document governance/verification |
| Notification original | `codex/notification-reliability-v1-2026-11-03` at `2eaa5fd849bcb2e1c878b28ac8d5c05ab0959cec` | Preserved unchanged |
| Cleaner Hub original | `feature/cleaner-hub-v1-visual` at `08390b6f2f19c32c77a7808f17fbc9056f6ec90f` | Preserved unchanged, no component import |

The b7 source object and retained release tree were proved intact. Multi-Photo frontend/public trees match `ba3fa84`; the selective backend delta remains Node22/package-lock/PolicyB. Fresh verification used public static GETs only, with no application login or API invocation. Dated Function metadata remains31 ACTIVE Node22/max20; it does not prove all31 source labels equal Hostingb7. Notification source deliberately declares32 local handlers: **only `deactivateManagerPushDevice` is added**. No callable/cloud resource was created; this known delta requires a separately authorized backend-first release.

### Preservation gate closed before the fast-forward

The new owner-private capture at **2026-11-04 02:00:45 UTC** preserves all104 valid refs and all5582 locally recoverable Git objects, including368 commits,2074 trees and3140 blobs. Full object metadata and exact ref/symbolic-ref equality were verified in a separate restore, full fsck exited0, and no alternates were used. Unlike a normal ref-only bundle, the native bundle received every object ID; unreachable trees/blobs, internal checkpoints, full stash/fixture closure and private legacy history are retained opaquely. Canonical invalid `refs/.DS_Store` remains unchanged, with an opaque copy quarantined outside restored refs.

- Initial all-object bundle:225221775bytes, SHA256 `5c97a3ba966a4ee252c7f992c54573a1d85c5812754ab7a490002b20acea02a0`.
-1036 objects were absent from the prior full backup; all objects in that earlier verifier are present in this capture.
-485 current source/WIP/control copies (including7 original STOP records) and291 historical source snapshots were verified by hashes. Four previously missed private iPhone config/shutdown helper files were included without executing them. Worktree HEAD/index/reflog-OID recovery metadata is private and verified. Source refs, indexes, statuses and selected file bytes were stable at the integration gate.
-The earlier reported stash-fixture gap is closed **for private opaque Git recovery**, not privacy certification or permission to publish those fixtures. No fixture payload was printed or extracted into the review ZIP.
-All new backup directories/files are owner-only0700/0600 and FileVault is on. This is still the same Mac/disk; no disaster-recovery claim or external transfer is made.
-A final post-checkpoint extension captures the newly created canonical branch/documentation too; exact final bundle hash/ref/object counts belong to the immutable private receipt and sanitized handoff, avoiding self-referential Git documentation.

The frozen21-worktree/61-branch census below remains historical. Creating exactly this canonical line yields22 worktrees/62 branches before any independently initiated activity. No other new development line was created by this goal.

### Remaining historical limits and explicit decisions

Two exact earlier Hub census byte versions (`AccountSettings.jsx`, `hub/CleanerHub.jsx`) were not found in current recoverable objects or a bounded check of the existing Hub ZIP/folder. Current versions and current history are preserved; do not claim every former uncommitted byte version was recovered. Former WIP of the three previously missing V2 worktrees also remains UNKNOWN. No source was deleted or rewritten to resolve these uncertainties.

No encrypted off-device destination is yet authorized. The precise handoff is: owner selects/unlocks an encrypted external volume (or supplies an approved recipient/encryption workflow and private destination); Codex then copies the whole private capture, verifies every declared file hash at destination and performs an independent offline restore. Never upload this opaque master to GitHub or put it in a review ZIP. An eventual private Git remote requires separate approval and history/privacy review; push only the approved canonical line, never all refs, stash, legacy or internal snapshots by default.

**Ownership:** Claude owns visual components/styles/interactions/responsiveness; Codex owns services, hooks/adapters, auth/security/PWA/notifications/tests. App routing/build/i18n are shared integration hotspots and need one designated writer at a time. See `CANONICAL_COMPONENT_COMPATIBILITY_V1.md`; existing prototype contracts are proposals, not implemented services.

### Selective dependency/conflict matrix

The following is a source-derived plan; only the bounded Notification fast-forward above was performed. `CANONICAL_INTEGRATION_FILES_2026-11-03.csv` supplies exact319 file-delta rows for the five inspected ranges. Its rows describe existing source differences, not new application changes.

#### Feature selection and source ranges

| Stream / exact source range | Inherited versus missing | Ownership and dependencies | Integration / acceptance / release decision |
|---|---|---|---|
| Notification Reliability V1: `b7b0eea..2eaa5fd` (2 commits,37 paths) | Inherits all b7 operational/Multi-Photo/Node22 history. Adds bounded enrollment/recovery, precise worker readiness, revisioned owner-bound cleanup, conservative reminder outcomes and capped diagnostics. No CSS, Rules, indexes or provider cutover. | Codex functional services/tests; Claude owns visual UX. Requires existing manager authorization, Auth session identity, durable claims and FCM. Adds manager-only `deactivateManagerPushDevice`; local declarations32 versus dated Production31. | Only stream recommended for bounded local fast-forward, after private-backup gate. Existing validation is source-tied local evidence. Fresh integration verification plus authorized installed-iPhone/PWA recovery/display and real-user acceptance remain separate. Future release stages registration/deactivation backend before client and coordinates invalidation/transport surfaces. |
| V2 selective RC: `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526..7f941b7ace071777353d68c6c0cd1ff5656453f7` (2 commits,106 paths) | Presentation foundation and selectively imported pilots; does not inherit b7's15 later commits. Not an ancestry merge of all pilots. Original pilot/Dashboard WIP remains independent. | Claude visual direction; Codex preservation/integration. Runtime hotspots: `src/App.jsx`, `src/index.css`, `src/i18n/translations.js`, `vite.config.js`, Hosting guards, dashboard/jobs presentation, `src/components/v2/`. | HOLD whole-branch import. Reconcile against b7 features before selected reuse. `VITE_MANAGER_EXPERIENCE` is build-time; default/current must remain current. Historical local RC tests are not exact modern integration, deployed backend, physical V2 or owner acceptance. |
| Visual Studio: `7f941b7ace071777353d68c6c0cd1ff5656453f7..b17474caf91d547daa5facd7f7e529864a39eb47` (14 commits,83 paths; b7 comparison15 behind/16 ahead) | Inherits V2 RC; not b7 Multi-Photo/Node22 composition or new notification code. Contains actual prototype implementations and typed contracts, rather than a connected operational replacement. | Claude owns layouts/components/copy/interactions. Main implementation is `src/prototypes/manager-workspace-v3/`; preview tooling in `prototypes/manager-workspace-v3/`; also `package.json`, `.gitignore`, CURRENT_STATE. Uses shared demo model/store. | PRESERVE, then select components/contracts under an approved UI scope. No wholesale merge. Must bind existing functional handlers, private capabilities, photo policy2 and truthful notification projections; prototype flows do not prove server writes or deployment. |
| Cleaner Hub: `b17474caf91d547daa5facd7f7e529864a39eb47..08390b6f2f19c32c77a7808f17fbc9056f6ec90f` (5 commits,25 paths; b7 comparison15 behind/21 ahead) | Adds Hub/Away/Install/DeviceHealth prototype and tests/contracts. Its shared store imports `buildDemoState` and reads/writes localStorage. DeviceHealth explicitly says every action is simulated. | Claude visual owner; functional auth/persistence by Codex under separate scope. Exact adapters must separate manager versus cleaner identity/org/recipient access. Hub adds no proven authenticated persistent backend. | PRESERVE; UI contract/component adoption only until authenticated cleaner identity, authorized schedule/read projection, durable recipient inbox and permission/enrollment adapters are designed/tested. No claim of installed PWA, physical delivery or connected cleaner inbox. |
| Intake committed source: `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526..177e38d8527e94895ac885673ad22066e9aef936` (5 commits,68 paths) plus mixed WIP | Three commits beyond configured upstream plus current mixed Intake/Telemetry WIP; b7 comparison15 behind/5 ahead. Committed source and WIP are not one release candidate. | Existing manager-authorized review/promotion, Rules and domain services; `functions/src/index.js` and `src/App.jsx` overlap current functionality. Primary/Telemetry owners must isolate committed versus WIP changes. | HOLD integration. Preserve and separate source/WIP without copying raw reservation fixtures or activating observer/browser tools. Reconcile promotion/idempotency/authorization and current backend exports/guards before any scoped port. |
| V3 reference / hybrid / repair: `1a0e38c`, `2f7403f`, `21feba5` | Reference and hybrid are siblings. Repair benchmark depends on reference source. Visual Studio descends reference lineage, but that does not supersede hybrid behavior or independent WIP. | Claude visual owner; existing reference/provenance and benchmark dependencies. | PRESERVE each anchor; no blind combined merge or deletion. An explicit visual selection precedes functional port. |
| Historical Telemetry `0a738b5` plus primary and detached continuation at `177e38d` | Historical baseline and two local continuations are distinct. Deployed historical allowlisted diagnostics do not prove current WIP or real-user attribution. | Manager authorization, bounded diagnostic allowlists, deterministic telemetry service; backend/Rules overlap with other work. | HOLD mixed WIP integration; isolate and compare first. No broader customer/log inspection needed for canonical source consolidation. |
| Weekly Close / Offers / Sandbox | Already inherited in b7: Weekly Close `b1c6c9d5404e44ec9e1f6303155d122e569b8083`, Sandbox `6f275ea1baaac86a1aa666a69a8b696d30170fdf`, offer compensation `d8a67d5b50d3a0f93d2a5754f842a07d658ef3b8` and receipt `c6b269d388bc4169eccf91d89015de25c6d22db2`. | Reuse `src/features/weekly-close/`, `jobOfferService`, `offerCompensation`, public-offer services/acknowledgment, environment and Sandbox guards. Interest remains distinct from manager assignment. | Do not reapply old branches. Current source inheritance is proved; no new deployment/acceptance claim is made. Preserve read-only Weekly Close and Sandbox boundaries; no payroll/payment/real operational writes are added. |
| Checklist completion / private origin / Multi-Photo / Node22 | Completion/private-origin are inherited by Multi-Photo `ba3fa84`; b7 then includes selective `3f21ab5` Node22/PolicyB composition. Original Node22 `1d8a6b6` was selectively reused, not wholly merged. | Preserve legacy-versus-policy2 contracts,20-photo limits/order/retry/byte accounting, private capability authorization, Node22/max20/preserveExternalChanges. | Already inherited: do not reapply old branches or roll back to pre-policy2/single-photo main. Physical installed-PWA/real-cleaner acceptance remains independent of source ancestry. |
| requiredCleanerCount HOLD | Held tip `c5b3f844f9eb71ef53dfdc1930c1678307fece82` and enforcement `b4b35bf` are ancestors of b7 **with later explicit revert `dcb7a4235620e83fbf4d3a32acdfcc0a231a5c71`**. Reachability is preservation, not active feature proof. | Product policy remains held. Existing independent assignments/acknowledgment do not authorize a required-count gate. | Keep HOLD. Never reactivate enforcement as an incidental visual/Hub dependency. |
| OneSignal PARKED | Code exists in b7, but FCM is the default/configured transport in dated evidence. `requireAvailablePilotReminderTransport` rejects unavailable OneSignal before consuming claims; no silent provider fallback. | Existing dormant provider code preserved. Notification V1 explicitly excludes initialization/identity traffic during resume. | Keep PARKED. No cutover, registration, permission prompt, secret/config change or test send. |
| Notion/import uncertainty | Historical selected import is documented; no proven connected Notion implementation at inspected anchors. Shared stash generic import-preview is not a Notion connector or full migration. | Separate import/provenance/authorization decision. Raw stash fixtures remain excluded. | UNKNOWN/PRESERVE; do not invent a connector, repeat a migration or treat docs/history as connected availability. |


#### Conflict hotspots

A bounded legacy three-argument `git merge-tree <explicit-common-base> 2eaa5fd <stream-tip>` inspection was used; no two-argument/`--write-tree` form was used. Explicit base is `8bc70165` for the four sibling streams. This compares committed source only, not active WIP. It writes no index/worktree/ref and no merge commit. The result is source conflict evidence, never integration acceptance.

| Source against proposed notification continuation | Textual conflicts | Additional semantic review |
|---|---|---|
| Visual Studio / Cleaner Hub | `.gitignore`, `docs/CURRENT_STATE.md`, `src/i18n/translations.js`, `vite.config.js` | `src/App.jsx` overlaps notification sign-out despite text merge; preserve `prepareManagerPushSignOut`/`abortManagerPushSignOut`. Both visual streams inherit old global CSS/build setup. Preserve b7 policy2 translations and build/PWA boundaries. |
| V2 RC | `docs/CURRENT_STATE.md`, `src/i18n/translations.js`, `vite.config.js` | Same App/sign-out/build activation review. Its historical149 protected-file equality claim is against its old baseline, not equality with b7 or a guarantee after composition. |
| Intake committed tip | `.gitignore`, `docs/CURRENT_STATE.md`, `functions/src/index.js` | `src/App.jsx` overlaps. Backend index must retain notification exports/runtime policy and human-gated review. Mixed WIP introduces additional unknown overlaps and cannot be cleared by this committed-only comparison. |

Notification-specific changed-path intersection with each visual/RC source is only CURRENT_STATE and App; Intake additionally intersects Functions index. Comparing the entire b7 composition correctly reveals translations/CSS/Vite/ignore and domain-doc hotspots as well. Text merging without conflict does not establish behavior preservation.


### Validation and next action

Fresh candidate verification and byte-bound reuse are recorded in `CANONICAL_INTEGRATION_VALIDATION_V1.md`. No full historical suite was rerun merely to reproduce an existing receipt. The only source import is exact Notification Reliability; financial/lifecycle/checklist/access/Rules/index/visual source outside its reviewed change set remains b7-identical.

Next: human functional review of this one local line and selection of the first **approved** Claude component subset. Do not merge the visual sibling branches, activate cleaner backend services, integrate Intake WIP, switch providers or release from this document. Required cleaner-count enforcement stays reverted/HOLD; OneSignal stays PARKED. Every future import records exact range, ownership, acceptance, tests, backup receipt and rollback before advancing this line.

---

## 2026-11-03 reconciliation refresh — evidence and stream handoffs

This refresh updates the historical point-in-time ledger preserved below. It is a source inventory and dependency map, not permission to merge, deploy, clean, delete or rewrite history. Exact local paths remain in the private local companion; only aliases belong in this registry. No customer contents, contacts, account identities, credentials or operational access details are included.

### Observation boundaries and refreshed counts

- Initial read-only listing: **19 registered worktrees / 59 local branches**. Final bounded census, **2026-11-04 00:07:13–00:07:23 UTC**: **21 worktrees / 61 local branches / 37 live remote heads / one shared stash**. The independently active Cleaner Hub and Notification Reliability trees appeared between those observations. They were not created by the source census. All registered paths existed.
- Fresh `ls-remote --heads origin` matched every cached remote-head name/SHA. Main and origin/main remained `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526`. No fetch was performed.
- Using the older ledger's definition—branches containing a commit unreachable from every live remote head, including private legacy—the local-only count was **23 initially / 25 at final capture**. At final capture, **24 modern branches** met that condition; **26 branch names** were absent remotely and **27 tips** had no exact remote-head SHA match. Those are different measures.
- The frozen final census contained **61 distinct modern commits absent from all live remote histories: 47 touching allowlisted implementation/configuration files and 14 Markdown-only commits**. Private pre-public content was excluded. This measures SHA reachability and changed-path categories, not semantic uniqueness, feature count, patch equivalence or supersession. The later Cleaner Hub advancement described below is outside this frozen commit census; ongoing Notification Reliability work is also outside it.
- The companion **`branches.csv`** contains every branch's full SHA, upstream, upstream ahead/behind, ahead/behind main, remote reachability and worktree association. **`worktrees.csv`**, **`before-after.json`**, **`source-file-metadata.csv`**, **`all-refs-and-backup-coverage.json`** and **`unreachable-backup-coverage.json`** retain the detailed sanitized evidence. They are review companions, not raw source backups. Full paths are confined to the private companion.
- All 21 HEADs stayed unchanged during the final census window; **20/21 status hashes stayed unchanged**. Only the independently active Cleaner Hub changed status within that window. Do not describe its WIP—or this ongoing assignment's own new implementation files—as frozen, exclusively owned or atomically backed up. The primary Intake/Telemetry and detached Telemetry status hashes were stable in that window.
- The expanded allowlist produced **594 source-looking metadata records: 49 tracked WIP, 102 untracked and 443 ignored**; 345 ignored records use the prior audit's exact code extensions. Expanded records include selected docs/configuration/HTML and can include generated helpers, so totals are not unique implementation counts. **276 current files** matched verified earlier private snapshots. Environment/credential/key material, raw CSV/JSON datasets, dependencies, build/cache directories and symlink targets were excluded from payload inspection/copying.
- A later all-ref metadata observation found **104 valid refs: 61 branch heads, 38 origin refs including symbolic origin/HEAD, four Codex refs and the stash**. Internal Codex tree payloads were kept opaque. These counts do not establish that no other arbitrary personal/archive location exists.

### Current Production evidence, separate from branch source

Read-only Production verification on **2026-11-03 at 16:04 America/Los_Angeles** returned HTTP 200 for `/version.json` with Hosting build **`b7b0eeac5374a8ffb072972c671f8803b680a1a0`**, bound to the Production project. This supersedes the old `5c2e524…` Hosting observation in the historical ledger below. It does not make `main`, every branch, Sandbox or a current local worktree equal to Production.

Authenticated Function metadata showed **31 ACTIVE / 31 Node22 / maxInstances 20** and the same31revision identifiers as the laterOctober21release receipt. This metadata read did not newly re-audit Run readiness, IAM, secret bindings or schedules. Both reminder configurations retained `fcm`. Per-Function source labels remain historical and target-specific: the eight-target release labels do not prove that all 31 Functions were rebuilt from Hosting SHA `b7b0eea`. No customer data or private incident-state receipt belongs in this registry. Metadata confirms runtime/configuration; it does not prove physical-device delivery, real-user acceptance, throughput or source-byte equivalence for every backend.

The current Notification Reliability assignment reported a **fresh unchanged-baseline unit run: 119 files / 1351 tests passed** before its new feature changes. The older candidate's focused 225 tests, WebKit 2/2 and guard 22/22 are **historical scoped evidence**, not fresh runs by this reconciliation. No new Notification Reliability feature was verified at the time this appendix was drafted. This source census ran no app tests, builds, servers, cloud-service calls or Production mutations.

### Exact remote object checks and classification vocabulary

GitHub read-only object queries at **2026-11-04 00:39:31 UTC** returned the exact main Commit object `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526`. The same authenticated repository queries returned null, without query errors, for the exact Production Hosting, V2 RC, original V3, Multi-Photo and audit anchors listed below. Those anchors exist locally; remote non-retrieval is not local source loss and does not prove permanent deletion from all GitHub storage. No source was uploaded to repair reachability.

| Anchor | Full SHA | Local | Verified existing backup | Exact GitHub object retrieval | Deployed / integrated |
|---|---|---|---|---|---|
| Main | `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526` | YES | YES | Commit | Main; not current Hosting |
| Hosting release | `b7b0eeac5374a8ffb072972c671f8803b680a1a0` | YES | NO | null | Hosting; not main |
| V2 RC | `7f941b7ace071777353d68c6c0cd1ff5656453f7` | YES | YES | null | Not established |
| Original V3 | `1a0e38c74f23a23c6fb9d4ee528e10c8f84d09b6` | YES | YES | null | Not established |
| Multi-Photo | `ba3fa84a18e1afb6349e9a31b9d3a0320de20316` | YES | YES | null | Inherited by Hosting composition |
| Preservation audit | `4b4a60a031721a22bffbd903f4efadc100812f8c` | YES | Separate audit bundle | null | Documentation only |

Required top-level classifications supplement, rather than replace, the precise evidence labels on each stream:

| Stream | Classification | Reason / next permitted action |
|---|---|---|
| Registry + retained main reference | CANONICAL | Ledger authority and main reference; no claim main equals deployed source |
| Verified Hosting release | IN PRODUCTION; LOCAL-ONLY AT RISK | Fresh Hosting marker; newer two commits absent from existing backup |
| Multi-Photo + Node22 ancestors | PRESERVE | Reused in deployed composition; do not redeploy original branches |
| V2 pilots/RC, V3 variants, Visual Studio | ACTIVE EXPERIMENT; PRESERVE | Independent presentation implementations; visual owner review required |
| New Cleaner Hub visual branch | ACTIVE EXPERIMENT; LOCAL-ONLY AT RISK | Active changing prototype; auth/backend integration UNKNOWN |
| Intake / Telemetry mixed WIP | ACTIVE EXPERIMENT; PRESERVE | Mixed unpublished changes; isolate before integration |
| Offers, Weekly Close, Sandbox, historical FCM | PRESERVE | Existing implementation ancestors; current behavior needs scoped evidence |
| OneSignal cutover / notification history prototype | PRESERVE | Cutover parked; demo history is not a connected durable inbox |
| New notification reliability candidate | ACTIVE EXPERIMENT; LOCAL-ONLY AT RISK | Functional local tests, no push/deploy; final integration evidence below |
| Notion integration, missing former uncommitted trees | UNKNOWN | No verified connected implementation / lost-WIP completeness proof |

No stream is labelled READY TO INTEGRATE or SUPERSEDED WITH EVIDENCE solely because it shares ancestry or passes tests. This run creates local checkpoints only.

### Final local implementation receipt

Local functional checkpoint **`a931468262252c2d46bb0405d7519995fc2d7bb4`** on
`codex/notification-reliability-v1-2026-11-03` contains31 implementation/test files,
with no CSS/layout/provider cutover. Its final verification is **19 files /311
focused;124 files /1458 unit;84 isolated emulator/security;25 environment/runtime/
Hosting guards;2 Chromium/WebKit worker tests**, plus synthetic Production and
Sandbox builds and diff check. These are local tests, not a deployment or physical
phone proof. See `NOTIFICATION_RELIABILITY_VALIDATION_2026-11-03.md`.

The final preservation read at **2026-11-04 01:25:27 UTC** found main/origin and stash
unchanged. Only this candidate and independently active Cleaner Hub branch tips
had advanced. Eighteen other worktrees retained both HEAD and status hashes;
the primary retained HEAD and all114 previously surveyed source hashes, while
untracked artifact counts grew (including Cleaner Hub artifacts). No claim that
all active work was frozen or that new external artifacts were audited is made.
All original STOP files/history were outside this change set and remain preserved.

Issue83 metadata checkpoint was posted and read back:
https://github.com/irvingellan/cleanflow/issues/83#issuecomment-6619964559
No code/source ZIP, private incident data or absolute user paths were uploaded.
This new checkpoint is outside the old verified backups; same-disk handoff ZIPs
are review evidence, not off-device source protection.

### Per-stream source, dependency and continuation records

The records below cover the active and preservation-critical streams. Unrelated historical branches are not restated as additional features; their complete metadata remains in `branches.csv` and the immutable ledger above. `NO_UPSTREAM` means no configured Git upstream at capture, not absence from every possible remote history. WIP counts are the frozen census values unless explicitly marked as a later observation. Test files or documentation alone are never a passing-test claim.

**Core source baseline.** Purpose: retained Production-compatible core and operational history. Source `main` at **`8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526`**; no dedicated registered main worktree, because `<PRIMARY>` is on Intake. Upstream `origin/main` matches exactly; ahead/behind main 0/0. The verified modern bundle contains this history. Current Hosting is the later `b7b0eea` composition, not this main tip. Validation: no fresh main test run in this census; the new assignment's fresh unit evidence is tied to its `b7b0eea` baseline. Classification **RETAINED_CORE_REFERENCE**. Recommendation: compare existing core services before new work; do not switch or clean the active primary tree.

**Reservation Intake bridge.** Purpose: structured Intake/review experiment plus subsequent local review changes. Source `feature/reservation-intake-bridge-v0-2026-10-04` at **`177e38d8527e94895ac885673ad22066e9aef936`**, `<PRIMARY>`; tracked/untracked 30/312, ahead/behind main 5/0. Upstream `origin/feature/reservation-intake-bridge-v0-2026-10-04` is **`af6e4c689d0963367c9c0fee9dbb9df7a90df912`**: three unpublished commits plus WIP. The current mixed WIP also touches Telemetry; it is not a single clean Intake release. Dependencies: existing domain/services/Rules and explicit manager review, with no automatic operational assignment. Backup: committed tip present and earlier allowlisted source snapshots verified; new outputs/WIP are not an ongoing backup. Deployment and fresh end-to-end acceptance of this tip/WIP **UNKNOWN**; current Production Hosting is another lineage. Classification **EXPERIMENTAL_LOCAL_SOURCE / ACTIVE_MIXED_WIP**. Recommendation: let owners finish, preserve Intake and Telemetry separately, then compare source/tests before any authorized integration.

**Telemetry baseline and local continuation.** Historical baseline `feature/manager-operation-telemetry-v2-2026-09-29` at **`0a738b55f8613380fea2584cd618001287cfc12d`** has an exact matching configured origin upstream and no registered worktree; ahead/behind main 1/66. Existing documentation records deployed allowlisted operation diagnostics, not an adoption or time-to-actionable metric. Additional telemetry/quality work lives in the primary mixed WIP above and the **DETACHED** checkout at **`177e38d8527e94895ac885673ad22066e9aef936`**, `<CODEX_TASKS>/2026-10-08/goal-investigue-a-falha-intermitente-do/work/development-intelligence-v2/cleanflow`, tracked/untracked 7/2 and no upstream. Dependencies: manager authorization, bounded allowlists and existing deterministic telemetry services; do not merge its backend/Rules changes incidentally into photo or notification work. The modern bundle and prior detached allowlisted snapshots are verified; the detached tree shares the canonical Git DB. Fresh behavior/deployment evidence for this WIP is **UNKNOWN**. Classification **DEPLOYED_HISTORICAL_BASELINE_WITH_SEPARATE_LOCAL_WIP**. Recommendation: preserve/compare the variants; do not infer that deployed telemetry proves authenticated real-user instrumentation or that a detached tree is an independent backup.

**Checklist completion and private-origin boundary.** Purpose: completion confirmation/receipt UX and exact private test origin. Anchors: `codex/cleaner-checklist-completion-ux` **`f6eaff5a5aae32f34e2b27d6bec6ff03413ef6c0`**, `<CODEX_WORKTREES>/cleaner-checklist-completion-ux/Clean Flow Gabriela`, 0/71; `codex/checklist-completion-production-candidate` **`911d558a572e443d86d77e3ee367991d0b2832c7`**, `<CODEX_WORKTREES>/checklist-completion-integration/Clean Flow Gabriela`, 0/102; `codex/checklist-private-origin-test` **`82ead8c356dc32f1aadbaf3d739f614748c3d5e1`**, `<CODEX_WORKTREES>/checklist-private-origin/Clean Flow Gabriela`, 0/19. All three are NO_UPSTREAM and backed by the verified modern bundle; ahead main 2/2/3 respectively. Dependencies: preserve manager authorization, public capability context and explicit server receipt. Multi-Photo already inherits the candidate/tests/origin boundary, and Hosting `b7b0eea` inherits that composition. Historical component/E2E evidence remains scoped; no new physical acceptance was run here. Classification **REUSED_ANCESTRAL_IMPLEMENTATION / ORIGINALS_PRESERVED**. Recommendation: do not reapply these ancestors or broaden private-origin access when extending the descendant.

**Multi-Photo 20, optimizer and review readers.** Source `codex/checklist-multi-photo-v1` at **`ba3fa84a18e1afb6349e9a31b9d3a0320de20316`**, `<CODEX_WORKTREES>/checklist-multi-photo-v1/Clean Flow Gabriela`, 0/3; NO_UPSTREAM, ahead/behind main 13/0. Purpose: saved/pending limits, byte ledger, sequential optimization, gallery, removal/readiness and compatible manager/report readers. Dependencies: inherited completion/private-origin, frozen legacy versus policy2 contracts, Storage SDK 7.22.0 and private capability authorization. The modern bundle covers this anchor; private helpers have separate metadata and earlier scoped snapshots. Its frontend is inherited by deployed Hosting `b7b0eea`; backend runtime/revision metadata must remain target-specific. Historical broad/focused/security/browser evidence is recorded in the Multi-Photo/candidate documents; the current assignment's fresh unit baseline is separate. Remaining physical/installed-PWA/reliable real-cleaner acceptance is not established by this census. Classification **IMPLEMENTED_DESCENDANT / REUSED_IN_HOSTING_COMPOSITION**. Recommendation: preserve policy2 readers/writers, gallery/order/retry semantics and legacy separation; avoid reimplementation or blind single-photo rollback.

**Integrated Multi-Photo + Node22 release source.** Source `codex/multi-photo-node22-release-candidate` at **`b7b0eeac5374a8ffb072972c671f8803b680a1a0`**, implementation checkpoint **`3f21ab5dfad6cf6ab4e85ab9d32b9e18d3464912`**, `<CODEX_WORKTREES>/multi-photo-node22-release/Clean Flow Gabriela`, 0/2; NO_UPSTREAM, ahead/behind main 15/0. Purpose: reuse Multi-Photo byte-for-byte apart from the narrow Node22/PolicyB composition; the final `b7b0eea` commit is documentation. Dependencies: original Multi-Photo and selected Node22 policy, not V2/V3 visual siblings or Intake WIP. Hosting is freshly verified at this exact SHA; Function provenance remains per target as stated above. Validation: fresh 119-file/1351-test unit baseline reported by the current assignment, plus explicitly historical focused/browser/guard receipts. **Backup gap:** both `3f21ab5…` and `b7b0eea…` are absent from the existing verified modern backup. Classification **OBSERVED_PRODUCTION_HOSTING_SOURCE / LOCAL_HISTORY_BACKUP_GAP**. Recommendation: use as the functional baseline, keep rollback policy2-compatible, and preserve the two missing commits under separately authorized private-backup work; no new backup was created by this census.

**Node22/PolicyB original.** Source `codex/functions-node22-migration` at **`1d8a6b6940f7f7651ab5ce1dd2f467641860d4b1`**, `<CODEX_WORKTREES>/functions-node22-migration/Clean Flow Gabriela`, 0/0; NO_UPSTREAM, ahead/behind main 4/0, verified modern backup present. Purpose: runtime22 and `preserveExternalChanges:true`/numeric maxInstances20 policy. That policy was selectively reused in `3f21ab5…`; this is not a wholesale ancestry merge. Fresh metadata now shows 31/31 Node22, so the older 26/5 runtime census is historical. Original STOP/recovery records remain provenance; this read does not itself authorize or clear any future release gate. Runtime/serialization tests are historical; current baseline units are separately reported. Classification **POLICY_REUSED / CURRENT_RUNTIME_METADATA_CONFIRMED / ORIGINAL_PRESERVED**. Recommendation: retain engine22, max20 and preserveExternalChanges while reconciling future source; do not replay old rollout target lists or infer all backend source equals the Hosting SHA.

**V2 foundation, module pilots and selective RC.** Purpose: token/primitives/shell and observed manager Dashboard/Services/Job Detail presentation work. Immutable anchors remain:

| Full branch | Full SHA | Location/state at census |
|---|---|---|
| `feature/design-system-v2-foundation` | `e4a3cfc9862e75b8680c237804fe703a3e45fd6b` | historical source tree unregistered; parent remnant only |
| `feature/design-system-v2-shell-pilot` | `84cfcb413fa7ea2de5a7de7cd442035e9570a7e1` | `<CODEX_WORKTREES>/design-system-v2-shell-pilot`; 0/0 |
| `feature/design-system-v2-services-pilot` | `37dbcc8b35822017fda142fd2ca8792f4ffb6084` | `<CODEX_WORKTREES>/design-system-v2-services-pilot`; 0/0 |
| `feature/design-system-v2-dashboard-pilot` | `ac2c2fdbb1ff7187d2dc53683be088c9fe312447` | `<CODEX_WORKTREES>/design-system-v2-dashboard-pilot`; 6/0 |
| `feature/design-system-v2-job-detail-f1` | `1961aa48057b1d772bc8ee8bd307057775c63056` | `<CODEX_WORKTREES>/design-system-v2-job-detail-f1/Clean Flow Gabriela`; 0/0 |
| `feature/design-system-v2-job-detail-f2` | `9b6ec19a5bb3b73e1ce2bac04a7caa363ed3739f` | `<CODEX_WORKTREES>/design-system-v2-job-detail-f2/Clean Flow Gabriela`; 0/0 |
| `feature/design-system-v2-job-detail-complete` | `7adec211d5bf0848191d442be664e9caac03ded6` | `<CODEX_WORKTREES>/design-system-v2-job-detail-complete/Clean Flow Gabriela`; 0/0 |
| `feature/design-system-v2-integrated-experience` | `668732955140c5450205ce2cd38aaf759160abf8` | historical source tree absent/unregistered |
| `feature/design-system-v2-authenticated-review` | `7705efb374b8e60953b1d0b04a4a282fa640a2bf` | historical source tree unregistered; parent remnant only |
| `feature/design-system-v2-production-rc` | `7f941b7ace071777353d68c6c0cd1ff5656453f7` | `<CODEX_WORKTREES>/design-system-v2-production-rc/Clean Flow Gabriela`; 0/0 |

All are NO_UPSTREAM and their committed objects are in the verified modern backup. Exact ahead/behind values remain in `branches.csv`. The RC is a selective import, not an ancestry merge of every pilot. Dashboard's six tracked edits include independent source differences; the previously documented JSX-versus-RC differences remain preservation evidence, not a deletion rationale. Prior test/catalog/authenticated-harness records are historical and were not rerun. No fresh Production deployment proof is assigned to these branch tips. Dependencies: preserve provider boundaries, V2 provenance and original Dashboard WIP; V3 consumers may reuse the RC foundation selectively. Classification **SELECTIVE_IMPORT_PROVENANCE / PILOTS_AND_WIP_PRESERVED**. Recommendation: reuse exact existing components after comparison; no wholesale merge or cleanup. Former uncommitted state of the three missing trees remains **UNKNOWN**.

**V3 reference prototype and Codex hybrid/repair.** Purpose: compare manager interaction/layout alternatives and integrate selected presentation changes. Source `feature/manager-workspace-v3-prototype` **`1a0e38c74f23a23c6fb9d4ee528e10c8f84d09b6`**, `<CODEX_WORKTREES>/manager-workspace-v3-prototype/Clean Flow Gabriela`, 0/2; `codex/manager-workspace-v3-hybrid` **`2f7403f2b9c099947e7c43f5197c01408d6cff50`**, no separate registered worktree; `codex/workspace-v3-visual-loading-repair` **`21feba5e772f2b8fa98a3418231e0ceb8f549ed3`**, `<CODEX_WORKTREES>/manager-workspace-v3-hybrid/Clean Flow Gabriela`, 0/0. All NO_UPSTREAM and modern-backup covered; ahead main 3/4/8 respectively. The reference prototype and hybrid are siblings; the repair's benchmark depends on reference prototype source. Historical Sandbox preview and harness evidence are not current Production or physical validation. Classification **REFERENCE_AND_INTEGRATION_SIBLINGS / PRESERVE_DEPENDENCY**. Recommendation: visual direction remains with the visual owner; preserve reference source and compare frontend hotspots before any authorized integration with the functional release baseline.

**Visual Studio / component-and-model foundation.** Source `feature/gabi-visual-studio` **`b17474caf91d547daa5facd7f7e529864a39eb47`**, `<CODEX_WORKTREES>/gabi-visual-studio/Clean Flow Gabriela`, 0/2; NO_UPSTREAM, ahead/behind main 16/0. Purpose: actual code under `src/prototypes/manager-workspace-v3/` for layouts, cleaner views, photo-batch demonstration, modeled notifications, strategies, modeling/studio tooling and handoff contracts. This is more than a design document, but it is prototype code and not proof of connected Production workflows. Dependencies: the reference/RC presentation lineage and demo model; do not infer that it incorporates the independent functional release's backend. Test sources exist; no fresh run or physical acceptance is claimed here. The existing full modern backup lacks **13 commits through this tip**. Classification **IMPLEMENTED_VISUAL_DEMO / PRODUCTION_INTEGRATION_UNKNOWN / BACKUP_GAP**. Recommendation: preserve source/visual ownership and pass explicit UI contracts to functional work; do not merge all presentation history simply to obtain a component.

**Cleaner Hub, device-health and notification-status visual foundation.** Later immutable observation: `feature/cleaner-hub-v1-visual` **`08390b6f2f19c32c77a7808f17fbc9056f6ec90f`**, `<CODEX_WORKTREES>/cleaner-hub-v1-visual/Clean Flow Gabriela`; NO_UPSTREAM. The earlier frozen census had this branch at `b17474c…` with active WIP; it subsequently advanced independently by five commits: **`1130d36ff6b58e0570b33b78498a96ab08caabaa`**, **`28a3cf905ce4261642756ed7d18c24475a165373`**, **`4c4057c9780040ac1ab6743351e45c2204655d7a`**, **`7ea087ec3cad4d06962dd628c7aa413d06f83c27`**, **`08390b6f2f19c32c77a7808f17fbc9056f6ec90f`**. A later status read showed only the existing dependency symlinks, but this active tree was not frozen and no ongoing-stability claim is made.

Actual source includes `hub/CleanerHub.jsx`, `AwayCenter.jsx`, `DeviceHealth.jsx`, `InstallGuide.jsx`, `hubModel.js`, associated tests, and typed `DEVICE_HEALTH_UI_PROPS` / `NOTIFICATION_INBOX_UI_PROPS` contracts. The tracked implementation imports demo data and stores demo state in localStorage. Thus it supplies reusable prototype components/state presentation; it does **not** establish an authenticated persistent Cleaner Hub, real device-health measurement, installed-PWA success or delivered notifications. Four visual contract documents add scope guidance, not backend proof. No tests were run by this census and no Production deployment is established for this branch. Dependencies: Visual Studio `b17474c…`, explicit backend-to-UI contracts and future authenticated/persistence work. The existing backup already lacked the 13 parent-lineage commits and does not contain these five newer commits. Classification **IMPLEMENTED_VISUAL_PROTOTYPE / AUTH_PERSISTENCE_AND_REAL_DELIVERY_UNKNOWN / ACTIVE_BACKUP_GAP**. Recommendation: reuse and adapt the components within the functional branch's tested service boundaries; keep prototype/device status labels honest and preserve the visual owner's work.

**Notion Property Directory / import foundation.** Source evidence is deliberately narrow: `main` **`8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526`** and the Visual Studio documentation record that selected Properties were historically imported after explicit selection/preview and duplicate reconciliation, while the broader system-of-record transition remains incomplete. At the inspected immutable source anchors, Notion matches were confined to documentation; no tracked Notion connector or import-related implementation path was identified in main's `src`/scripts listing. Therefore neither “no import ever occurred” nor “Notion migration/integration is complete” is supported.

The shared stash **`d4e898e47238313c70b9fe796555e58a76f8bef2`** contains generic import-preview source; it is **not evidence of a Notion-specific connector or complete migration**. Eleven allowlisted stash source/config/doc snapshots are privately hash-verified, but five raw fixture payloads remain excluded and a complete separately backed-up stash is not established. There is no identified active Notion implementation branch/worktree/upstream; current implementation scope, test/deployment completeness and remaining records are **UNKNOWN**. Classification **DOCUMENTED_OPERATIONAL_HISTORY / IMPLEMENTATION_AND_MIGRATION_SCOPE_UNKNOWN**. Recommendation: reconcile existing generic import source and explicitly authorized migration evidence before building or repeating an import; do not inspect/copy private fixture contents or rewrite production records under this source audit.

**Notification Reliability implementation assignment.** Source branch `codex/notification-reliability-v1-2026-11-03`, initial baseline **`b7b0eeac5374a8ffb072972c671f8803b680a1a0`**, `<CODEX_WORKTREES>/notification-reliability-v1-20261103/Clean Flow Gabriela`; NO_UPSTREAM. The frozen census recorded 0 tracked / 2 untracked dependency symlinks and ahead/behind main 15/0. Subsequent files belong to the active assignment and must not be treated as captured/stable by this census; its final implementation HEAD and checks belong in that assignment's delivery checkpoint. Purpose: functional notification reliability on the observed deployed baseline, reusing existing services and explicit visual contracts. Fresh baseline units: 119 files/1351 tests passed; **new feature behavior, device delivery and Production availability were not yet verified when this appendix was drafted**. Initial committed history shares the two-commit release backup gap; later edits/commits require their own preservation record. Classification **ACTIVE_FUNCTIONAL_ASSIGNMENT / VALIDATION_AND_FINAL_HEAD_PENDING**. Recommendation: keep new functional work separate from active visual ownership, test its real service/permission boundaries, and record delivery/installation/observation facts independently.

**Held cleaner-count policy.** `hold/required-cleaner-count-2026-09-27` at **`c5b3f844f9eb71ef53dfdc1930c1678307fece82`**, no registered worktree; no configured upstream, but exact remote-name/tip match exists. Ahead/behind main 0/82, verified modern backup present. Purpose: preserved rejected/held policy provenance, not a feature backlog item to reactivate. Deployment/fresh tests for this held branch are not established by the audit. Classification remains **BLOCKED / PRESERVED**. Recommendation: keep the hold; do not restore its assignment/count gate as an incidental dependency of Cleaner Hub, notifications or a visual merge.

**Source audit ledger and private legacy.** `codex/source-preservation-audit-83` at **`4b4a60a031721a22bffbd903f4efadc100812f8c`**, `<CODEX_WORKTREES>/source-preservation-audit-83/Clean Flow Gabriela`, 0/0, NO_UPSTREAM, ahead main 1. It is documentation-only, not deployed application source. It is covered by the separately verified audit-ledger bundle, although absent from the earlier full modern bundle. `backup-pre-public` at **`d7a7e727250e31d3fb88b1b836a38e8604d69404`** has no registered worktree/upstream; its exact-tip historical Desktop bundle is verified separately and its private content was not inspected/copied. Classification **PRESERVATION_PROVENANCE / NO_RELEASE_MEANING**. Recommendation: retain both; neither a review ZIP nor the shared Git DB replaces their private source backup.

### Verified backup scope, unresolved gaps and non-destructive next steps

The existing same-Mac private backup remains `<PRIVATE_BACKUP_ROOT>/issue83-20261021T204427Z`; actual paths stay private. Full modern, earlier modern and audit-ledger bundles match their original manifest SHA-256 values, pass `git bundle verify`, report complete history and exactly match the refs of their pre-existing independent bare verifiers; each verifier passes read-only fsck and has no object alternates. **291 earlier private source files**—64 WIP source/docs, 216 ignored helpers and 11 stash source/config/docs—match their saved hashes. This verifies saved snapshots, not continuing capture or disk-loss protection. Backup and source were observed on the same local filesystem volume.

| Existing bundle | Bytes | SHA-256 |
|---|---:|---|
| Full modern + opaque Codex checkpoints | 151964133 | `e09215a3ecba834cc17f6d23f8bd9a1e7e6d3c6849abc650272fdbc811a54f08` |
| Earlier modern | 2621812 | `6f0b4f5c7eb8e822c589f3650e9cb895ae31caaaa15d916e735cdee35d685723` |
| Audit ledger | 1193123 | `f519e291fbfddf836b6d98c6613e48c6ff2193b4b951d11286e219247b3ad31f` |
| Historical private pre-public | 410493 | `807679c9323e9629e907d30fc753b7fff383c3fe9177caee69431bbeafdd3ada` |

Unresolved preservation gaps are explicit:

1. The existing modern source backup lacks release commits **`3f21ab5dfad6cf6ab4e85ab9d32b9e18d3464912`** and **`b7b0eeac5374a8ffb072972c671f8803b680a1a0`**, 13 Visual Studio-lineage commits through **`b17474caf91d547daa5facd7f7e529864a39eb47`**, the five later Cleaner Hub commits above, and ongoing Notification Reliability work. Duplicate branch tips do not add distinct committed history, but are still separate continuation contexts.
2. New opaque Codex TREE **`e6ae3f421e45f9ae65785d485ab52a1065b4c8df`** is absent from the verified full backup. Two prior ref names for TREE **`7bda6d689476d4433d9b4bdc15f71a9a8c3e66ef`** are no longer current, but their old object/ref snapshots remain preserved in that backup. Payloads were not inspected or copied. Tree objects are not labelled application commits.
3. Canonical `fsck --full --no-reflogs --unreachable` returned **8**, solely with invalid `refs/.DS_Store` ref-name/content diagnostics. It enumerated 11 unreachable commits / 169 trees / 62 blobs. The older ten unreachable commits are backed up; new commit **`25361d365e89a0afa2ed858960599db7c129bc15`** is not. Its parent is **`1a0e38c74f23a23c6fb9d4ee528e10c8f84d09b6`** and tree **`9298a2680c571b5be37c734bdd6ae0fe11dbe185`**. Across all enumerated unreachable objects, one commit / 147 trees / 55 blobs are absent from the full backup. Their payload/usefulness remains unclassified. This is not a clean canonical fsck result or permission to repair it.
4. Stash fixture payloads `cleaners.csv`, `clients.csv`, `existingRecords.json`, `jobs.csv`, `properties.csv` remain excluded. Full-stash recoverability outside the canonical DB is **NOT VERIFIED**. Former uncommitted state of the three missing historical V2 trees remains **UNKNOWN**.

No source/backup payload was newly copied/restored, no new recovery ref was written and no app tree was edited by the census. No reset/clean/GC/prune/deletion, stash apply/drop, merge/rebase/cherry-pick, push, upload, app tests/builds or Production mutation occurred. The only remote Git operation was authorized `ls-remote`. Preserve these gaps for the next explicitly scoped private backup/reconciliation action; do not convert risk labels, selective duplication, an old STOP, a successful metadata read or a review ZIP into automatic integration, cleanup or deployment permission.


<details>
<summary>Historical21October2026audit — not the current deployment/source census</summary>


Issue #83. Canonical reconciliation ledger; source inventory, not merge/release approval.
Observed `2026-10-21T20:40:10.084468+00:00`. Exact paths and per-file WIP metadata are in the
private local companion inventory, deliberately not committed/publicly posted.

## Boundaries and authoritative baselines

- Source main, cached origin/main and fresh `ls-remote`: `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526`.
- Public Production Hosting `/version.json`: `5c2e52492331577a7cbdc4aa41a8f1a6b9771b45`,
  environment production / project clean-flow-prototipo. Main differs only in
  CURRENT_STATE documentation. Never equate source main, Sandbox and Production.
- Read-only deployed Function metadata:31 ACTIVE,26 nodejs22 /5 nodejs20.
  Remaining20: publicChecklist, publicClientReport, publicOffer,
  sendTodayExecutionReminder, sendTomorrowPlanningReminder. This proves runtime,
  not a complete source-SHA/capacity correspondence. Existing Node22 STOP remains.
- No customer collection/log/photo reads, Production mutation, Firebase changes,
  billing, merge, cherry-pick, push, cleanup, reset, prune or GC. No app tests,
  builds or dev servers were needed/started for this Git-only audit.
- Git reads use GIT_OPTIONAL_LOCKS=0; no source worktree/index writes. Multiple
  live agent processes were detected at the primary checkout; no interruption.
  A new app-managed isolated audit tree is the only new worktree.

## Coverage and what is / is not a separate backup

17 registered worktrees including this audit, 57 local branches,
37 live remote heads,1 stash. One canonical Git object database.
Home source roots/Documents/Projects/Desktop/Downloads/.codex/.claude and Codex
project/artifact registry were reconciled, including Claude app-managed shadow
metadata. No independent current CleanFlow clone was found. The extra Codex task
checkout is linked/detached, not a second object backup. Claude's matching
git-shadow pair points to the canonical objects and identical refs, not an
independent backup. Eight other shadow identities belong to other products.
No app/session DBs/transcripts or customer archives were opened. Dependencies,
caches, symlink targets and unrelated private Library payloads were excluded;
this is not a claim to inspect every arbitrary personal/archive location.

Three old worktree source paths are absent/unregistered: V2 foundation,
integrated and authenticated-review. Their parent remnants contain only app-name
metadata / DS_Store. Their named branch tips/source objects remain available and
are privately preserved. Prior uncommitted state of those absent trees cannot be
reconstructed solely from branch refs; do not claim it never existed.

31 existing CleanFlow handoff ZIPs were inspected by central-directory metadata:
none contains Git bundles/repository/source/patch files. They are review evidence,
not source backups. Original Claude design ZIPs and a small historical Firebase
prototype remain reference artifacts, not current Git history.

## Exact worktrees at census

DIRTY includes untracked artifacts/symlinks; tracked/source counts are separate.
Stashes belong to the shared common Git DB, not uniquely to each worktree.
Branch/upstream and all commits not in main are enumerated in the companion JSON.
This table precedes the audit's own documentation commit; its final exact audit
HEAD is recorded separately in the final private inventory/checkpoint, avoiding
a self-referential SHA. All application worktree HEADs are rechecked at closure.

| Branch | Exact HEAD | Location alias | Tracked WIP / untracked files | Ahead main | Purpose / release |
|---|---|---|---:|---:|---|
| `feature/reservation-intake-bridge-v0-2026-10-04` | `177e38d8527e94895ac885673ad22066e9aef936` | `<PRIMARY>` | 30 / 142 | 5 | Reservation Intake bridge + subsequent local review/telemetry WIP; not Production; isolated source |
| `codex/checklist-completion-production-candidate` | `911d558a572e443d86d77e3ee367991d0b2832c7` | `<CODEX_WORKTREES>/checklist-completion-integration/Clean Flow Gabriela` | 0 / 102 | 2 | Production-compatible completion UX + test checkpoint; not Production; isolated source |
| `codex/checklist-multi-photo-v1` | `ba3fa84a18e1afb6349e9a31b9d3a0320de20316` | `<CODEX_WORKTREES>/checklist-multi-photo-v1/Clean Flow Gabriela` | 0 / 3 | 13 | Multi-Photo20 / optimizer / private review-report support; not Production; isolated source |
| `codex/checklist-private-origin-test` | `82ead8c356dc32f1aadbaf3d739f614748c3d5e1` | `<CODEX_WORKTREES>/checklist-private-origin/Clean Flow Gabriela` | 0 / 19 | 3 | Exact private-emulator-origin test boundary; not Production; isolated source |
| `codex/cleaner-checklist-completion-ux` | `f6eaff5a5aae32f34e2b27d6bec6ff03413ef6c0` | `<CODEX_WORKTREES>/cleaner-checklist-completion-ux/Clean Flow Gabriela` | 0 / 71 | 2 | Original completion UX source; not Production; isolated source |
| `feature/design-system-v2-dashboard-pilot` | `ac2c2fdbb1ff7187d2dc53683be088c9fe312447` | `<CODEX_WORKTREES>/design-system-v2-dashboard-pilot` | 6 / 0 | 3 | V2 dashboard-pilot; not Production; isolated source |
| `feature/design-system-v2-job-detail-complete` | `7adec211d5bf0848191d442be664e9caac03ded6` | `<CODEX_WORKTREES>/design-system-v2-job-detail-complete/Clean Flow Gabriela` | 0 / 0 | 5 | V2 job-detail-complete; not Production; isolated source |
| `feature/design-system-v2-job-detail-f1` | `1961aa48057b1d772bc8ee8bd307057775c63056` | `<CODEX_WORKTREES>/design-system-v2-job-detail-f1/Clean Flow Gabriela` | 0 / 0 | 3 | V2 job-detail-f1; not Production; isolated source |
| `feature/design-system-v2-job-detail-f2` | `9b6ec19a5bb3b73e1ce2bac04a7caa363ed3739f` | `<CODEX_WORKTREES>/design-system-v2-job-detail-f2/Clean Flow Gabriela` | 0 / 0 | 4 | V2 job-detail-f2; not Production; isolated source |
| `feature/design-system-v2-production-rc` | `7f941b7ace071777353d68c6c0cd1ff5656453f7` | `<CODEX_WORKTREES>/design-system-v2-production-rc/Clean Flow Gabriela` | 0 / 0 | 2 | V2 production-rc; not Production; isolated source |
| `feature/design-system-v2-services-pilot` | `37dbcc8b35822017fda142fd2ca8792f4ffb6084` | `<CODEX_WORKTREES>/design-system-v2-services-pilot` | 0 / 0 | 5 | V2 services-pilot; not Production; isolated source |
| `feature/design-system-v2-shell-pilot` | `84cfcb413fa7ea2de5a7de7cd442035e9570a7e1` | `<CODEX_WORKTREES>/design-system-v2-shell-pilot` | 0 / 0 | 4 | V2 shell-pilot; not Production; isolated source |
| `codex/functions-node22-migration` | `1d8a6b6940f7f7651ab5ce1dd2f467641860d4b1` | `<CODEX_WORKTREES>/functions-node22-migration/Clean Flow Gabriela` | 0 / 0 | 4 | Node22 runtime / capacity-policy migration; STOP active; partial runtime deployment; STOP |
| `codex/workspace-v3-visual-loading-repair` | `21feba5e772f2b8fa98a3418231e0ceb8f549ed3` | `<CODEX_WORKTREES>/manager-workspace-v3-hybrid/Clean Flow Gabriela` | 0 / 0 | 8 | V3 visual/loading continuation; Claude owns future visuals; Sandbox preview previously published; not Production |
| `feature/manager-workspace-v3-prototype` | `1a0e38c74f23a23c6fb9d4ee528e10c8f84d09b6` | `<CODEX_WORKTREES>/manager-workspace-v3-prototype/Clean Flow Gabriela` | 0 / 2 | 3 | Claude V3 reference React prototype; not Production; isolated source |
| `codex/source-preservation-audit-83` | `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526` | `<CODEX_WORKTREES>/source-preservation-audit-83/Clean Flow Gabriela` | 0 / 0 | 0 | Issue83 documentation-only inventory (this branch); local docs-only; no push |
| `DETACHED` | `177e38d8527e94895ac885673ad22066e9aef936` | `<CODEX_TASKS>/2026-10-08/goal-investigue-a-falha-intermitente-do/work/development-intelligence-v2/cleanflow` | 7 / 2 | 5 | Detached development-intelligence / Telemetry WIP; not Production; isolated source |

## Critical exact checkpoints and dependency map

```text
main8bc7016
├─ V2 foundation e4a3cfc → separate shell/services/dashboard/JobDetail pilots
│  └─ integrated6687329 → authenticated-review7705efb
├─ selective Production-compatible RC7f941b7 (NOT ancestry merge of pilots)
│  ├─ Claude V3 prototype1a0e38c
│  └─ Codex hybrid2f7403f → visual/loading repair21feba5
├─ completion576afd1 → tests911d558 → exact-origin82ead8c
│  └─ Multi-Photo implementationcc1bf99 → integratione231120
│     → review588a1fd → functional readinessba3fa84
└─ Node22 PolicyB1d8a6b6 (independent; STOP / partial cloud migration)
```

Full immutable SHAs are in the tables. Additional checkpoint anchors:

| Checkpoint | Exact SHA | Meaning |
|---|---|---|
| `576afd1` | `576afd1ec5fc3717f3b44f1544713f2ca828ecfb` | Production-compatible completion implementation |
| `897b423` | `897b423b6a95d33c90166540fb90a3450f7f9daa` | Original completion UX implementation |
| `d46d9cd` | `d46d9cd3820fe4cb2204b40e64104f7193465ecb` | Initial real V3 hybrid integration |
| `b94995d` | `b94995debb14caee0ddd3b03f3c4203ba9af2272` | V3 visual/loading repair |
| `498933f` | `498933f81497874ad768991e375976ed0949ec4c` | V3 visual benchmark/authenticated repair gate |
| `364f33a` | `364f33a87153228f955dd1246aaf8e281c3a5f10` | V3 account/settings/loading-motion checkpoint |
| `cc1bf99` | `cc1bf99b35d615f4e6b2bc47ef2775fc50b0c57d` | Multi-Photo token-scope implementation repair |
| `e231120` | `e23112002a6ee79de756916ff427fc1b3989b00a` | Actual backend Multi-Photo integration |
| `588a1fd` | `588a1fd5fb4928fc3570581f689a2dc9bbc39631` | Prior Multi-Photo release review |
| `ba3fa84` | `ba3fa84a18e1afb6349e9a31b9d3a0320de20316` | Current Multi-Photo functional-only revalidation |

## Duplication, overlap and preservation rules

- V2 RC is a selective import/squash onto main, not an ancestry merge of pilots.
  Of42 distinct post-main source commits examined,42 whole-commit stable patch
  IDs differ;85 individual-file duplicate-patch groups show selective copying.
  Do not automatically discard a commit on shared-path/idea similarity.
- Accepted V2 review versus RC:80 of119 changed-path blobs identical,21 adapted,
  18 absent (largely historical docs/scripts). Preserve original branches as
  provenance, not extra features to merge wholesale.
- RC provenance explicitly captures uncommitted Dashboard source. The current
  Dashboard pilot has6 tracked edits; its two JSX blobs are not identical to any
  RC blob, while its CSS is identical. Preserve this WIP independently. Do not
  assume ac2c2fd alone reconstructs all accepted Dashboard changes.
- Original completion source was selectively ported:7 identical blobs,5 adapted
  files,2 docs omitted. Multi-Photo already inherits completion/tests/private-origin;
  reapplying those ancestors would duplicate work.
- Claude prototype and Codex hybrid are siblings, not an ancestry chain; their
  deltas share only gitignore. The repair benchmark harness uses sibling prototype
  source via @claude-v3. Do not delete the prototype merely because runtime excludes it.
- PresentationRC/repair versus Multi-Photo overlap: gitignore, CURRENT_STATE,
  translations, index.css and vite.config. Reconcile translation insertion and
  adjacent private-origin/managerExperience Vite guards. CSS hunks are disjoint.
- Node22 versus Multi-Photo overlap: CURRENT_STATE, functions/package.json,
  functions/package-lock.json, functions/src/index.js and security authorization
  tests. Preserve engine22, preserveExternalChanges:true, maxInstances:20,
  Multi-Photo storage7.22.0, quota/evidence/removal routes,60s upload timeout and
  all security tests. Identical alternate-port guard hunks need not be duplicated.
- No merge simulation was run. Shared paths/diff hunks identify reconciliation
  hotspots, not proof a merge will be conflict-free or a behavioral equivalence.

## Preservation evidence and remaining risks

Private backup location alias: `<PRIVATE_BACKUP_ROOT>/issue83-20261021T204427Z`.
Actual absolute path is only in the private companion manifest. Owner-only
directories/files and FileVault ON were verified. No remote upload/push occurred.

Committed Git bundle:108 refs /311 commits, including10 recovery refs for
otherwise unreachable commits and all5 internal Codex snapshot/turn-diff refs.
The extra unique checkpoint objects include commits
`cf3c0085cc9b32ea7bf82a13430a841cea63c79d`,
`cfe82cbb83a4fa4969cf32e425d9af0b756c636e` and TREE (not commit)
`7bda6d689476d4433d9b4bdc15f71a9a8c3e66ef`.
SHA256: `e09215a3ecba834cc17f6d23f8bd9a1e7e6d3c6849abc650272fdbc811a54f08`.
The151,964,133-byte bundle was independently restored into a new bare verifier;
all108 refs matched and fsck passed. It is separate from the canonical Git DB.
Codex snapshots include captured binary/artifact objects; they are kept opaque,
private and excluded from review delivery. The earlier smaller bundle is retained.
2,192 initial plus147 additional text-blob checks passed limited high-confidence secret-pattern scanning; this is
NOT a comprehensive PII/secret certification and does NOT authorize external sharing.
Source bundles and raw WIP snapshots never enter the review ZIP or GitHub.

64 stable allowlisted WIP source/doc files were privately copied without editing
their worktrees. Stash source/config/documentation11 files were separately preserved,
including tracked gitignore/package/package-lock snapshots plus8 untracked source
files. Its base commit is already in the preserved main history.
These are snapshots, not commits, integration approval or ongoing incremental backup.
Same physical disk is protection against accidental ref/source cleanup, not disk loss.
Off-device encrypted/private backup requires a separately approved destination.

Existing Desktop pre-public bundle: exact backup-pre-public tipd7a7e727250e31d3fb88b1b836a38e8604d69404,
410,493 bytes; bundle verification proves complete history. It was not copied into
the modern source bundle or shared; old private history stays private.

**AT RISK / BLOCKED:** stashd4e898e47238313c70b9fe796555e58a76f8bef2 remains
only as an exact Git stash in the canonical DB; its5 CSV/JSON fixture files were
not read/copied pending privacy validation. Source-only11-file snapshot cannot
restore complete stash test fixtures. No stash pop/drop/apply or ref rewrite.

**AT RISK:** primary30 tracked edits +6 untracked code files mix Intake and
Telemetry; detached telemetry7 tracked edits +1 untracked source file; Dashboard6
tracked edits. Source snapshots reduce loss risk, but streams remain uncommitted,
not remotely backed, and future edits are not captured automatically. No ownership
assumption or automatic commit was made in those active trees.

Ignored-source census additionally found311 helper/source-looking files across10
trees.216 non-generated helpers/source snapshots were privately copied:193 match
existing Git blob IDs;23 do not (including10 private Multi-Photo gateway/runtime
scripts and2 Node22 integration scripts).95 generated assets/workers were excluded.
These counts are a point-in-time census; newly created audit helper scripts are
separate audit tooling, not source changes in the inspected candidates.
Untracked screenshots, outputs, plans, design archives, dependencies/symlinks and
agent metadata remain untouched. Both inventory-visible and ignored-source
per-path omissions are explicit in the private manifest; an evidence ZIP is never
described as a complete WIP backup.

**PRESERVED / SUPERSEDED:** historical V2 module branches, old Weekly Close and
Workspace experiments remain retained; superseded is not permission to delete.
**BLOCKED:** required-cleaner-count hold stays held; do not reintroduce its policy.
**READY FOR INTEGRATION:** no branch is unconditionally cleared by this audit.
Multi-Photo is ready for controlled functional integration review after Node22
reconciliation; source retention and prior test evidence are not release approval.

## Complete local branch register

Ahead/behind are against the verified main. Local-only count is commits not
reachable from ANY live remote head (not merely a missing same-named branch).
IN_MAIN is Git ancestry; selective/cherry-picked functionality can exist even
when the original source commit is not an ancestor. Full commit IDs, merge-bases,
upstream/tracking, changed paths and remote-only branches are in companion JSON/CSV.

| Branch | Exact SHA | Ahead / behind | Local-only commits | Status | Purpose |
|---|---|---:|---:|---|---|
| `audit/pilot-legacy-compatibility-2026-09-29` | `34ecccd6f2824184b676f04c8433b66bed688a66` | 1 / 62 | 0 | PRESERVED / ISOLATED_OR_SELECTIVE | pilot-legacy-compatibility-2026-09-29 |
| `backup-pre-public` | `d7a7e727250e31d3fb88b1b836a38e8604d69404` | 69 / 170 | 69 | BLOCKED / PRESERVED | Private pre-public history; never integrate publicly |
| `codex/checklist-completion-production-candidate` | `911d558a572e443d86d77e3ee367991d0b2832c7` | 2 / 0 | 2 | INHERITED by Multi-Photo / PRESERVED | Production-compatible completion UX + test checkpoint |
| `codex/checklist-multi-photo-v1` | `ba3fa84a18e1afb6349e9a31b9d3a0320de20316` | 13 / 0 | 13 | PRESERVED / RELEASE_BLOCKED | Multi-Photo20 / optimizer / private review-report support |
| `codex/checklist-private-origin-test` | `82ead8c356dc32f1aadbaf3d739f614748c3d5e1` | 3 / 0 | 3 | INHERITED by Multi-Photo / PRESERVED | Exact private-emulator-origin test boundary |
| `codex/cleaner-checklist-completion-ux` | `f6eaff5a5aae32f34e2b27d6bec6ff03413ef6c0` | 2 / 0 | 2 | PRESERVED / ISOLATED_OR_SELECTIVE | Original completion UX source |
| `codex/functions-node22-migration` | `1d8a6b6940f7f7651ab5ce1dd2f467641860d4b1` | 4 / 0 | 4 | PRESERVED / RELEASE_BLOCKED | Node22 runtime / capacity-policy migration; STOP active |
| `codex/manager-workspace-v3-hybrid` | `2f7403f2b9c099947e7c43f5197c01408d6cff50` | 4 / 0 | 4 | SUPERSEDED by descendant repair / PRESERVED | Real manager V3 hybrid integration |
| `codex/source-preservation-audit-83` | `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526` | 0 / 0 | 0 | PRESERVED / IN_MAIN | Issue83 documentation-only inventory (this branch) |
| `codex/workspace-v3-visual-loading-repair` | `21feba5e772f2b8fa98a3418231e0ceb8f549ed3` | 8 / 0 | 8 | PRESERVED / ISOLATED_OR_SELECTIVE | V3 visual/loading continuation; Claude owns future visuals |
| `feature/audited-job-reschedule-2026-09-25` | `30f862456723a167e7bec31e21453b54b7de0549` | 0 / 87 | 0 | PRESERVED / IN_MAIN | audited-job-reschedule-2026-09-25 |
| `feature/checklist-lifecycle-recovery-2026-09-29` | `1cd4a7bc1d5246246c4c84b45946c9d738345398` | 1 / 66 | 0 | PRESERVED / ISOLATED_OR_SELECTIVE | checklist-lifecycle-recovery-2026-09-29 |
| `feature/checklist-photo-diagnostics-2026-09-28` | `aae4f1af01d8b1f928582041dafb67e87509b436` | 1 / 76 | 0 | PRESERVED / ISOLATED_OR_SELECTIVE | checklist-photo-diagnostics-2026-09-28 |
| `feature/cleaner-language-boundary-2026-09-28` | `03b21e38d0e5656cae14fc200cad73992afd3a0e` | 1 / 76 | 0 | PRESERVED / ISOLATED_OR_SELECTIVE | cleaner-language-boundary-2026-09-28 |
| `feature/compact-lifecycle-dashboard-v0-2026-10-04` | `5c2e52492331577a7cbdc4aa41a8f1a6b9771b45` | 0 / 1 | 0 | PRESERVED / IN_MAIN | compact-lifecycle-dashboard-v0-2026-10-04 |
| `feature/compatibility-cleanup-v1-2026-09-30` | `1d835a9f75660561b436f9993db6fc5791e3891e` | 0 / 52 | 0 | PRESERVED / IN_MAIN | compatibility-cleanup-v1-2026-09-30 |
| `feature/current-device-notification-self-test-2026-10-01` | `47bceebbeec713a87e33933347825d084a84d7bc` | 0 / 48 | 0 | PRESERVED / IN_MAIN | current-device-notification-self-test-2026-10-01 |
| `feature/design-system-v2-authenticated-review` | `7705efb374b8e60953b1d0b04a4a282fa640a2bf` | 5 / 0 | 5 | SELECTIVELY_DUPLICATED / PRESERVED | V2 authenticated-review |
| `feature/design-system-v2-dashboard-pilot` | `ac2c2fdbb1ff7187d2dc53683be088c9fe312447` | 3 / 0 | 3 | SELECTIVELY_DUPLICATED / PRESERVED | V2 dashboard-pilot |
| `feature/design-system-v2-foundation` | `e4a3cfc9862e75b8680c237804fe703a3e45fd6b` | 2 / 0 | 2 | SELECTIVELY_DUPLICATED / PRESERVED | V2 foundation |
| `feature/design-system-v2-integrated-experience` | `668732955140c5450205ce2cd38aaf759160abf8` | 3 / 0 | 3 | SELECTIVELY_DUPLICATED / PRESERVED | V2 integrated-experience |
| `feature/design-system-v2-job-detail-complete` | `7adec211d5bf0848191d442be664e9caac03ded6` | 5 / 0 | 5 | SELECTIVELY_DUPLICATED / PRESERVED | V2 job-detail-complete |
| `feature/design-system-v2-job-detail-f1` | `1961aa48057b1d772bc8ee8bd307057775c63056` | 3 / 0 | 3 | SELECTIVELY_DUPLICATED / PRESERVED | V2 job-detail-f1 |
| `feature/design-system-v2-job-detail-f2` | `9b6ec19a5bb3b73e1ce2bac04a7caa363ed3739f` | 4 / 0 | 4 | SELECTIVELY_DUPLICATED / PRESERVED | V2 job-detail-f2 |
| `feature/design-system-v2-production-rc` | `7f941b7ace071777353d68c6c0cd1ff5656453f7` | 2 / 0 | 2 | PRESERVED / ISOLATED_OR_SELECTIVE | V2 production-rc |
| `feature/design-system-v2-services-pilot` | `37dbcc8b35822017fda142fd2ca8792f4ffb6084` | 5 / 0 | 5 | SELECTIVELY_DUPLICATED / PRESERVED | V2 services-pilot |
| `feature/design-system-v2-shell-pilot` | `84cfcb413fa7ea2de5a7de7cd442035e9570a7e1` | 4 / 0 | 4 | SELECTIVELY_DUPLICATED / PRESERVED | V2 shell-pilot |
| `feature/dev-diagnostics-wide-scrolltop-2026-09-30` | `8003f726d2fcab040e8cdf76685c750e7f613443` | 0 / 56 | 0 | PRESERVED / IN_MAIN | dev-diagnostics-wide-scrolltop-2026-09-30 |
| `feature/job-detail-intent-layer-v0-2026-10-02` | `42a0d3c2d79b3e845fd1c67137c3979846571543` | 0 / 24 | 0 | PRESERVED / IN_MAIN | job-detail-intent-layer-v0-2026-10-02 |
| `feature/job-detail-v1-progressive-disclosure-2026-10-03` | `71c7642e4fd1bc0b3abd540ee0437851dfa86c90` | 0 / 4 | 0 | PRESERVED / IN_MAIN | job-detail-v1-progressive-disclosure-2026-10-03 |
| `feature/manager-access-pwa-recovery-2026-09-30` | `d5342e8f847ecb5c259e7c2822ce5dff9b2172fe` | 0 / 58 | 0 | PRESERVED / IN_MAIN | manager-access-pwa-recovery-2026-09-30 |
| `feature/manager-fast-path-v2-2026-09-29` | `5f14d63ba892c291c6eaa2de0b5261a01032cdf6` | 0 / 69 | 0 | PRESERVED / IN_MAIN | manager-fast-path-v2-2026-09-29 |
| `feature/manager-notification-reliability-v1-2026-10-01` | `1d4a8cff368c30382ba8de075c9b81b588e51f98` | 0 / 45 | 0 | PRESERVED / IN_MAIN | manager-notification-reliability-v1-2026-10-01 |
| `feature/manager-operation-telemetry-v2-2026-09-29` | `0a738b55f8613380fea2584cd618001287cfc12d` | 1 / 66 | 0 | PRESERVED / ISOLATED_OR_SELECTIVE | manager-operation-telemetry-v2-2026-09-29 |
| `feature/manager-workspace-v3-prototype` | `1a0e38c74f23a23c6fb9d4ee528e10c8f84d09b6` | 3 / 0 | 3 | PRESERVED / ISOLATED_OR_SELECTIVE | Claude V3 reference React prototype |
| `feature/notification-lab-v1-2026-09-29` | `e8d6f09cdb7bebf6aa2c0c24849fd79b72973ba7` | 0 / 61 | 0 | PRESERVED / IN_MAIN | notification-lab-v1-2026-09-29 |
| `feature/operations-workspace-v0-2026-09-30` | `817b3a70e98786f04763b02f96a3502ccdc62962` | 1 / 53 | 0 | SUPERSEDED as integration target / PRESERVED | operations-workspace-v0-2026-09-30 |
| `feature/operations-workspace-v1-intent-first-2026-10-02` | `d4eae5a8e1e2678132e16e23d0577e18b5987e69` | 1 / 27 | 0 | SUPERSEDED as integration target / PRESERVED | operations-workspace-v1-intent-first-2026-10-02 |
| `feature/photo-validation-root-cause-2026-09-30` | `bdd88e1df0f917ca0da85c27cbd9fde11dcba80a` | 0 / 54 | 0 | PRESERVED / IN_MAIN | photo-validation-root-cause-2026-09-30 |
| `feature/reschedule-discoverability-v1-2026-10-02` | `6dd45a9f119c1c4a094f378be35e420a70bfb3e0` | 0 / 27 | 0 | PRESERVED / IN_MAIN | reschedule-discoverability-v1-2026-10-02 |
| `feature/reservation-intake-bridge-v0-2026-10-04` | `177e38d8527e94895ac885673ad22066e9aef936` | 5 / 0 | 3 | PRESERVED / ISOLATED_OR_SELECTIVE | Reservation Intake bridge + subsequent local review/telemetry WIP |
| `feature/sandbox-foundation-v1-current-main-2026-10-03` | `6f275ea1baaac86a1aa666a69a8b696d30170fdf` | 0 / 11 | 0 | PRESERVED / IN_MAIN | sandbox-foundation-v1-current-main-2026-10-03 |
| `feature/service-lifecycle-rail-v0-2026-10-03` | `230c6b3dde95cb8f4c0c0f96427ddac08f804607` | 0 / 6 | 0 | PRESERVED / IN_MAIN | service-lifecycle-rail-v0-2026-10-03 |
| `feature/visual-scenario-runner-v0-2026-09-29` | `998f2bbcbae1931bc180a726f4e4522c270fb20d` | 0 / 67 | 0 | PRESERVED / IN_MAIN | visual-scenario-runner-v0-2026-09-29 |
| `feature/weekly-close-v0-2026-10-01` | `6d2de2b61f17d5f20e9029d9e0b4e01cc06dd3a5` | 1 / 44 | 0 | SUPERSEDED as integration target / PRESERVED | weekly-close-v0-2026-10-01 |
| `feature/weekly-close-v0-current-main-2026-10-03` | `b1c6c9d5404e44ec9e1f6303155d122e569b8083` | 0 / 16 | 0 | PRESERVED / IN_MAIN | weekly-close-v0-current-main-2026-10-03 |
| `feature/whatsapp-deep-link-2026-09-27` | `eea22ba7d2ce728798a46373de8c4942463d8cbc` | 1 / 82 | 0 | PRESERVED / ISOLATED_OR_SELECTIVE | whatsapp-deep-link-2026-09-27 |
| `fix/direct-cleaner-picker-v1-2026-10-02` | `ff14c2b61fe86c7759ea2f96753a327476e49ac0` | 0 / 20 | 0 | PRESERVED / IN_MAIN | direct-cleaner-picker-v1-2026-10-02 |
| `fix/hosting-release-hygiene-2026-10-02` | `3f26587d0389b694a2cd34757d372a59b8146efb` | 0 / 23 | 0 | PRESERVED / IN_MAIN | hosting-release-hygiene-2026-10-02 |
| `hold/required-cleaner-count-2026-09-27` | `c5b3f844f9eb71ef53dfdc1930c1678307fece82` | 0 / 82 | 0 | BLOCKED / PRESERVED | required-cleaner-count-2026-09-27 |
| `hotfix/dashboard-bounded-load-2026-10-02` | `d9ecee2c6f4c5173adce1f40d27890af67a42148` | 0 / 33 | 0 | PRESERVED / IN_MAIN | dashboard-bounded-load-2026-10-02 |
| `hotfix/ios-safari-transport-2026-10-02` | `14f6670194a9a9fe058639b90c67ffd04334d65d` | 0 / 34 | 0 | PRESERVED / IN_MAIN | ios-safari-transport-2026-10-02 |
| `hotfix/manager-access-global-deadline-2026-10-01` | `edc71c4be7a3fb75eb6edfe34e085ffae37eb93f` | 0 / 50 | 0 | PRESERVED / IN_MAIN | manager-access-global-deadline-2026-10-01 |
| `integration/checklist-recovery-telemetry-2026-09-29` | `c63667ff0b4d5cfdb355680600ff3d20ec925074` | 0 / 63 | 0 | PRESERVED / IN_MAIN | checklist-recovery-telemetry-2026-09-29 |
| `integration/photo-diagnostics-cleaner-language-2026-09-28` | `766883b7beb9711a9a98e2e0b97ba38396ab39cf` | 0 / 73 | 0 | PRESERVED / IN_MAIN | photo-diagnostics-cleaner-language-2026-09-28 |
| `main` | `8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526` | 0 / 0 | 0 | PRESERVED / IN_MAIN | Production-compatible reference; docs ahead of Hosting |
| `overnight/gabi-pilot-2026-09-25` | `0b8dbc709847edb5f6d903f808e93cf2746d2539` | 5 / 95 | 0 | PRESERVED / ISOLATED_OR_SELECTIVE | gabi-pilot-2026-09-25 |

## Dependency-aware next actions (separate authorization; not executed)

Remote state checked read-only: Draft PR80 remains at af6e4c6 while local Intake
is177e38d (three unpublished commits plus WIP); Draft PR63 remains open/intact.
Merged historical PRs are not a deployment proof for isolated newer branches.
Remote-only guardrails and original Sandbox-v0 tips are also captured in the
private remote-ref manifest and recovery bundle; no remote branch was deleted.

1. Freeze/commit remaining primary Intake and Telemetry WIP separately when their
   owners finish. Preserve the detached variant and Dashboard JSX differences;
   compare against existing RC before reimplementing anything. Claude owns visuals.
2. Validate the5 excluded import fixture files as synthetic before complete private
   stash preservation. Keep the existing stash/old source tree untouched meanwhile.
3. Reconcile Node22 STOP and the exact five remaining Functions under a new approved
   quiet-window release, preserving26 already-migrated Functions/capacity policy.
   No source audit grants cloud authorization or clears a STOP.
4. Build a separately authorized functional integration candidate reusing Multi-Photo
   ba3fa84 + Node22 policies; preserve inherited completion/origin guards. Run actual
   unit/security/emulator/Chromium/WebKit/device gates against that combined source.
   Stage compatible public/manager/report readers before new policy2 Run creation.
   After policy2 state exists, never blindly roll back to a single-photo backend.
5. Keep V3 visual release independent: reuse repair21feba5 as Codex integration
   descendant and Claude1a0e38c as design/reference. No wholesale merge of every V2
   pilot/prototype. Reconcile the five frontend hotspots only when authorized.
6. Leave Reservation Intake/Telemetry experimental and independent from urgent
   photo delivery. No auto-merge of their WIP, backend or Rules changes.

## Permanent handoff contract

At every Claude/Codex checkpoint record: purpose/owner, source branch + fullSHA,
worktree alias/private location, tracked/untracked state, upstream and remote
reachability, actual deployment marker/runtime separately, validation evidence,
private backup location/hash, dependency/STOP gates and next action. Record any
missing worktree and exact omissions; never replace this with 'ZIP delivered'.
Before integration, consult this registry + Issue83 and compare current metadata;
do not recreate existing implementations. Never clean a worktree/ref solely from
SUPERSEDED/DUPLICATED labels. No automatic hooks/services/pipeline were added.

</details>
