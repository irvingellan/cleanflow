# CleanFlow Sandbox

Status: **Foundation V0 prepared; dedicated Firebase project not created yet.**

## Environment model

CleanFlow intentionally has three different roles:

- **Production** — Firebase project `clean-flow-prototipo`; real Gabi pilot data; stable releases only.
- **Sandbox** — a separate Firebase project and Hosting origin; synthetic/resettable test data only; human feature review.
- **Firebase Emulator** — local/automated tests and deterministic scenarios only.

The Sandbox is an environment, not a permanent Git branch. Feature branches may be deployed to it temporarily for human review. `main` remains the production release source of truth.

## Non-negotiable safety boundaries

- Never hot-swap Firebase projects inside one running SPA.
- Never copy production Firestore/Auth/Storage data into Sandbox.
- Never allow Dev Center demo mutations in Production.
- A Sandbox build must bind to one explicit non-production Firebase project at build time.
- A deployed build also checks its Hosting origin and fails closed if Production/Sandbox origins are crossed.
- Sandbox always displays a permanent **SANDBOX · TEST DATA** banner.
- Production-to-Sandbox navigation is visible only to an authorized developer and performs normal cross-origin navigation.
- Automated tests continue using Firebase Emulator; Sandbox is not a CI/E2E replacement.

## Repository preparation in Foundation V0

- `.firebaserc` has an explicit `prod` alias for `clean-flow-prototipo`.
- The `sandbox` alias is intentionally not guessed. Add it only after the real project ID exists.
- `npm run build:sandbox` builds with Vite mode `sandbox`.
- `.env.sandbox.example` documents the required Sandbox web-app configuration.
- Client Firebase initialization rejects a Sandbox build bound to Production.
- Client Hosting-origin checks reject Production/Sandbox deployment crossover.
- Dev Center Functions classify runtime as `emulator`, `sandbox`, `production`, or `unknown`.
- Mutating Dev Center callables accept only Emulator or an exact server-configured Sandbox project ID. Production and unknown projects fail closed.

## One-time activation after the Firebase project exists

1. Create a dedicated Firebase project. Do not use or clone `clean-flow-prototipo`.
2. Record its exact project ID and register a Web app.
3. Copy `.env.sandbox.example` to local `.env.sandbox` and insert that Sandbox Web config.
4. Add the Firebase CLI alias `sandbox` pointing to the exact new project ID.
5. In the Sandbox Functions configuration, set `DEV_CENTER_SANDBOX_PROJECT_ID` to that exact same project ID.
6. Configure `DEV_CENTER_DEVELOPER_UIDS` for the Sandbox project's developer Auth UID.
7. Enable the Firebase products required by the current CleanFlow app and create only synthetic/test manager membership data.
8. Build with `npm run build:sandbox`; deploy only with the explicit `sandbox` target/project.
9. Verify the permanent Sandbox banner and run a Dev Center synthetic scenario before publishing any feature branch for review.

## Human review target

The intended steady-state loop is:

`feature branch → Sandbox deploy → Open Sandbox → human review → merge/revise → main → Production`

Weekly Close V0 remains isolated on `feature/weekly-close-v0-2026-10-01` until this environment is activated and reviewed there.
