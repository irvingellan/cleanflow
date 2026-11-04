import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Fictitious records on isolated demo-cleanflow emulators only.
for (const [name, value] of Object.entries({
  GCLOUD_PROJECT: "demo-cleanflow",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:18280",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19280",
})) assert.equal(process.env[name], value, `Cleaner Hub E2E requires local ${name}`);

const app = getApps().find((candidate) => candidate.name === "cleaner-hub-e2e")
  || initializeApp({ projectId: "demo-cleanflow" }, "cleaner-hub-e2e");
export const db = getFirestore(app);
export const auth = getAuth(app);
export const organizationId = "cleanflow-demo";
export const orgRef = db.collection("organizations").doc(organizationId);

export function dateKey(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export async function seed() {
  const run = randomUUID().slice(0, 8);
  const manager = { email: `manager-${run}@example.test`, password: "SyntheticOnly123!" };
  const user = await auth.createUser({ ...manager, emailVerified: true });
  const now = Timestamp.now();
  const shared = { organizationId, active: true, dataProvenance: "DEMO", createdAt: now, updatedAt: now };
  const ids = {
    clientId: `client-${run}`,
    mapleId: `maple-${run}`,
    birchId: `birch-${run}`,
    cedarId: `cedar-${run}`,
    cedarJobId: `cedar-job-${run}`,
    cleanerAId: `ana-${run}`,
    cleanerBId: `bia-${run}`,
  };
  const batch = db.batch();
  batch.set(orgRef.collection("members").doc(user.uid), { role: "MANAGER", active: true });
  batch.set(orgRef.collection("clients").doc(ids.clientId), { ...shared, name: "Synthetic Client Co" });
  for (const [id, name] of [[ids.mapleId, `Maple Example House ${run}`], [ids.birchId, `Birch Example Flat ${run}`], [ids.cedarId, `Cedar Example Loft ${run}`]]) {
    batch.set(orgRef.collection("properties").doc(id), {
      ...shared, name, clientId: ids.clientId, clientName: "Synthetic Client Co",
      defaultClientPrice: 250, defaultCleanerPrice: 150,
      keyCodeInfo: "private-door-marker", accessInstructions: "private-access-marker",
    });
  }
  batch.set(orgRef.collection("cleaners").doc(ids.cleanerAId), { ...shared, name: `Ana Example ${run}`, preferredLanguage: "pt", phone: "+15555550101" });
  batch.set(orgRef.collection("cleaners").doc(ids.cleanerBId), { ...shared, name: `Bia Example ${run}`, preferredLanguage: "en", phone: "+15555550102" });
  // Same shape the manager form writes (buildCurrentJobCreateData); assigned later
  // through the real assignCleanerDirectly callable.
  batch.set(orgRef.collection("jobs").doc(ids.cedarJobId), {
    organizationId, propertyId: ids.cedarId, propertyName: `Cedar Example Loft ${run}`, clientId: ids.clientId,
    clientName: "Synthetic Client Co", scheduledDate: dateKey(2), scheduledStart: "08:15", notes: "private-note-marker",
    operationalStatus: "UNASSIGNED", schemaVersion: 2, checklistContextRevision: 0, assignedCleanerIds: [],
    dataProvenance: "DEMO", clientPrice: 250, cleanerPayout: 150, createdAt: now,
  });
  await batch.commit();
  return {
    cedarName: `Cedar Example Loft ${run}`,
    run, manager, managerUid: user.uid, ...ids,
    mapleName: `Maple Example House ${run}`, birchName: `Birch Example Flat ${run}`,
    cleanerAName: `Ana Example ${run}`, cleanerBName: `Bia Example ${run}`,
  };
}

/** Real callable over HTTP with the manager's own emulator ID token. */
export async function managerCall(fixture, name, data) {
  const signIn = await fetch("http://127.0.0.1:19280/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: fixture.manager.email, password: fixture.manager.password, returnSecureToken: true }),
  });
  const { idToken } = await signIn.json();
  const response = await fetch(`http://127.0.0.1:15280/demo-cleanflow/us-central1/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`callable-${name}-${body.error?.status || response.status}`);
  return body.result;
}

export async function jobsForProperty(propertyId) {
  return (await orgRef.collection("jobs").where("propertyId", "==", propertyId).get()).docs;
}

export async function agendaFor(cleanerId) {
  return (await orgRef.collection("cleanerAgenda").where("cleanerId", "==", cleanerId).get()).docs.map((doc) => doc.data());
}
