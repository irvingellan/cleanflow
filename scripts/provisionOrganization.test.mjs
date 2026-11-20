import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { secondCompanyScenario } from "../e2e/scenarios/second-company.mjs";
import { defaultOrganizationId } from "../src/services/organization/currentOrganization.js";
import { checkTarget, parseCommand, provisionOrganization } from "./provisionOrganization.mjs";

const project = "demo-cleanflow";
assert.equal(process.env.GCLOUD_PROJECT, project);
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  assert.match(process.env[name] || "", /^127\.0\.0\.1:\d{2,5}$/, "Provisioning tests require two loopback emulators.");
}
checkTarget(project, process.env);
const app = initializeApp({ projectId: project }, "provisioning-test");
const auth = getAuth(app);
const db = getFirestore(app);
after(() => deleteApp(app));

function fixture(t) {
  const org = "org-b-" + randomUUID();
  const company = db.collection("organizations").doc(org);
  t.after(() => db.recursiveDelete(company));
  async function existingUser() {
    const email = randomUUID() + "@example.invalid";
    const password = randomUUID() + "aA1!";
    const { uid } = await auth.createUser({ email, password });
    t.after(async () => {
      await db.collection("organizationProvisioning").doc(uid).delete();
      await auth.deleteUser(uid);
    });
    return { uid, email, password };
  }
  function provision(action, uid, options = {}, provider = auth) {
    return provisionOrganization({ db, auth: provider }, { project, action, uid, org,
      name: action === "create" ? "Example Company" : undefined, apply: true, ...options });
  }
  return { db, project, org, company, existingUser, provision };
}

