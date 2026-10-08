# V2 Production Release Candidate Plan

> Execute inline with superpowers:executing-plans; two independent final reviews.

**Goal:** Prepare a reviewable, inactive V2 RC on the verified Production-compatible baseline.
**Architecture:** Selectively reuse accepted presentational files and existing controllers. Extend existing build-time presentation gating only; CURRENT remains default. No URL-based Production opt-in.
**Tech Stack:** Existing React/Vite/Firebase CLI/Vitest/Playwright; no new dependency.
**Spec:** User attachment `19c83a0c-9d52-41de-a3d0-ca1af93b7391/Texto colado.txt`.

## Global Constraints

- Branch `feature/design-system-v2-production-rc`, new isolated worktree.
- No push, merge, deployment, operational writes, backend/rules/schema change.
- Preserve original Intake/Telemetry WIP and existing V2/Hosting releases.
- Human integrated acceptance is confirmed; Gabi and Production authorization remain pending.
- No credential or real customer data in source/package.

## Review Focus

- Default Production build must exclude V2, fixtures and internal review tools.
- An explicit future V2 build must preserve public routes, authorization and all existing callbacks.
- Confirmation cancellation, unknown lifecycle and archived/completed states cannot promote mutations.
- Navigation/filters/Back and mobile utility access remain equivalent.
- SW/FCM/photo/auth/dashboard operational hotfix source remains exact.

### Task 1: Baseline and selective provenance

**Files:** `docs/design-system-v2/PRODUCTION_RC.md`, evidence artifacts; accepted V2 source/test files.
**Interfaces:** verified `origin/main`, Hosting version marker, read-only Function/Rules inventory.
- [x] Verify deployed Hosting build/assets and relevant backend version metadata; state unknowns explicitly.
- [x] Import only accepted V2 source/tests/docs, not whole branches or unrelated WIP.
- [x] Run baseline units and audit operational file hashes / 55 binding inventory.

### Task 2: Inactive build-time release gate

**Files:** `src/components/v2/integratedPilot.js`, `src/App.jsx`, `vite.config.js`, `scripts/prepareHosting.mjs`, regression tests.
**Interfaces:** `VITE_MANAGER_EXPERIENCE` accepts absent/current/v2; no runtime Production override.
- [x] Add failing tests for default exclusion, explicit future activation, malformed flags and marker/manifest parity.
- [x] Keep Sandbox comparison/developer gating; explicit Production V2 artifact is build-only and behind existing ManagerAccess.
- [x] Run units, both build variants and fail-closed Hosting guards; commit candidate locally.

### Task 3: Full regression and reviews

**Files:** existing unit/browser harnesses, read-only review reports.
- [x] Run focused/full units, environment/Hosting guards, integrated Chromium/WebKit, responsive/a11y regressions.
- [x] Confirm confirmations and exact operational source preservation; no backend workflow claim from synthetic transport.
- [x] Obtain independent product/UX and engineering/security review; fix only proven defects.

### Task 4: Handoff

**Files:** canonical local checkpoint, RC report, ZIP and `MANIFEST.md`.
- [x] Record A–G evidence gates, hotfix inventory, conflicts, activation NOT EXECUTED and Hosting-only rollback.
- [ ] Package sanitized logs, screenshots, provenance and exact candidate SHA; verify ZIP integrity.
- [ ] Confirm no push/merge/deploy or original worktree changes.
