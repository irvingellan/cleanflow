import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

for (const [key, value] of Object.entries({
  GCLOUD_PROJECT: 'demo-cleanflow', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9198',
})) assert.equal(process.env[key], value);
assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, '/private/tmp/cleanflow-no-credentials');
assert.equal(fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS), false);
assert.equal(process.versions.node.split('.')[0], '22');
const app = initializeApp({ projectId: 'demo-cleanflow', storageBucket: 'demo-cleanflow.appspot.com' });
const db = getFirestore(app), root = 'organizations/cleanflow-demo';
// Valid generated 1x1 PNG with no file metadata or operational content.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');

test('Node22 actual authenticated callables, single photo, review and client report', async ({ page }, info) => {
  let stage = 'setup';
  const checked = [];
  const output = '.superpowers/sdd/2026-10-14-functions-node22-migration/evidence';
  const check = async (name, task) => { stage = name; await task(); checked.push(name); };
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    return ['data:', 'blob:'].includes(u.protocol) || (u.hostname === '127.0.0.1' && u.port === '5012')
      ? route.continue() : route.abort();
  });
  try {
    const email = `synthetic-${randomUUID()}@example.test`, password = 'SyntheticOnly123!';
    const manager = await getAuth(app).createUser({ email, password });
    await db.doc(`${root}/members/${manager.uid}`).set({ role: 'MANAGER', active: true });
    const login = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const { idToken } = await login.json(); assert.ok(idToken);
    const call = async (name, data, authorized = true) => {
      const response = await fetch(`http://127.0.0.1:5011/demo-cleanflow/us-central1/${name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ data }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`callable-${name}-${body.error?.status || response.status}`);
      return body.result || body.data;
    };
    const jobId = `synthetic-${randomUUID()}`, cleanerId = `cleaner-${randomUUID()}`, propertyId = `property-${randomUUID()}`;
    const job = db.doc(`${root}/jobs/${jobId}`), run = job.collection('checklistRuns').doc('initial');
    await db.doc(`${root}/properties/${propertyId}`).set({ organizationId: 'cleanflow-demo', name: 'Synthetic Runtime Property', keyCodeInfo: 'private-fixture-marker' });
    await db.doc(`${root}/cleaners/${cleanerId}`).set({ organizationId: 'cleanflow-demo', name: 'Synthetic Cleaner', active: true, preferredLanguage: 'en' });
    await job.set({ organizationId: 'cleanflow-demo', schemaVersion: 2, propertyId, propertyName: 'Synthetic Runtime Property',
      operationalStatus: 'ASSIGNED', assignedCleanerIds: [cleanerId], checklistContextRevision: 1, scheduledDate: '2026-10-14', clientPrice: 99 });
    await job.collection('assignments').doc('synthetic').set({ organizationId: 'cleanflow-demo', jobId, cleanerId, isActive: true });
    await check('server-authorized-run-capability', async () => {
      await assert.rejects(call('createChecklistRun', { jobId }, false));
      await call('createChecklistRun', { jobId });
    });
    const { token } = await call('issueChecklistCapability', { jobId, cleanerId });
    const url = `http://127.0.0.1:5012/api/public-checklist?${new URLSearchParams({ token })}`;
    const read = async () => (await fetch(url)).json();
    const mutate = async values => {
      const r = await fetch('http://127.0.0.1:5012/api/public-checklist', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...values }) });
      return { status: r.status, body: await r.json() };
    };
    await check('invalid-denied-incomplete-preserves-draft', async () => {
      assert.equal((await fetch(url.replace(token, 'a'.repeat(43)))).status, 404);
      assert.equal((await mutate({ action: 'READY_FOR_REVIEW', submissionId: randomUUID(), baseRevision: 0 })).status, 422);
      assert.equal((await run.get()).data().status, 'DRAFT');
    });
    await check('native-browser-file-blob-private-photo-save-retry', async () => {
      await page.goto(`/checklist?t=${encodeURIComponent(token)}`);
      await expect(page.getByRole('heading', { name: 'Cleaning checklist' })).toBeVisible();
      const upload = async () => page.evaluate(async ({ bytes, url }) => {
        const file = new File([new Uint8Array(bytes)], 'synthetic.png', { type: 'image/png' });
        const body = new Blob([await file.arrayBuffer()], { type: file.type });
        const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type, 'X-CleanFlow-Checklist-Item': 'living-belongings' }, body });
        return { status: r.status, body: await r.json() };
      }, { bytes: [...png], url });
      assert.equal((await upload()).status, 200);
      const retry = await upload(); assert.equal(retry.status, 200); assert.equal(retry.body.duplicate, true);
      assert.equal((await run.collection('evidence').get()).size, 1);
      const evidence = await fetch(url + '&evidenceItem=living-belongings');
      assert.equal(evidence.status, 200); assert.ok(Buffer.from(await evidence.arrayBuffer()).equals(png));
    });
    await check('saved-answers-server-confirmed-review-idempotent', async () => {
      const definition = (await run.get()).data().resolvedDefinition;
      const save = await mutate({ mutationId: randomUUID(), baseRevision: (await read()).draft.revision, changes: {
        checklistAnswers: Object.fromEntries(definition.sections.flatMap(s => s.items.map(i => [i.id, 'DONE']))),
        inventoryAnswers: Object.fromEntries(definition.inventoryItems.map(i => [i.id, 'HIGH'])),
      } }); assert.equal(save.status, 200);
      const request = { action: 'READY_FOR_REVIEW', submissionId: randomUUID(), baseRevision: (await read()).draft.revision };
      assert.equal((await mutate(request)).status, 200);
      const time = (await run.get()).data().readyForReviewAt.toMillis();
      assert.equal((await run.get()).data().status, 'READY_FOR_REVIEW');
      const again = await mutate(request); assert.equal(again.status, 200); assert.equal(again.body.duplicate, true);
      assert.equal((await run.get()).data().readyForReviewAt.toMillis(), time);
    });
    await check('manager-public-report-private-projection-photo-no-auto-completion', async () => {
      const managerRun = await call('getChecklistRun', { jobId });
      assert.equal(JSON.stringify(managerRun).includes('private-fixture-marker'), false);
      assert.equal(managerRun.run.status, 'READY_FOR_REVIEW');
      await assert.rejects(call('getChecklistRun', { jobId }, false));
      const report = await call('createClientReport', { jobId });
      const reportUrl = `http://127.0.0.1:5012/api/client-report?${new URLSearchParams({ token: report.token })}`;
      const result = await (await fetch(reportUrl)).json();
      assert.equal(JSON.stringify(result).includes('private-fixture-marker'), false);
      assert.equal(JSON.stringify(result).includes('clientPrice'), false);
      await page.goto(`/client-report?t=${encodeURIComponent(report.token)}`);
      await expect.poll(() => page.locator('.client-report__photo').evaluateAll(images => images.filter(i => i.complete && i.naturalWidth > 0).length)).toBe(1);
      assert.equal((await job.get()).data().operationalStatus, 'ASSIGNED');
    });
  } catch (error) {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(`${output}/${info.project.name}-failure.json`, JSON.stringify({ stage, errorType: error.name,
      sourceLines: error.stack?.match(/runtime\.browser\.js:\d+:\d+/g) || [] }));
    throw new Error(`synthetic-runtime-validation-failed-at-${stage}`);
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/${info.project.name}-integration.json`, JSON.stringify({ node: process.version, checked, productionRequests: 0 }, null, 2));
});
