# Integrated V2 execution ledger

Spec: owner attachment b2754b20, Full Synthetic Pilot and Engineering Validation.
Base: Phase B e4a3cfc9862e75b8680c237804fe703a3e45fd6b.

1. Verify sources/WIP, copy reviewed presentation components with tests only.
2. RED/GREEN UNKNOWN recommendation; unchanged existing guards.
3. One loopback-only e2e/integrated-v2 app using the real Shell/Dashboard/Services/Job Detail wrappers and CURRENT directories. Single immutable synthetic context, local navigation and pagination. No Firebase SDK initialization; provider calls fail closed.
4. Integrated browser workflows and responsive/theme/language matrix; module/CURRENT regressions and builds/exclusion.
5. Independent UX/security passes, traceability, local commit, ZIP, persistent preview.

Ruling: the integration entry is a standalone local development harness, not an authentication-bypass route in App. Production App stays Phase B; no public preview or backend initialization. Existing secondary screens receive synthetic read props; all persistence callbacks reject explicitly rather than pretend to save.
Shared interfaces: Row combines Services DOM ref/markers with Shell icon paths. Translation catalog combines complete Job Detail keys and Dashboard-only keys. Original source worktrees remain unchanged.
Preflight: new worktree clean; Phase B 115 files / 1274 tests passed.
Task 1: complete — selective presentation source copies; required shared primitives reconciled, no App/service/backend copies.
Tasks 2–5: complete — UNKNOWN RED/GREEN, shared synthetic navigation, full
responsive matrix, independent reviews and bounded harness corrections.
Final evidence and acceptance limitations: INTEGRATED_EXPERIENCE_REPORT.md.
Disposition: local commit only; preserve worktree for human review. No push/merge/deploy.
