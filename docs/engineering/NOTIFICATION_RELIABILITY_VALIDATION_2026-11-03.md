# Final local validation — notification reliability V1

Status: READY FOR FUNCTIONAL REVIEW. No Production release or real phone result.

- Branch: `codex/notification-reliability-v1-2026-11-03`.
- Base: `b7b0eeac5374a8ffb072972c671f8803b680a1a0`.
- Functional commit: `a931468262252c2d46bb0405d7519995fc2d7bb4` (31 files).
- Documentation/source registry is a separate local checkpoint.

| Gate | Final result | Evidence boundary |
|---|---:|---|
| Client + server focused Vitest | 19 files /311 PASS | Client152 + server159; real modules with synthetic provider boundaries |
| Full unit `npm test` | 124 files /1458 PASS | Root final run after both review corrections |
| Isolated manager authorization/security | 84 PASS /0 skipped | Firestore18080, Storage19199; demo-cleanflow only |
| Runtime + Sandbox/build + Hosting guards | 25 PASS | Node22/max20/preserveExternalChanges; local candidate32 declarations vs Production31 |
| Root worker transport/update/navigation | Chromium1 + WebKit1 PASS | Actual worker generator; synthetic5MiB Blob PUT to loopback |
| Production-shaped build | PASS | Synthetic public config only;13 build files; no network/application run |
| Sandbox build | PASS | Separate synthetic binding;13 build files; no provider secrets |
| Syntax and diff | PASS | index/security/E2E syntax; `git diff --check` |
| Independent review | PASS after corrections | Separate client/server reviewers plus final integrated ABI review |

The guards use `node --test scripts/functionsRuntime.test.mjs scripts/sandboxBuildGuards.test.mjs scripts/prepareHosting.test.mjs`. The browser run uses the existing `e2e/root-worker-transport.spec.js` with an isolated temporary configuration. Two initial browser runner attempts discovered no tests because of temporary path/URL encoding errors; no application assertion ran in those attempts. Corrected runner passed both browsers. No browser dependency was installed.

Security runs used their own disposable emulators (hub14400/logging14500) and stopped only those processes. Existing user processes on8080/9099/9199 remained running. The final84-test run was repeated after the timestamp-ordering correction. Negative permission errors in these synthetic logs are expected denial assertions, not Production errors.

Full authenticated application E2E was not run: its existing setup is pinned to the already-occupied user Auth/Firestore ports. No tests cleared/reused that data. The current-device E2E module stub was updated only to export the newly imported service APIs; its browser UI cases are not claimed as executed. Component/action/security behavior is covered by the local focused/full suites above. Physical iPhone/PWA token recovery and notification display remain pending explicit authorized testing.

## Regressions reproduced before fixing

- Support/worker/token/enrollment stall, late write, retry/session supersession and same-UID new Auth session.
- Messaging root/wrong worker cannot count as registered messaging worker; health/session attribution guards.
- Exact revision-aware sign-out; failed Auth sign-out releases only its captured guard; stale preparation cannot release a newer guard.
- One whole-attempt token rotation even when initial enrollment and explicit test both conclusively reject; UNKNOWN/generic errors do not rotate or resend.
- Register→sign-out→later legacy invalidation rejects the cached token. Older historical invalidation can survive later sign-out. Equal/missing/malformed timestamps fail closed; nanosecond ordering is preserved.
- Cross-user/org/device/token/revision cleanup denial, current invalidated token marker, audit/privacy projections.
- Bounded send/cleanup, ordered partial/UNKNOWN outcomes; audit failure cannot erase known acceptance or cause a second send; durable claims remain consumed.
- Global100-record diagnostic sample can omit a recent organization event; cap/completeness is exposed rather than fabricated.

## Preserved / not claimed

Main/origin remain8bc70165. Published Hosting remainsb7b0eea and31 Functions ACTIVE/Node22/max20 per dated read. No Production write, real push, registration, scheduler run, provider change, deploy, merge/rebase/push, billing/IAM/secrets/Rules/index change or visual/CSS work. Original STOPs are outside the change set. Main/old worktrees were not switched or cleaned.

At-most-once claim loss, already-dispatched uncertain work, permanently stalled SDK operations, closed-browser external Auth loss, cross-account token transfer and absent universal device receipt/display/open are documented limits. Serialization makes later attempts bounded but cannot force a permanently unresolved SDK operation to complete. A full durable inbox and cleaner authentication are separate scoped work, not delivered by this candidate.

The authorized Issue83 source checkpoint was posted and read back at:
https://github.com/irvingellan/cleanflow/issues/83#issuecomment-6619964559

Local logs/private projections remain outside Git; the handoff contains sanitized evidence only, with code retained by these canonical local commits.