test("requires an explicit project and validates flags, organization and emulator pairing", () => {
  const args = ["create", "--org", "org-b", "--manager-uid", "example-account", "--name", "Example Company"];
  assert.throws(() => parseCommand(args), /explicit/);
  const full = [...args, "--project", project];
  assert.equal(parseCommand(full).apply, false);
  assert.throws(() => parseCommand([...full, "--other"]), /option/i);
  assert.throws(() => parseCommand([...full, "--project", project]), /more than once/);
  assert.throws(() => parseCommand(["restore", "--org", defaultOrganizationId, "--uid", "example", "--project", project]), /additional/);
  assert.throws(() => checkTarget(project, { GCLOUD_PROJECT: "example-project" }), /disagree/);
  assert.throws(() => checkTarget(project, { FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080" }), /both/);
});

test("the CLI dry run prints its plan, keeps the account claims and writes no documents", async t => {
  const { existingUser, org, company } = fixture(t);
  const { uid } = await existingUser();
  await auth.setCustomUserClaims(uid, { unrelated: "keep" });
  const { stdout } = await promisify(execFile)(process.execPath, [
    fileURLToPath(new URL("./provisionOrganization.mjs", import.meta.url)),
    "create", "--project", project, "--org", org, "--name", "Example Company", "--manager-uid", uid,
  ]);
  assert.match(stdout, /demo-cleanflow/);
  assert.match(stdout, /Would create/);
  assert.match(stdout, /No writes/);
  assert.ok(!stdout.includes(uid));
  assert.equal((await company.get()).exists, false);
  assert.equal((await company.collection("members").doc(uid).get()).exists, false);
  assert.equal((await db.collection("organizationProvisioning").doc(uid).get()).exists, false);
  assert.deepEqual((await auth.getUser(uid)).customClaims, { unrelated: "keep" });
});

test("creates, adds, revokes and restores managers while preserving unrelated claims and member fields", async t => {
  const { org, company, existingUser, provision } = fixture(t);
  const first = (await existingUser()).uid;
  const second = (await existingUser()).uid;
  await auth.setCustomUserClaims(first, { unrelated: true });
  await provision("create", first);
  const root = await company.get();
  assert.equal(root.get("name"), "Example Company");
  assert.ok(root.get("createdAt").toMillis() > 0);
  assert.deepEqual((await auth.getUser(first)).customClaims, { organizationId: org, unrelated: true });
  await assert.rejects(provision("create", first), /already exists/);
  await provision("add-manager", second);
  const member = company.collection("members").doc(second);
  assert.deepEqual((await member.get()).data(), { role: "MANAGER", organizationId: org, active: true });
  await member.update({ extra: "keep" });
  await auth.setCustomUserClaims(second, { unrelated: "kept", organizationId: org });
  let revoked = false;
  const observedAuth = { app, getUser: uid => auth.getUser(uid),
    setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
    revokeRefreshTokens: async uid => { await auth.revokeRefreshTokens(uid); revoked = true; } };
  await provision("revoke", second, {}, observedAuth);
  assert.equal(revoked, true);
  assert.equal((await member.get()).get("active"), false);
  assert.deepEqual((await auth.getUser(second)).customClaims, { unrelated: "kept" });
  await assert.rejects(provision("add-manager", second), /restore/);
  await provision("restore", second);
  assert.deepEqual((await member.get()).data(), { role: "MANAGER", organizationId: org, active: true, extra: "keep" });
  assert.deepEqual((await auth.getUser(second)).customClaims, { organizationId: org, unrelated: "kept" });
});

test("refuses an unknown Auth account, an implicit existing organization, or an active legacy membership", async t => {
  const { org, company, existingUser, provision } = fixture(t);
  await assert.rejects(provision("create", randomUUID()), { code: "auth/user-not-found" });
  const { uid } = await existingUser();
  const legacy = db.doc(`organizations/${defaultOrganizationId}/members/${uid}`);
  await legacy.set({ active: true, role: "MANAGER" });
  t.after(() => legacy.delete());
  await assert.rejects(provision("create", uid), /active in another/);
  assert.equal((await company.get()).exists, false);
  assert.deepEqual((await auth.getUser(uid)).customClaims ?? {}, {});
  await legacy.delete();
  await company.collection("properties").doc("example").set({ organizationId: org });
  await assert.rejects(provision("create", uid), /already exists/);
});

test("resumes the same operation after an Auth interruption and refuses to revoke a different company's claim", async t => {
  const { org, company, existingUser, provision } = fixture(t);
  const { uid } = await existingUser();
  await auth.setCustomUserClaims(uid, { unrelated: true });
  const interrupted = { app, getUser: value => auth.getUser(value), setCustomUserClaims: async () => { throw Error("offline"); } };
  await assert.rejects(provision("create", uid, {}, interrupted), /offline/);
  const member = company.collection("members").doc(uid);
  assert.equal((await member.get()).exists, false);
  await assert.rejects(provision("add-manager", uid), /incomplete/);
  await provision("create", uid);
  assert.deepEqual((await auth.getUser(uid)).customClaims, { unrelated: true, organizationId: org });
  assert.equal((await member.get()).get("active"), true);
  await auth.setCustomUserClaims(uid, { unrelated: true, organizationId: "example-other" });
  await assert.rejects(provision("revoke", uid), /another organization/);
  assert.equal((await member.get()).get("active"), true);
  assert.deepEqual((await auth.getUser(uid)).customClaims, { unrelated: true, organizationId: "example-other" });
});

test("two concurrent company creations for one account cannot grant two memberships", async t => {
  const a = fixture(t);
  const b = fixture(t);
  const { uid } = await a.existingUser();
  const outcomes = await Promise.allSettled([a.provision("create", uid), b.provision("create", uid)]);
  assert.equal(outcomes.filter(row => row.status === "fulfilled").length, 1);
  const rows = await db.getAll(a.company, b.company,
    a.company.collection("members").doc(uid), b.company.collection("members").doc(uid));
  assert.equal(rows.filter(row => row.exists).length, 2);
  const selected = (await auth.getUser(uid)).customClaims.organizationId;
  assert.equal(rows[0].exists, a.org === selected);
  assert.equal(rows[2].exists, a.org === selected);
});

test("a second company's signed-in manager creates a property and job in isolated lists", async t => {
  await secondCompanyScenario(t, fixture(t));
});
