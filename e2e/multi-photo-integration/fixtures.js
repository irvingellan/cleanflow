import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
for (const [key, value] of Object.entries({ GCLOUD_PROJECT: 'demo-cleanflow', FIRESTORE_EMULATOR_HOST: '127.0.0.1:18480',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19419', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:19499' })) assert.equal(process.env[key], value);
assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, '/nonexistent/cleanflow-multiphoto-e2e-no-credentials.json');
assert.equal(existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS), false);
const app = initializeApp({ projectId: 'demo-cleanflow', storageBucket: 'demo-cleanflow.appspot.com' });
const db = getFirestore(app), bucket = getStorage(app).bucket();
const root = 'organizations/cleanflow-demo';
export const hostingOrigin = 'http://127.0.0.1:14213';
export const managerHarnessOrigin = 'http://127.0.0.1:14214';
export async function createManager() {
  const email = `synthetic-${randomUUID()}@example.test`, password = 'SyntheticOnly123!';
  const user = await getAuth(app).createUser({ email, password });
  await db.doc(`${root}/members/${user.uid}`).set({ role: 'MANAGER', active: true });
  const response = await fetch('http://127.0.0.1:19419/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const { idToken } = await response.json(); assert.ok(idToken);
  const call = async (name, data, authorized = true) => {
    const response = await fetch(`http://127.0.0.1:15401/demo-cleanflow/us-central1/${name}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${idToken}` } : {}) }, body: JSON.stringify({ data }) });
    const body = await response.json(); if (!response.ok) throw new Error(`callable-${name}-${body.error?.status || response.status}`);
    return body.result || body.data;
  };
  call.uid = user.uid;
  return call;
}
export async function createRun(call, { legacy = false, historicalV2 = false, maxPhotos, maxTotalBytes } = {}) {
  const jobId = `synthetic-${randomUUID()}`, cleanerId = `cleaner-${randomUUID()}`, propertyId = `property-${randomUUID()}`;
  const clientId = `client-${randomUUID()}`;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const jobRef = db.doc(`${root}/jobs/${jobId}`), runRef = jobRef.collection('checklistRuns').doc('initial');
  await db.doc(`${root}/clients/${clientId}`).set({ organizationId: 'cleanflow-demo', name: 'Synthetic Owner' });
  await db.doc(`${root}/properties/${propertyId}`).set({ organizationId: 'cleanflow-demo', clientId, name: 'Synthetic Integration Property', accessCode: 'synthetic-private-marker', internalNotes: 'synthetic-private-marker' });
  await db.doc(`${root}/cleaners/${cleanerId}`).set({ organizationId: 'cleanflow-demo', name: 'Synthetic Cleaner', active: true, preferredLanguage: 'en', email: 'synthetic-private-marker' });
  await jobRef.set({ organizationId: 'cleanflow-demo', schemaVersion: 2, clientId, propertyId, propertyName: 'Synthetic Integration Property', operationalStatus: 'ASSIGNED',
    assignedCleanerIds: [cleanerId], checklistContextRevision: 1, scheduledDate: today, guestName: 'synthetic-private-marker' });
  await jobRef.collection('assignments').doc('synthetic').set({ organizationId: 'cleanflow-demo', jobId, cleanerId, isActive: true });
  await call('createChecklistRun', { jobId });
  const fresh = (await runRef.get()).data(); assert.deepEqual(fresh.evidencePolicy, { version: 2, maxPhotos: 60, maxTotalBytes: 120 * 1024 * 1024 });
  // Trusted emulator fixture for pre-existing policy snapshots and quota races.
  if (legacy) await runRef.update({ evidencePolicy: FieldValue.delete() });
  if (historicalV2) await runRef.update({ evidencePolicy: { version: 2, maxPhotos: 20, maxTotalBytes: 50 * 1024 * 1024 } });
  if (maxPhotos) await runRef.update({ 'evidencePolicy.maxPhotos': maxPhotos });
  if (maxTotalBytes) await runRef.update({ 'evidencePolicy.maxTotalBytes': maxTotalBytes });
  const { token } = await call('issueChecklistCapability', { jobId, cleanerId }); assert.equal(typeof token, 'string');
  return { jobId, clientId, token, jobRef, runRef };
}
export const checklistUrl = token => `${hostingOrigin}/api/public-checklist?${new URLSearchParams({ token })}`;
export async function read(run) { const response = await fetch(checklistUrl(run.token)); return { status: response.status, body: await response.json() }; }
export async function upload(run, bytes, requirementId = 'additional', contentType = 'image/png') {
  const response = await fetch(checklistUrl(run.token), { method: 'PUT', headers: { 'Content-Type': contentType, 'X-CleanFlow-Checklist-Item': requirementId }, body: bytes });
  return { status: response.status, body: await response.json() };
}
export async function mutate(run, values) {
  const response = await fetch(`${hostingOrigin}/api/public-checklist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: run.token, ...values }) });
  return { status: response.status, body: await response.json() };
}
export async function completeAnswers(run) {
  const definition = (await run.runRef.get()).data().resolvedDefinition;
  const current = (await read(run)).body.draft;
  return mutate(run, { mutationId: randomUUID(), baseRevision: current.revision, changes: {
    checklistAnswers: Object.fromEntries(definition.sections.flatMap(s => s.items.map(i => [i.id, 'DONE']))),
    inventoryAnswers: Object.fromEntries(definition.inventoryItems.map(i => [i.id, 'HIGH'])) } });
}
export async function assertStored(run, count) {
  const state = (await run.runRef.collection('evidenceState').doc('current').get()).data();
  assert.equal(state.photos.length, count);
  assert.equal(state.pending.length, 0);
  const [files] = await bucket.getFiles({ prefix: `${run.runRef.path}/evidence-v2/` });
  assert.deepEqual(files.map(file => file.name).sort(), state.photos.map(photo => photo.storagePath).sort());
  for (const photo of state.photos) {
    const file = bucket.file(photo.storagePath), [bytes] = await file.download(), [metadata] = await file.getMetadata();
    assert.equal(bytes.length, photo.sizeBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), photo.contentHash);
    assert.equal(metadata.generation, photo.generation);
    assert.equal(metadata.contentType, photo.contentType);
  }
  return state;
}
export const expire = run => run.runRef.collection('checklistCapabilities').doc('active').update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
export function assertPrivateProjection(projection) {
  const value = JSON.stringify(projection);
  assert.equal(value.includes('synthetic-private-marker'), false);
  for (const photo of projection.checklist?.evidence || projection.run?.evidence || projection.report?.evidence || []) {
    assert.deepEqual(Object.keys(photo).sort(), ['contentType', 'createdAt', 'evidenceId', 'requirementId', 'sizeBytes']);
  }
}
