# Visual smoke testing

This optional local workflow uses the globally installed `agent-browser` CLI to inspect
rendered CleanFlow behavior and capture screenshots. It complements, but does not replace,
Vitest and Playwright: deterministic regressions belong in the automated suites.

## When to use it

Use this after a meaningful visual, responsive, or multi-step workflow change when a
human-readable browser pass can catch layout, accessibility, or integration problems.
It is not a CI requirement and should not be used for every small non-visual change.

All visual testing uses the `demo-cleanflow` Firebase emulators and E2E-only fixture data.
Never point this workflow at production Firebase or capture production/customer data.

## Local setup

The emulator build still needs the repository's normal `VITE_FIREBASE_*` web configuration
to build the client and messaging worker. It introduces no new secret values: the client
initialization forces its Firebase project to `demo-cleanflow` only in emulator mode.

Build the emulator configuration and prepare the local evidence directory:

```bash
npm run visual:env
npm run visual:smoke
```

In Terminal A, run Auth, Firestore, Functions, and Hosting. Public offer testing needs the
Hosting rewrite to the Functions emulator, so a plain Vite server is insufficient.

```bash
firebase emulators:start --project demo-cleanflow --only auth,firestore,functions,hosting
```

In Terminal B, seed the deterministic fixture set. This script refuses non-local emulator
hosts and writes only to `demo-cleanflow`.

```bash
npm run visual:fixtures
```

The manager fixture credentials are exported from `e2e/globalSetup.js`; use those fixtures
only in the local emulators. Screenshots and browser output belong under the ignored
`artifacts/visual-smoke/` directory. Remove them with `npm run visual:clean` when finished.

## Agent-browser conventions

Keep separate sessions for manager and public-cleaner views. Start every interaction with a
semantic snapshot and use the returned refs for clicks and fields; do not depend on fragile
CSS selectors. Save a labeled screenshot after each critical state.

```bash
agent-browser --session cleanflow-manager --screenshot-dir artifacts/visual-smoke open http://127.0.0.1:5002
agent-browser --session cleanflow-manager snapshot -i
# Use the snapshot refs to enter the local E2E manager fixture credentials and sign in.
agent-browser --session cleanflow-manager screenshot --annotate artifacts/visual-smoke/manager-home.png
```

Use `agent-browser --session cleanflow-manager set viewport 390 844` before a mobile pass.
Use a separate `cleanflow-public` session for an anonymous public-offer link. Do not save or
publish token-bearing URLs in checked-in files or reports.

## Initial smoke journeys

### A. Manager Job / Offer (schema v2)

1. Sign in locally and open **E2E V2 Offer Property** → its Job Detail.
2. Confirm the empty v2 Job shows the primary Offer action; send offers to two E2E cleaners.
3. Confirm offer cards render, then inspect the resulting Job Detail with `snapshot -i` and
   save `manager-v2-offers.png` with `screenshot --annotate`.
4. Confirm the expected action and status text are visible. Do not reuse production offers.

### B. Public Offer through Hosting + Functions

1. From the same local v2 Job, generate a public offer link through the manager UI.
2. Open that link in the unauthenticated `cleanflow-public` session at `http://127.0.0.1:5002`.
3. Save `public-offer.png`, then use a semantic snapshot to confirm the public projection shows
   only the intended property/date/offer response information.
4. Specifically verify it does not show client price, cleaner payout, other cleaners,
   assignments, internal notes, or invoices.

### C. Mobile Job Detail

1. In the signed-in manager session, set the viewport to `390 × 844`.
2. Open a fixture Job Detail, take `mobile-job-detail.png`, and inspect the snapshot.
3. Check for readable actions, no horizontal overflow, and usable status/offer cards.

### D. Property operational navigation

1. Open **E2E Client Property** from Properties and inspect its upcoming-services section.
2. Use **View all upcoming services**, then open a Job from the filtered Jobs screen.
3. Use Back from Job Detail and confirm the filtered Jobs context remains usable.
4. Save `property-upcoming-navigation.png` at the Job Detail or filtered Jobs state.

## Evidence and follow-up

`snapshot -i` is the primary debugging artifact; annotated screenshots provide fast visual
review. Record only short findings in the task report, then convert a deterministic regression
into Vitest or Playwright coverage when practical. This workflow neither changes CI nor adds an
application dependency.
