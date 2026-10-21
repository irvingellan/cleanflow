# CleanFlow source / worktree / release-candidate registry

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
