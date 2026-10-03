# Developer Sandbox — Issue #57

Status: **CORE PROVISIONED; HOSTING RELEASE PENDING** (2026-10-03).
Explicit authorization created exactly one dedicated project:
`clean-flow-sandbox-irving` (CleanFlow Sandbox), project number `202424558771`.
Its one Web app is `1:202424558771:web:87199fd59220e078647cc6`
(CleanFlow Sandbox Web). Cloud Billing readback confirms no billing account
attached and billing disabled. No production resources/data were changed.

Firestore Standard `(default)` is free-tier eligible in `nam5`, matching only
the read-only production database metadata. Existing Firestore Rules and indexes
were deployed exclusively to Sandbox. Email/password Auth is enabled, with
the two dedicated Firebase Hosting domains authorized. An independent Sandbox
manager Auth account and active MANAGER membership exist; no password was
invented, imported or reused. The remaining login action is to set this account's
password through Sandbox Authentication Console (password reset) and sign in
at the separate origin. Actual manager login has not yet been verified.

## Three separate targets

| Target | Binding | Purpose |
| --- | --- | --- |
| Production | `prod` = `clean-flow-prototipo`; existing `default` preserved | Real operations, never demo generation/cleanup |
| Sandbox | `sandbox` = `clean-flow-sandbox-irving` | Synthetic manual/device validation |
| Emulator | `demo-cleanflow`, explicit emulator mode | Automated tests and local synthetic scenarios |

The old V0 branch is reference only, not merged/rebased. Current-main manager
authorization, read-only Weekly Close, Safari/root-worker transport and Hosting
release hygiene are retained.
The committed `.env.emulator` is fully synthetic and keeps the existing
`build:emulators`/Scenario Runner mode from inheriting local production config;
Auth, Firestore, Functions and Storage connect only to local emulators.

## Local preparation and activation boundary

The dedicated project/Web app now exist. Their exact CLI SDK configuration is
stored only in ignored `.env.sandbox.local`; no local credentials/config values
are committed. The SDK reports a dedicated Storage bucket name, but that is
configuration, **not evidence that a bucket has been provisioned**.
Do not reuse production users, secrets, tokens, exports or operational data.

Local configuration:

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
  Configuring those server values/secrets remains pending separately authorized
  Functions provisioning; the current no-billing activation does not set them.

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

## Spark core versus billing-gated workflows

A minimal baseline reuses the existing Quick Demo builder: one Client, Property,
Cleaner and UNASSIGNED Job, each marked DEMO, `demoSeed`, batch and scenario.
Create-only preconditions prevent overwriting anything. Readback verified all
four records plus the independent MANAGER membership. No production data was
read/copied as seed input. Weekly Close's synthetic scenario is available in the
implementation, not generated by this minimal baseline.

**BILLING-GATED:** Functions deployment requires Blaze (Firebase CLI's explicit
Cloud Build/Functions guard); new default Storage bucket provisioning also
[requires Blaze](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
No billing was enabled; no Functions, Storage rules/bucket, secrets, push
registration or notification tests were provisioned. Public Offer/checklist/report,
photos, server-mediated Job actions and Dev Center generate/clear/reset are not
available remotely yet. Hosting rewrites retain the existing same-project targets;
they never route to production. Unavailable Functions do not grant access.

Developer build/navigation controls also require the existing `getDevCenterAccess`
callable; they remain fail-closed while Functions are absent. The Production build
knows only the Sandbox ID/origin locally; no Production Hosting release occurred.
The permanent Sandbox banner and `version.json` remain available without login.

No cloud end-to-end availability is claimed by provisioning core services alone.
Production remains unchanged. Deployment evidence is recorded in Draft PR #72.
