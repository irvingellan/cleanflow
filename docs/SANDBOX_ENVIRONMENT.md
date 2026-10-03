# Developer Sandbox — Issue #57

Status: **READY FOR SANDBOX PROJECT**. The authenticated read-only Firebase
project inventory on 2026-10-03 found no clearly designated CleanFlow Sandbox.
No project, billing, cloud configuration or deployment was created/changed.

## Three separate targets

| Target | Binding | Purpose |
| --- | --- | --- |
| Production | `prod` = `clean-flow-prototipo`; existing `default` preserved | Real operations, never demo generation/cleanup |
| Sandbox | Exact dedicated project ID; `sandbox` alias pending | Synthetic manual/device validation |
| Emulator | `demo-cleanflow`, explicit emulator mode | Automated tests and local synthetic scenarios |

The old V0 branch is reference only, not merged/rebased. Current-main manager
authorization, read-only Weekly Close, Safari/root-worker transport and Hosting
release hygiene are retained.
The committed `.env.emulator` is fully synthetic and keeps the existing
`build:emulators`/Scenario Runner mode from inheriting local production config;
Auth, Firestore, Functions and Storage connect only to local emulators.

## Local preparation and activation boundary

Create a dedicated Firebase project and register its own Web app. Supply its
project ID and exact Web configuration; do not reuse production configuration,
users, secrets, tokens, exports or operational data. This is the next required
manual action, **not** authorization for deployment/billing/service provisioning.

Only after that evidence exists, configure locally:

- `.firebaserc.projects.sandbox` = that exact project ID (not a placeholder).
- Copy `.env.sandbox.example` to ignored `.env.sandbox.local`; fill all six
  Firebase Web fields, `VITE_CLEANFLOW_ENV=sandbox`, and the exact allowlisted
  `VITE_CLEANFLOW_SANDBOX_PROJECT_ID`. Origin is that project's HTTPS `.web.app`
  origin. Notification provider values remain empty.
- The production build can receive only the non-secret Sandbox ID/origin for
  **Open Sandbox**. **Back to Production** is a full-origin navigation. There
  is no query/localStorage project selector or Firebase hot-swap inside the SPA.
- Future server configuration uses non-secret `DEV_CENTER_SANDBOX_PROJECT_ID`
  (default empty) plus the existing independent developer UID authorization.
  Configuring those cloud values/accounts requires a separate authorized step.

Build/runtime guards reject missing/unknown bindings, production as Sandbox,
cross-project Auth/Storage/app/origin fields, inherited production notification
configuration and known locally configured production API keys. API-key ownership
cannot be proved from its string offline: verify the dedicated project's exact
Web config before activation. Sandbox/Production Firebase Hosting preview channels
are allowed only for their bound project; emulators/local development remain local.

## One Hosting preparation pipeline, no automatic deployment

After a clean commit:

```bash
npm run hosting:prepare -- <exact-HEAD-SHA> sandbox
```

This reuses the production preparation script: safe alias required first, clean
`dist` rebuild, SHA/environment/project validation, artifact rejection and stable
SHA-256 manifest at `.firebase/hosting-prepared-manifest.json`. It never deploys.
Without an actual Sandbox alias it fails before building. The existing production
command remains `npm run hosting:prepare -- <exact-HEAD-SHA>`.

`npm run build:sandbox` independently validates the build-time binding. The empty
example intentionally cannot build. `node --test scripts/sandboxBuildGuards.test.mjs`
uses only isolated fabricated configs/projects to exercise positive/negative builds
and preparation; it neither configures a real Sandbox nor calls cloud APIs.

## UI and synthetic data

Every Sandbox route, including unauthenticated public routes, has permanent
**SANDBOX · TEST DATA** signage. Build/commit and environment navigation controls
appear only for an authorized developer, using existing server authorization.
Ordinary manager access and protected records still require the existing boundary.

Quick Demo, Busy Week, Payout Test, Manager Training and Weekly Close use fabricated
batch-scoped records. Weekly Close intentionally gives synthetic completed Jobs
`REAL` provenance so the unchanged REAL-only reconciliation can be exercised;
every such record still has `demoSeed`, `demoSeedBatch`, `demoSeedScenario`. This
does not mean real customer data and may not be generated in production.

Generate/clear/reset repeat server checks: production always denied (even with a
misconfigured emulator flag/allowlist); cloud unknown projects denied; emulator
requires `demo-cleanflow`; Sandbox requires its exact server allowlist. No new
callable is introduced. Reset uses the existing generate callable with explicit
`resetBaseline: true`, confirms before clearing, then generates Quick Demo.

Clear/reset affect only untouched marked batches. Modified records, workflow
children (Assignments/Runs/evidence/capabilities), foreign references and unknown
children protect entire batches. Reset refuses protected history before deleting;
clear reports skipped batches. Update-time preconditions reject changed delete
targets. This is deliberately **not** a recursive wipe of manually edited history;
concurrent Sandbox editing should stop before a confirmed reset.

No cloud end-to-end availability is claimed until the dedicated project exists and
its separately authorized setup/deployment has completed. Production remains unchanged.
