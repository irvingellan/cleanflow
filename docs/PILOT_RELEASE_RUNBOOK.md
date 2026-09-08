# Pilot release runbook

This runbook is for the first gradual manager pilot. CleanFlow remains
supplementary to the manager's spreadsheet until the pilot is deliberately
expanded. Do not run seed scripts, Dev Center generation, cleanup, or database
maintenance as part of a release.

## Release gate

Do not deploy until all of these are true:

- the intended commit is reviewed, `git status --short` contains no unexpected
  files, and local `main` is current with its remote;
- `npm test`, `npm run test:e2e`, `npm run build`, and `git diff --check` pass;
- the Firebase Authentication console has been reviewed: Email/Password is
  enabled, public self-registration is not exposed by the app, and only the
  intended manager/developer accounts can sign in;
- a Firestore managed export has completed and its Cloud Storage location is
  recorded outside the repository;
- the six `VITE_FIREBASE_*` web configuration values are available for the
  production build; `VITE_FIREBASE_VAPID_KEY` is also required for manager push
  notification enrollment;
- Secret Manager has enabled versions for `GITHUB_FEEDBACK_TOKEN` and
  `DEV_CENTER_DEVELOPER_UIDS`. Do not read, print, or commit their values.

The current Firestore and Storage rules are a closed-pilot development boundary:
any authenticated user can access `organizations/cleanflow-demo/**`. This is
acceptable only while the Firebase Auth account list is tightly controlled.
Do not add cleaners or clients as authenticated users under these rules.

## Backup and recovery

There is no repository-managed production backup or restore script. Before every
pilot release, create a managed Firestore export to a restricted Cloud Storage
bucket. For example, after Cloud Storage and IAM are configured:

```bash
gcloud firestore export gs://<restricted-pilot-backup-bucket>/cleanflow/<utc-release-id> \
  --project clean-flow-prototipo
```

Use the Google Cloud Console if `gcloud` is not installed. Wait for the export
operation to complete, verify its metadata/files in the bucket, and record the
export URI and release commit in the private operations record. See the official
[Firestore export/import guidance](https://cloud.google.com/firestore/native/docs/manage-data/export-import).

An import is a controlled recovery operation, not a routine rollback: stop
manager writes first, assess documents created after the export, and reconcile
with the spreadsheet. An import does not replace the need to review data that
may have changed after the snapshot.

## Data safety and demo records

- Dev Center records are identifiable by `demoSeed: true`, `demoSeedBatch`, and
  `demoSeedScenario`; server-side cleanup targets only those records and is
  separately UID-authorized.
- Older fixture scripts use deterministic IDs and/or `fixture: true`, but they
  are not compatible with Dev Center cleanup. Treat them as legacy test data,
  not automatically removable data.
- Any unmarked production record is **unknown/possibly real**. Never delete or
  modify it through a cleanup action without a reviewed inventory.
- `npm run seed:properties`, `npm run seed:cleaners`, and `npm run seed:dashboard`
  are development tooling, not pilot operations. Do not run them against the
  production Firebase project.

Before pilot use, perform a private, read-only Console inventory of top-level
Clients, Properties, Cleaners, Jobs, Payouts, and Job Offer/Issue children. Count
marked Dev Center records separately; do not copy operational values into this
repository or release notes.

## Deployment order

The current manager frontend and `publicOffer` Function must be released
together. Assignment-aware Jobs use the newer public-offer eligibility and safe
projection; Hosting alone can leave the client ahead of the Function.

1. Pull the reviewed commit and run the release-gate validation commands.
2. Confirm the backup and Firebase Auth/Secret Manager checks above.
3. Deploy Functions first:

   ```bash
   firebase deploy --only functions --project clean-flow-prototipo
   ```

4. Deploy the already-built Hosting bundle:

   ```bash
   firebase deploy --only hosting --project clean-flow-prototipo
   ```

5. Run the smoke tests below from the hosted URL.

`firestore.rules`, `firestore.indexes.json`, and `storage.rules` have no changes
after the original public release in this repository. Do not deploy them by
default. Deploy a rules/index/storage change only when its source diff has been
reviewed and the release explicitly calls for it.

## Post-deploy smoke tests

### Manager

1. Open `https://clean-flow-prototipo.web.app`, sign in as the pilot manager,
   and verify the Dashboard loads.
2. Verify Today/Tomorrow Jobs appear in Next 48 Hours and a current unassigned
   Job appears in Needs Attention ahead of stale open work.
3. Open a Job, confirm the assigned-cleaner/Assignment presentation is correct,
   and inspect the copy-cleaner-reminder action without sending a message.
4. Create or inspect one intentionally retained pilot Job; verify its Property,
   client snapshot, and optional guest context where used.
5. Verify the installed PWA opens the current version and manager push enrollment
   remains available on a supported device.

### Public cleaner offer

1. From a designated pilot Job, create one public offer link for a cleaner.
2. Open it in a private browser/device and confirm it shows only cleaner-safe
   property/date/status information.
3. Use one test offer to choose Interested and another to choose Not available;
   refresh Job Detail to verify the responses without automatic assignment.
4. Open an invalid or expired link and confirm it returns the unavailable/expired
   state without exposing Job data.

## Stop conditions and rollback

Stop pilot use and keep the spreadsheet authoritative if any of these occur:

- an unintended authenticated account can read operational data;
- a public offer exposes client financial data, notes, access details, or another
  cleaner's information;
- a manager write is missing, duplicated, or materially disagrees with the
  spreadsheet;
- Functions and Hosting appear version-incompatible; or
- backup completion cannot be verified before a release.

For a software-only regression, stop new CleanFlow writes, identify the last
known-good commit, validate it, then deploy its Functions before its Hosting
bundle. For data-impacting incidents, stop writes and use the recorded managed
export only after a scoped recovery plan; reconcile all post-export work against
the spreadsheet before resuming.

## Pilot operating rule

The design-partner manager keeps the spreadsheet in parallel during the initial
pilot. CleanFlow is a structured operational aid and learning surface, not yet
the sole system of record. Record workflow discrepancies as feedback and do not
silently repair production data outside an explicit maintenance decision.
