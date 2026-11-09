# Multi-Photo V1 + Node22 Release Integration Plan

> Use superpowers:executing-plans inline; independent read-only reviews/preflight may run in parallel.

**Goal:** One local Production-compatible Multi-Photo release candidate with exact runtime reconciliation.
**Architecture:** Reuse ba3fa84; selectively pin Node22/PolicyB from1d8a6b6. No whole legacy merge or new feature.
**Tech:** Existing React/Firebase, Node22.23.2, CLI15.28.1, Vitest/Playwright/emulators.
**Worktree:** the isolated `codex/multi-photo-node22-release-candidate` checkout.

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
- [x] Port existing runtime tests; run RED on engine20.
- [x] Change only root engine22 and global preserveExternalChanges/max20, retaining Storage7.22.0 and handler bytes.
- [x] Assert publicChecklist60s; runtime tests GREEN; local source checkpoint3f21ab5.

## Task2 — combined-source regression
- [x] Reuse exact ba3fa84 evidence:1351unit/282focused/82security/28optimizer/4gallery; verify source hashes.
- [x] Fresh synthetic emulator build and serial actual WebKit2;225focused regressions passed.
- [x] Verify1/10/20/reload/failure-retry/private manager-report/legacy/quota/revocation; hostNode22.
- [x] Production/Sandbox compile, Hosting preparation/guards/exclusion through22guards. Exact finalSHA Production manifest follows documentation checkpoint. Never deploy.

## Task3 — preflight and handoff
- [x] Refresh31cloud runtime/config/revision/scaling; compare8targets, capture/exclude23untouched targets.
- [x] Read-only IAM/secretVERSION/triggers/schedules/Hosting/Storage/quota/activity, no customer content.
- [x] Exact order, policy2-safe recovery and STOP disposition for separateGO.
- [x] Independent source review found no integration blocker at3f21ab5; documentation-only finalSHA/manifest are emitted in final receipts.
- [x] Requirements audit/finalZIP are the terminal local steps, recorded by final audit receipt rather than a self-referential commit. No cloudwrites.

