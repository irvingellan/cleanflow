import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, connectFirestoreEmulator, getDocsFromServer, getFirestore, serverTimestamp, terminate } from "firebase/firestore";
import { buildCurrentJobCreateData } from "../../src/features/jobs/jobCompatibility.js";
import { defaultOrganizationId, organizationIdFromClaims } from "../../src/services/organization/currentOrganization.js";

async function signIn(t, project, { email, password }) {
  const app = initializeApp({ projectId: project, apiKey: "emulator-only" }, randomUUID());
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, "http://" + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  connectFirestoreEmulator(db, host, Number(port));
  t.after(async () => { await terminate(db); await deleteApp(app); });
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  const { claims } = await user.getIdTokenResult(true);
  return { db, org: organizationIdFromClaims(claims) };
}

const directory = (client, name, org = client.org) => collection(client.db, "organizations", org, name);

async function lists(client) {
  const results = await Promise.all(["properties", "jobs"].map(async name => {
    const snapshot = await getDocsFromServer(directory(client, name));
    return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  }));
  return { properties: results[0], jobs: results[1] };
}

// Runs inside the emulator-only provisioning suite using real Auth sessions and the client SDK.
export async function secondCompanyScenario(t, fixture) {
  const { db, project, existingUser, provision, org } = fixture;
  const firstAccount = await existingUser();
  const secondAccount = await existingUser();
  const firstMember = db.doc(`organizations/${defaultOrganizationId}/members/${firstAccount.uid}`);
  await firstMember.set({ role: "MANAGER", active: true });
  t.after(() => firstMember.delete());
  const first = await signIn(t, project, firstAccount);
  assert.equal(first.org, defaultOrganizationId);
  const originalProperty = await addDoc(directory(first, "properties"), {
    organizationId: defaultOrganizationId, name: "Example House", active: true,
  });
  const originalJob = await addDoc(directory(first, "jobs"), {
    ...buildCurrentJobCreateData({ organizationId: defaultOrganizationId, propertyId: originalProperty.id,
      propertyName: "Example House", clientName: "Example Client", notes: "", scheduledDate: "2026-08-16" }),
    createdAt: serverTimestamp(),
  });
  t.after(async () => {
    await db.doc(originalProperty.path).delete();
    await db.doc(originalJob.path).delete();
  });
  const before = await lists(first);
  assert.ok(before.properties.some(row => row.id === originalProperty.id));
  assert.ok(before.jobs.some(row => row.id === originalJob.id));

  await provision("create", secondAccount.uid);
  const second = await signIn(t, project, secondAccount);
  assert.equal(second.org, org);
  const property = await addDoc(directory(second, "properties"), {
    organizationId: org, name: "Example Studio", active: true,
  });
  const job = await addDoc(directory(second, "jobs"), {
    ...buildCurrentJobCreateData({ organizationId: org, propertyId: property.id, propertyName: "Example Studio",
      clientName: "Example Client", notes: "", scheduledDate: "2026-08-17", scheduledStart: "10:00" }),
    createdAt: serverTimestamp(),
  });
  const own = await lists(second);
  assert.deepEqual(own.properties.map(row => row.id), [property.id]);
  assert.deepEqual(own.jobs.map(row => row.id), [job.id]);
  assert.deepEqual(await lists(first), before);
  for (const [account, other] of [[first, org], [second, defaultOrganizationId]]) {
    for (const name of ["properties", "jobs"]) {
      await assert.rejects(getDocsFromServer(directory(account, name, other)), { code: "permission-denied" });
    }
  }
}
