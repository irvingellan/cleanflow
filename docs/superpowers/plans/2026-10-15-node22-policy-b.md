# Node22 Policy B Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Local-only preparation; no deployment.

**Goal:** Pin maxInstances=20 for the existing 31 gen2 declarations and prove a 21-update-only continuation candidate.
**Architecture:** Extend the existing SDK declaration and existing metadata-only CLI preflight. No backend handler or dependency change. Keep original STOP and historical evidence immutable.
**Tech Stack:** Node22.23.2, Firebase Functions6.6.0/Admin13.10.0, CLI15.28.1, node:test and isolated emulators.
**Spec:** Issue82 plus the owner's explicit Policy B preparation-only decision in this conversation.

## Global Constraints

NO deployment, merge, push, billing/customer-data access, traffic switch or backend business-rule changes. Ten Node22 Functions excluded from continuation. Seven historical changes accepted as NEW policy, not proven equivalent. Original STOP stays intact.

## Review Focus

- An added/deleted/renamed export must fail exact inventory comparison, not silently extend the policy.
- Null/undefined/reset masks or service-level drift must fail closed even with numeric20 in source.
- An already-updated Function must never appear in the 21-target update plan.
- Environment default normalization must be separated from exact equality; no provider/secret/identity drift hidden.
- Event/scheduler resources and readiness require separate comparisons; static manifest is not cloud execution proof.

### Task 1: Explicit source policy and regression

Files: functions/src/index.js; scripts/functionsRuntime.test.mjs.
- [x] Test first: all31 real declarations emit numeric20 and actual CLI body/mask includes it; unrelated external options stay absent.
- [x] Observe failure against omitted max policy.
- [x] Add maxInstances:20 to existing setGlobalOptions, preserveExternalChanges:true unchanged.
- [x] Run runtime tests and full unit suite. No handler calls.

### Task 2: Policy-aware local preflight

Files: existing ignored release evidence; new policy-b candidate subdirectory.
- [x] Extend pure scaling model: explicit20/current service20 is deliberate approved normalization, not historical equivalence. Unexpected values/reset/service drift remain BLOCKING.
- [x] Regression fixtures for11omitted, explicit20, wrong20/100, missing service evidence, undefined mask and unexpected inventory.
- [x] Extend actual CLI preflight; record serialized body/mask for all31, planner targets only21Node20,0create/delete/recreate; retain full invariant comparison.
- [ ] Fresh metadata-only read and local request generation; no modifying cloud method permitted.

### Task 3: Release evidence and local checkpoint

Files: docs/CURRENT_STATE.md; docs/FUNCTIONS_NODE22_RELEASE_SAFETY.md; docs/NODE22_POLICY_B.md.
- [x] Run Node22 unit/runtime/model, isolated security and emulated integration checks. Do not interrupt existing processes.
- [x] Document exact inventory/batches, per-batch acceptance, stop/recovery and monitoring/cost limits.
- [x] Independent final read-only review; three local gate findings reproduced RED then corrected GREEN. Historical evidence preserved.
- [ ] Local Git checkpoint only scoped application/test/docs; no push. Fresh SHA-bound preflight and final preservation checks.
- [ ] One sanitized ZIP with SHA256 manifest, test receipts and complete decision report. NO DEPLOY.
