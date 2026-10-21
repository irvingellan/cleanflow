# Multi-Photo V1 + Node22 Release Integration Plan

> Use superpowers:executing-plans inline; independent read-only reviews/preflight may run in parallel.

**Goal:** One local Production-compatible Multi-Photo release candidate with exact runtime reconciliation.
**Architecture:** Reuse ba3fa84; selectively pin Node22/PolicyB from1d8a6b6. No whole legacy merge or new feature.
**Tech:** Existing React/Firebase, Node22.23.2, CLI15.28.1, Vitest/Playwright/emulators.
**Spec:** /Users/irvingellan/.codex/attachments/2d136859-d10c-475e-ba5a-bf7e2922bc44/goal-objective.md

## Constraints
No Production deploy/mutation, main merge, push, billing/secret change or visual work. Preserve original worktrees/WIP/refs/backups and both STOP files byte-identical. Policy2 remains20photos/50MiB, per-image5MiB. No duplicate broad suites without integration reason.

## Review focus
- GlobalPolicyB must preserve explicit publicChecklist60s timeout.
- Delay createChecklistRun until compatible readers/writer/report/Hosting.
- Legacy Runs stay single-photo; no blind rollback after policy2.
- Runtime5 +feature5 overlap2 =>8uniqueFunctions, not31upgrades.
- Unknown cloud metadata/quiet/device acceptance remain explicit gates.

## Task1 — selective runtime composition
Files: functions/package.json, functions/package-lock.json, functions/src/index.js, scripts/functionsRuntime.test.mjs.
- [ ] Port existing runtime tests; run RED on engine20.
- [ ] Change only root engine22 and global preserveExternalChanges/max20, retaining Storage7.22.0 and handler bytes.
- [ ] Assert publicChecklist60s; runtime tests GREEN; local source checkpoint.

## Task2 — combined-source regression
- [ ] Reuse exact ba3fa84 evidence:1351unit/282focused/82security/28optimizer/4gallery; verify source hashes.
- [ ] Fresh synthetic emulator build and serial actual Chromium/WebKit integration (minimumWebKit2).
- [ ] Verify1/10/20/reload/failure-retry/private manager-report/legacy/quota/revocation; hostNode22.
- [ ] Production/Sandbox compile, Hosting preparation/guards/exclusion. Never deploy.

## Task3 — preflight and handoff
- [ ] Refresh31cloud runtime/config/revision/scaling; compare8targets/unaffected23.
- [ ] Read-only IAM/secretVERSION/triggers/schedules/Hosting/Storage/quota/activity, no customer content.
- [ ] Exact order, policy2-safe recovery and STOP disposition for separateGO.
- [ ] Independent source review; local finalSHA and exactSHA Hosting manifest.
- [ ] Requirements audit and final evidenceZIP; no cloudwrites.

