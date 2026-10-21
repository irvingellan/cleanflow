# Manager Workspace V3 Hybrid implementation plan

> Execute inline with superpowers:executing-plans. Design and autonomous implementation already authorized; no new design gate.

**Goal:** Authenticated preview-only Agora + Operação using real existing controllers.
**Architecture:** Extend App presentation seams, Dashboard.renderPresentation and JobsPage.renderPresentation; nest the existing Job Detail with its original handlers. No new service/query/store framework.
**Spec:** Owner's 2026-10-21 attached integration request; prototype1a0e38c handoff documents, Issue51.
**Tech:** Existing React/Vite/V2 primitives/Intl/Vitest/Playwright; no dependency addition.

## Global constraints

Production excluded at build time. No Functions/Rules/Storage/index/business-rule changes. Preserve all source worktrees and STOP files. Real data is never a fixture. Sandbox publication only to a separate allowlisted preview channel; public repository means no branch push/PR under this request's private-repository condition.

## Review focus

- Unauthorized or Production URL must not activate the workspace.
- Calendar ranges are LA Monday–Sunday, but never passed as unsupported getJobs presets.
- Bounded loaded results must not be claimed to be a complete day/database count.
- Selecting/navigation cannot mutate; stale child requests retain existing controller guards.
- Retained search/filter/selection/scroll and browser Back must work on390/768/1440.

### Task1 — bounded presentation/date contract

Files: src/features/workspace/workspaceV3Model.js and tests; workspaceMessages.js.
- [ ] RED: gate, LA midnight/DST, Monday–Sunday, invalid date and range navigation tests.
- [ ] Implement/adapt dependency-free prototype calendar helpers; no prototype imports.
- [ ] GREEN: focused tests. Existing getJobs/sortJobWorklist contracts unchanged.

### Task2 — real application integration

Files: src/features/workspace/ManagerWorkspaceV3.jsx, workspaceV3.css, App.jsx; component tests and e2e/workspace-v3 harness.
- [ ] RED: automatically-loaded attention, correct Job, retained range/search/selection, empty/error/retry and no mutation.
- [ ] Add authenticated developer preview gate, easy exit, Agora and persistent worklist/detail; reuse all original action handlers.
- [ ] GREEN: focused + full tests, real App synthetic Playwright across widths/themes/languages and current/V2 regressions.

### Task3 — safe preview and handoff

- [ ] Production/Sandbox builds, artifact exclusion and protected-source hashes.
- [ ] Independent final read-only review; fix concrete findings with regressions.
- [ ] Commit isolated branch; no public push. Sandbox-only isolated Hosting channel if available; otherwise local authenticated/emulator fallback.
- [ ] CURRENT_STATE, factual Issue51 update, screenshots and local integrity ZIP; no Production deployment.
