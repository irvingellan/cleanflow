# Firebase Functions Node22 Migration Plan

> Execute inline with superpowers:executing-plans and one independent final review.

**Goal:** Release-safe runtime-only Node22 candidate for Issue82.
**Architecture:** Existing Functions, triggers, business logic and dependencies unchanged;
Firebase CLI must consume Node22 from the Functions package and matching lock metadata.
**Tech stack:** Existing Firebase SDK/CLI, Node22, Vitest, isolated emulators/Playwright.
**Spec:** GitHub Issue82 and the authorized Node22 release-safety goal.

## Constraints and review focus

No cloud deployment, merge/push, billing, customer data, real notifications or product features.
Preserve principal WIP, MultiPhoto588a1fd and V2RC7f941b7. Base8bc7016 differs from live5c onlydocs.
Check hidden runtime override, altered lock resolutions, env/secret drift, trigger recreation,
duplicate delivery/retry on release and rollback after Node20 decommission.

### Task1 — Inventory and source binding
- [ ] Read Issue82/current source/remote/live; sanitize all31 deployed Function configurations.
- [ ] Record source SDK locks versus installed versions and advisory paths without upgrades.

### Task2 — Minimal runtime declaration
- [ ] Add real CLI runtime-selection regression; expectednodejs22 initially failsnodejs20.
- [ ] Change only Functions engine in package.json and root lock metadata to22.
- [ ] Prove lock resolution/integrity and Functions source hashes unchanged; no runtime override.

### Task3 — Isolated runtime validation
- [ ] Full unit/server suite under verifiedNode22; actual module/SDK/manifest loading.
- [ ] Reuse existing security tests with validated optional alternate ports; allprivileged loopback.
- [ ] Actual Auth/Firestore/Functions/Storage/Hosting synthetic checklist/report/offer/callable flow;
      notification and scheduler assertions use mocked transports, never real pushes.
- [ ] Relevant browser/integration regressions and diff check; stop only owned disposable processes.
- [ ] Read-only merge-tree compatibility withMultiPhoto; never alter its branch/worktree.

### Task4 — Release decision
- [ ] Independent final review,31-function coverage matrix, advisory dispositions.
- [ ] Exact stagedFunctions-only sequence, metadata preservation/trigger checks/rollbackdeadline.
- [ ] Local checkpoint and sanitized localZIP; no release actions.
