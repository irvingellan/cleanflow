# CleanFlow — Firebase Operations Guide

This document defines the safe operating model for Firebase-aware humans and agents working on CleanFlow.

## Environment model

CleanFlow has two intentionally different contexts:

| Context | Purpose | Default for agent work? |
| --- | --- | --- |
| `demo-cleanflow` + Firebase Emulator Suite | Development, debugging, fixtures, integration tests, E2E | Yes |
| Live Firebase project configured by `.firebaserc` | Production-like remote services | No; explicit approval required |

A local repository knowing the live Firebase project ID does **not** grant permission to change remote Firebase resources.

## Default development loop

1. Read the relevant product/domain docs and existing implementation.
2. Make changes on a branch.
3. Run deterministic unit/component tests.
4. Run Firebase-backed behavior against `demo-cleanflow` emulators.
5. Run the production build locally.
6. Review the diff for security rules, indexes, Functions and environment changes.
7. Open a pull request.
8. Treat any remote deploy as a separate operation requiring explicit approval.

Useful commands:

```bash
npm test
npm run test:e2e
npm run build
npm run verify
npm run firebase:emulators
```

## Remote-action approval boundary

The following actions are never implied by a coding task and require explicit approval for the specific action:

- Firebase Hosting deploy
- Cloud Functions deploy
- Firestore rules deploy
- Firestore indexes deploy
- Storage rules deploy
- production data writes, deletes or migrations
- production seed scripts
- remote cleanup jobs
- changes that can materially increase Firebase cost

Before an approved remote action, report:

1. Firebase project being targeted.
2. Services being changed.
3. Why the remote action is necessary.
4. Expected user/data/cost impact.
5. Validation already completed locally.
6. Recovery or rollback approach.

## Security-rule changes

Firestore and Storage rules are production authorization code.

When changing rules:

- make the smallest change that satisfies the requirement;
- preserve deny-by-default behavior;
- avoid tenant IDs, user IDs or roles hard-coded as permanent architecture;
- test allowed and denied cases where practical;
- document any temporary authorization assumptions;
- review whether an index or server-mediated Function is safer than broadening client permissions.

## Data and fixtures

Development and automated tests must use fictitious data.

Never copy production customer data, property access instructions, payment details, real phone numbers, raw conversations or credentials into fixtures, screenshots, tests or public documentation.

## Functions and server mediation

Prefer a Cloud Function when an operation requires trusted authorization, secrets, third-party credentials, privileged aggregation or invariant enforcement that should not be left to the browser.

Functions should still be exercised locally against emulators where practical before any deployment is considered.

## Cost awareness

The live project is on a usage-based Firebase plan. Agent work should therefore avoid accidental remote loops, broad unbounded queries, repeated writes, unnecessary Function invocations and unreviewed Storage operations.

Cost-sensitive architectural changes should be called out in the pull request.

## Definition of ready for deploy

A change may be considered technically ready for a deployment decision when:

- relevant tests pass;
- emulator-backed behavior passes where applicable;
- `npm run build` succeeds;
- security-rule/index changes have been reviewed;
- no secrets or real customer data are present;
- the pull request explains operational impact;
- deployment has **not** been performed unless explicitly approved.
