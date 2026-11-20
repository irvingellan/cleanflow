# Onboarding an additional organization

An authorized operator can provision an additional company and its managers with `scripts/provisionOrganization.mjs`. The existing default company follows its current onboarding process. The script uses the Firebase Admin SDK and the exact project ID supplied with `--project`. Every command defaults to a read-only preview. It prints the project and planned changes.

## Create a company

1. Confirm the approved Firebase project and the intended company ID. IDs contain 3–63 lowercase letters, digits or hyphens and start with a letter or digit. Use a new ID such as `example-studio`. An organization represented only by subcollections still owns its ID.
2. The intended manager must already have an Auth account in that project, through the project's approved enrollment flow. Retrieve its UID through the authorized administration interface. The script never creates accounts, handles passwords or sends email.
3. Preview the operation. In these commands, `PROJECT_ID` and `MANAGER_UID` stand for values supplied privately by the operator. The company name and ID are fictitious.

```sh
node scripts/provisionOrganization.mjs create --project "$PROJECT_ID" --org example-studio --name "Example Studio" --manager-uid "$MANAGER_UID"
```

4. Check the printed project, action and organization. After owner approval, repeat that command with `--apply`. It registers the company name and creation time, merges the selection into the account's custom claims, and grants active manager membership.
5. Ask the manager to sign out and sign in, then open the intended workspace. A fresh ID token carries the organization selection. The member record authorizes access. An existing manager of the default organization keeps the existing login behavior.

## Add, revoke or restore a manager

Preview each command first. Add `--apply` to the same command when authorized.

```sh
node scripts/provisionOrganization.mjs add-manager --project "$PROJECT_ID" --org example-studio --uid "$MANAGER_UID"
node scripts/provisionOrganization.mjs revoke --project "$PROJECT_ID" --org example-studio --uid "$MANAGER_UID"
node scripts/provisionOrganization.mjs restore --project "$PROJECT_ID" --org example-studio --uid "$MANAGER_UID"
```

Revocation deactivates the member before synchronizing Auth. Rules and manager Functions check current membership on each protected request. Previously downloaded information can remain on a device. Revocation also removes this organization claim and revokes the account's refresh tokens. An issued ID token can retain its old claim until it expires. Restoration enables the existing manager again. To recover a forgotten password, use the project's standard Firebase password-reset email flow and sign in again. Changing a password does not create or restore a membership.

The tool checks other organizations for an active membership, including legacy companies without a root document. It refuses to repurpose a cleaner account, overwrite another company's claim or reactivate a manager through `add-manager`. Unrelated claims and member fields are preserved.

## Recover an interrupted operation

An Admin-only intent at `organizationProvisioning/{uid}` records a pending operation. If Auth or Firestore fails partway through, repeat the same command with the same arguments. A pending creation can finish even though its new organization document already exists. Running `create` after a successful creation refuses the existing ID. A different command for the same account waits for the original operation to finish or receives a refusal. A new manager becomes active after Auth succeeds. No cleanup in the Firebase console is needed for a transient failure.

Independent administrative systems must coordinate custom-claim changes to the same account. Firebase Auth replaces the entire claims object and has no conditional merge API. This script reads the latest claims before each change and serializes its own operations on the account.

## Verify with the emulators

Run the existing isolation suites on their configured, available ports. The provisioning test requires both local Auth and Firestore emulators and the disposable project `demo-cleanflow`.

```sh
npm run test:tenant-isolation
npm run test:tenant-isolation:functions
npx --no-install firebase emulators:exec --project demo-cleanflow --config firebase.cleaner-hub-test.json --only auth,firestore "node --test scripts/provisionOrganization.test.mjs"
```

The final suite includes a two-company scenario. A manager signs in through the Auth emulator and creates a property and service with the client SDK under Firestore Rules. The first manager's lists must remain unchanged. Both accounts must be denied when listing the other company's properties or services.

## Offboarding and rollback

Revoke every manager provisioned for the company. Review other active access separately, including cleaner sessions and public links. Removing a company is a separate owner-authorized operation. Make and verify a managed Firestore export first, inventory stored photos and outstanding accesses, then scope the removal to the intended organization. This script has no deletion command. Reverting the tooling does not alter company documents.
