import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defaultOrganizationId, isOrganizationId } from "../src/services/organization/currentOrganization.js";

class ProvisioningError extends Error {}

function requireInput(condition, message) {
  if (!condition) throw new ProvisioningError(message);
}

export function parseCommand(args) {
  const { values, positionals, tokens } = parseArgs({
    args, allowPositionals: true, tokens: true,
    options: { project: { type: "string" }, org: { type: "string" }, name: { type: "string" },
      uid: { type: "string" }, "manager-uid": { type: "string" }, apply: { type: "boolean", default: false } },
  });
  const options = tokens.filter(token => token.kind === "option").map(token => token.name);
  requireInput(new Set(options).size === options.length, "An option was specified more than once.");
  const [action] = positionals;
  requireInput(positionals.length === 1 && ["create", "add-manager", "revoke", "restore"].includes(action),
    "Select create, add-manager, revoke, or restore.");
  requireInput(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(values.project || ""), "Supply an explicit Firebase project ID.");
  requireInput(isOrganizationId(values.org) && values.org !== defaultOrganizationId,
    "Supply a valid organization ID for an additional company.");
  const uid = values.uid ?? values["manager-uid"];
  requireInput(!(values.uid && values["manager-uid"]) && typeof uid === "string" && uid.length > 0 && uid.length <= 128
    && !/[\x00-\x1f\x7f/]/.test(uid) && ![".", ".."].includes(uid), "Supply one valid existing Auth UID.");
  const name = values.name?.trim();
  requireInput(action === "create" ? Boolean(name && name.length <= 80) : values.name === undefined,
    "Supply a company name of up to 80 characters for create only.");
  return { project: values.project, org: values.org, uid, name, action, apply: values.apply };
}

function assertCompatibleAccount(user, org) {
  const claims = user.customClaims || {};
  requireInput(!claims.cleanerHub && (claims.organizationId == null || claims.organizationId === org),
    "The account already selects another organization or uses Cleaner Hub access.");
}

// The Admin SDK replaces the claims object. Always base the update on a fresh user record.
async function syncAuth(auth, command) {
  const { uid, org, action } = command;
  const user = await auth.getUser(uid);
  assertCompatibleAccount(user, org);
  const claims = { ...user.customClaims };
  if (action === "revoke") {
    if (Object.hasOwn(claims, "organizationId")) {
      delete claims.organizationId;
      await auth.setCustomUserClaims(uid, claims);
    }
    await auth.revokeRefreshTokens(uid);
  } else if (claims.organizationId !== org) {
    await auth.setCustomUserClaims(uid, { ...claims, organizationId: org });
  }
}

function assertManager(doc, org) {
  requireInput(!doc.exists || (doc.get("role") === "MANAGER"
    && (doc.get("organizationId") == null || doc.get("organizationId") === org)),
  "The target membership belongs to a different role or organization.");
}

export async function provisionOrganization({ db, auth }, command) {
  const { project, action, org, uid, name, apply } = command;
  requireInput(db.projectId === project && auth.app.options.projectId === project, "Firebase project mismatch.");
  const organizations = db.collection("organizations");
  const target = organizations.doc(org);
  const member = target.collection("members").doc(uid);
  const guard = db.collection("organizationProvisioning").doc(uid);
  const operationId = randomUUID();
  const operation = await db.runTransaction(async tx => {
    const [pending, company, local] = await tx.getAll(guard, target, member);
    // Read current claims and enumerate roots after acquiring the account guard.
    // listDocuments includes historical organizations with only subcollections.
    assertCompatibleAccount(await auth.getUser(uid), org);
    const roots = await organizations.listDocuments();
    assertManager(local, org);
    if (pending.exists) {
      requireInput(pending.get("org") === org && pending.get("action") === action && pending.get("name") === (name ?? null),
        "Another provisioning operation for this account is incomplete. Re-run its original command first.");
    } else {
      const exists = company.exists || roots.some(ref => ref.id === org);
      if (action === "create") requireInput(!exists, "The organization ID already exists.");
      else requireInput(exists, "The target organization does not exist.");
      if (action === "add-manager") requireInput(!local.exists || local.get("active") === true,
        "Use restore for an inactive manager.");
      if (["revoke", "restore"].includes(action)) requireInput(local.exists, "The target manager does not exist.");
    }
    const others = roots.filter(ref => ref.id !== org).map(ref => ref.collection("members").doc(uid));
    for (let i = 0; i < others.length; i += 100) {
      const memberships = await tx.getAll(...others.slice(i, i + 100), { fieldMask: ["active"] });
      requireInput(memberships.every(doc => doc.get("active") !== true), "The account is active in another organization.");
    }
    if (pending.exists) return pending.get("operationId");
    if (apply) {
      if (action === "create") tx.create(target, { name, createdAt: FieldValue.serverTimestamp() });
      // A revocation takes effect before Auth synchronization. A new grant only becomes active afterwards.
      if (action === "revoke") tx.update(member, { active: false });
      tx.create(guard, { org, action, name: name ?? null, operationId });
    }
    return operationId;
  }, apply ? {} : { readOnly: true });
  if (!apply) return;

  // Take the account's server transaction lock before synchronizing Auth. The durable intent
  // allows the same command to finish after an interruption between the two services.
  await db.runTransaction(async tx => {
    const [state, local] = await tx.getAll(guard, member);
    if (state.get("operationId") !== operation) return; // A concurrent invocation already completed it.
    assertManager(local, org);
    await syncAuth(auth, command);
    if (action !== "revoke") tx.set(member, { role: "MANAGER", active: true, organizationId: org }, { merge: true });
    tx.delete(guard);
  }, { maxAttempts: 1 });
}

export function checkTarget(project, env) {
  for (const configured of [env.GCLOUD_PROJECT, env.GOOGLE_CLOUD_PROJECT]) {
    requireInput(!configured || configured === project, "The environment and explicit project disagree.");
  }
  const local = [env.FIRESTORE_EMULATOR_HOST, env.FIREBASE_AUTH_EMULATOR_HOST];
  if (local.some(Boolean)) requireInput(project.startsWith("demo-") && local.every(host => /^127\.0\.0\.1:\d{2,5}$/.test(host || "")),
    "Use both loopback emulators with an explicit demo project, or neither emulator.");
}

async function main() {
  const command = parseCommand(process.argv.slice(2));
  checkTarget(command.project, process.env);
  console.log(`Project ${command.project}. ${command.apply ? "Apply" : "Dry run"}: ${command.action} on ${command.org}.`);
  const app = initializeApp({ projectId: command.project });
  try {
    await provisionOrganization({ db: getFirestore(app), auth: getAuth(app) }, command);
    if (command.apply) {
      console.log("Completed.");
    } else {
      if (command.action === "create") console.log("Would create the organization document with its name and registration time.");
      console.log(command.action === "revoke"
        ? "Would deactivate the membership, remove this organization claim and revoke refresh tokens."
        : "Would merge the organization claim and activate the manager membership.");
      console.log("Validation passed. No writes. Repeat with --apply to perform this operation.");
    }
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    // Admin SDK errors or malformed arguments can contain account details.
    console.error(error instanceof ProvisioningError ? error.message : "Provisioning did not complete. Check arguments, project access and the existing Auth account.");
    process.exitCode = 1;
  });
}
