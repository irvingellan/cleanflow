# Phase C2 — authenticated Sandbox shell validation

## Distinct states

DESIGNED: yes. IMPLEMENTED: yes. OPERATOR ACCEPTED LOCALLY: yes (human report).
SANDBOX RELEASED: yes. AUTHENTICATED SANDBOX VALIDATED: yes, desktop and mobile
viewport in existing Chrome manager session. PRODUCTION RELEASED: **no**.
This is not a real iPhone browser proof or approval to migrate screen internals.

## Exact source, release and rollback

Branch: `feature/design-system-v2-shell-pilot`.
Released application SHA: `5e1a1c122398e0c11cc3842d4419080ef98628ce`.
Exact Phase B baseline: `e4a3cfc9862e75b8680c237804fe703a3e45fd6b`.
No other branch/WIP merged. Documentation checkpoint follows the release separately.

Only command with cloud mutation:
`firebase deploy --only hosting --project clean-flow-sandbox-irving --non-interactive`.
Hosting version: `7f122070f32a3e25`.
Release: `1791335094015000`; `2026-10-07T01:04:54.015Z` (Oct 6 Pacific).
Prepared via existing `hosting:prepare -- <released-SHA> sandbox`, using protected
local Sandbox Web configuration without copying/committing it. SHA, environment,
project and 22 stable manifest files verified before publication; 22/22 live
SHA-256 hashes verified afterward. No test harness/fixtures/macOS artifacts shipped.

Previous Sandbox version for rollback: `1779381af151de8b`.
Previous release: `1791152759871000`; `2026-10-04T22:25:59.871Z`.
Previous build: `5c2e52492331577a7cbdc4aa41a8f1a6b9771b45`.
Precise rollback target is the above version on the **Sandbox site only**; use
Firebase Hosting release rollback or create a Sandbox release referencing that
immutable version. No Production target and no Function/Rules rollback required.

## Authenticated checks

- Existing manager session authorized through unchanged ManagerAccess.
- Dashboard, Services, Properties, Cleaners, Clients, Payouts opened with existing
  synthetic baseline. No create/edit/assignment/payout/report actions executed.
- Desktop 1440: grouped sidebar, account controls and subordinate internal preview.
- Mobile 390x844: Dashboard/Services/Properties/More, no horizontal overflow;
  tab targets measured 56px. More secondary destinations and utilities present.
- Existing synthetic Property detail opened read-only; Back returned to directory.
- Theme dark/light and EN/PT switching worked. PT/dark survived CURRENT reload.
- Feedback, What's New, notification/current-device controls and sign out present;
  no test push, subscription action, feedback submission or sign out performed.
- `?shell=current` rendered the legacy shell; authenticated session/build/project
  remained Sandbox. `?shell=v2` rendered the new shell without provider switching.
- Central Dev and dependent diagnostics navigation remained hidden/fail-closed:
  Sandbox Functions are billing-gated. No privileged authorization bypass, fallback
  or forced internal-route access. Synthetic authorized-path tests cover shell
  presentation; live authorized Dev Center content cannot be verified here.

Authenticated desktop/mobile screenshots were captured through the browser session
and displayed during verification; they are not committed (account privacy).

## Environment and Production proof

Live version marker: environment `sandbox`, project `clean-flow-sandbox-irving`.
Bundled Firebase client/worker match protected Sandbox configuration and manifest.
Production notification configuration absent. Existing guards prevent cross-binding
and provider fallback; environment links are presentation-only, not authorization.
The browser tool did not expose a complete request ledger, so this is exact build/
asset binding proof, not a claim of a separately audited full browser network trace.

Production before/after remained exactly:
version `6130ee0f019cbff4`, release `1791153898087000`,
time `2026-10-04T22:44:58.087Z`, build `5c2e52492331577a7cbdc4aa41a8f1a6b9771b45`.
No Production browser opened for QA. No Production deployment/data mutation.
No Functions, Rules, Storage, indexes, secrets, billing or notification changes.
Existing same-Sandbox public rewrites emitted the expected unavailable-Functions
warnings; they do not route to Production.

## Operator links / next gate

V2: https://clean-flow-sandbox-irving.web.app/?shell=v2
CURRENT: https://clean-flow-sandbox-irving.web.app/?shell=current

Ready for a separate Production shell release **review**, not release authorization.
Production currently excludes V2 by design; enabling it requires separately scoped
approval and regression/exclusion-contract review. No implicit merge or screen migration.
