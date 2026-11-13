import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { syntheticChecklistPng } from '../../security/syntheticChecklistImages.mjs';
import { createManager, createRun, read, upload, mutate, completeAnswers, assertStored, assertPrivateProjection, expire, checklistUrl, hostingOrigin, managerHarnessOrigin } from './fixtures.js';
const output = '.tmp/issue-81';
const checks = {};
let stage = 'initial';
async function safeTest(name, task) {
  stage = name;
  try { await task(); checks[name] = true; } catch (error) {
    save(`failure-${stage}.json`, { stage, errorType: error.name, sourceLines: (error.stack?.match(/integration\.browser\.js:\d+:\d+/g) || []) });
    throw new Error(`isolated-validation-failed-at-${stage}`);
  }
}
function save(name, result) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, name), JSON.stringify(result, null, 2)); }
const photoInput = red => ({ name: 'synthetic.png', mimeType: 'image/png', buffer: syntheticChecklistPng(red) });
const evidenceIds = gallery => gallery.evidence.map(photo => photo.evidenceId);
function restrictBrowser(page) {
  return page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['data:', 'blob:'].includes(url.protocol) || [hostingOrigin, managerHarnessOrigin].includes(url.origin)
      ? route.continue() : route.abort();
  });
}
async function openPhoto(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.photo-lightbox__image.is-loaded')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-lightbox')).toHaveCount(0);
}
async function getPublic(api, token, query = {}) {
  const response = await fetch(`${hostingOrigin}/api/${api}?${new URLSearchParams({ token, ...query })}`);
  assert.equal(response.status, 200);
  return query.photo ? Buffer.from(await response.arrayBuffer()) : response.json();
}
test.beforeEach(({ page }) => restrictBrowser(page));
test('actual 50-photo gallery, review, manager, report, and owner portal', async ({ page, context }, info) => {
  let run, call; const browser = info.project.name;
  try {
    await safeTest('auth-new-run-policy', async () => { call = await createManager(); run = await createRun(call); });
    await safeTest('incomplete-422', async () => {
      assert.equal((await mutate(run, { action: 'READY_FOR_REVIEW', submissionId: randomUUID(), baseRevision: 0 })).status, 422);
      assert.equal((await run.runRef.get()).data().status, 'DRAFT');
    });
    await safeTest('native-browser-one-two-ten-twenty-fifty', async () => {
      await page.goto(`/checklist?t=${encodeURIComponent(run.token)}`);
      await expect(page.getByRole('heading', { name: 'Cleaning checklist' })).toBeVisible();
      const choose = page.getByLabel('Choose photos', { exact: true });
      const saved = page.getByText('Photo saved', { exact: true });
      const measures = [];
      let uploadRequests = 0;
      page.on('request', request => {
        if (request.method() === 'PUT' && request.url().includes('/api/public-checklist')) uploadRequests++;
      });
      let previous = 0;
      const measure = async (count, requested = count) => {
        const previousRequests = uploadRequests;
        const files = Array.from({ length: requested - previous }, (_, index) => photoInput(previous + index + 1));
        const started = performance.now();
        await choose.setInputFiles(files);
        await expect(saved).toHaveCount(count, { timeout: 90_000 });
        const selectionToSavedMs = Math.round(performance.now() - started);
        const uploaded = (await read(run)).body.checklist.evidence;
        assert.equal(uploaded.length, count);
        const requests = uploadRequests - previousRequests;
        assert.equal(requests, count - previous);
        measures.push({ count, requested, requests, totalRequests: uploadRequests, selectionToSavedMs,
          selectedBytes: files.reduce((sum, file) => sum + file.buffer.length, 0),
          uploadedPhotoBodyBytes: uploaded.slice(previous).reduce((sum, photo) => sum + photo.sizeBytes, 0),
          totalUploadedPhotoBodyBytes: uploaded.reduce((sum, photo) => sum + photo.sizeBytes, 0) });
        previous = count;
      };
      for (const count of [1, 2, 10, 20, 40, 50]) await measure(count);
      const state = await assertStored(run, 50);
      assert.deepEqual(state.photos.map(photo => photo.contentHash).sort(),
        Array.from({ length: 50 }, (_, index) => createHash('sha256').update(syntheticChecklistPng(index + 1)).digest('hex')).sort());
      const before = await read(run);
      assertPrivateProjection(before.body);
      const order = evidenceIds(before.body.checklist);
      await page.reload();
      await expect(saved).toHaveCount(50);
      assert.deepEqual(evidenceIds((await read(run)).body.checklist), order);
      for (const index of [0, 49]) {
        await page.locator('.checklist-photo-gallery__list li').nth(index)
          .getByRole('button', { name: 'View photo', exact: true }).click();
        await expect.poll(async () => {
          const source = await page.locator('.checklist-photo-gallery img').getAttribute('src');
          return new URL(source, page.url()).searchParams.get('evidenceId');
        }).toBe(order[index]);
      }
      // Select 15 more photos (65 total). The client sends only the ten remaining slots.
      await measure(60, 65);
      await expect(page.getByText(/^Photo capacity was reached/)).toBeVisible();
      const sixty = await assertStored(run, 60);
      assert.deepEqual(sixty.photos.slice(0, 50).map(photo => photo.evidenceId), order);
      assert.equal((await upload(run, syntheticChecklistPng(65))).status, 413);
      // Keep the downstream report fixture at exactly 50, and verify that deletion survives reload.
      for (const photo of sixty.photos.slice(50)) {
        const removal = await mutate(run, { action: 'REMOVE_EVIDENCE', mutationId: randomUUID(), evidenceId: photo.evidenceId });
        assert.equal(removal.status, 200);
      }
      await page.reload();
      await expect(saved).toHaveCount(50);
      assert.deepEqual(evidenceIds((await read(run)).body.checklist), order);
      save(`${browser}-upload-timing.json`, { environment: 'disposable-loopback', maxPhotos: 60, maxTotalBytes: 120 * 1024 * 1024,
        measures, overLimitStatus: 413 });
    });
    await safeTest('pending-required-review-receipt-idempotent-readonly', async () => {
      assert.equal((await completeAnswers(run)).status, 200);
      const stateRef = run.runRef.collection('evidenceState').doc('current'), state = (await stateRef.get()).data();
      await stateRef.update({ pending: [{ status: 'RESERVED', attemptId: 'synthetic-pending', sizeBytes: 1, leaseExpiresAt: Date.now() + 60000 }] });
      const revision = (await read(run)).body.draft.revision;
      const pending = await mutate(run, { action: 'READY_FOR_REVIEW', submissionId: randomUUID(), baseRevision: revision });
      assert.equal(pending.status, 422); assert.equal(pending.body.requirements.pendingPhotoCount, 1); assert.equal(pending.body.requirements.missingPhotoCount, 0);
      await stateRef.update({ pending: state.pending });
      await page.reload();
      let receipt;
      page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/public-checklist')) { const value = request.postDataJSON(); if (value.action === 'READY_FOR_REVIEW') receipt = value; } });
      await page.getByRole('button', { name: 'Send checklist for review', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Send checklist for review', exact: true }).click();
      await expect(page.locator('.public-checklist__receipt')).toBeVisible();
      assert.equal((await run.runRef.get()).data().status, 'READY_FOR_REVIEW'); assert.ok(receipt);
      const timestamp = (await run.runRef.get()).data().readyForReviewAt.toMillis();
      const duplicate = await mutate(run, receipt); assert.equal(duplicate.status, 200); assert.equal(duplicate.body.duplicate, true);
      assert.equal((await run.runRef.get()).data().readyForReviewAt.toMillis(), timestamp);
      assert.equal((await upload(run, syntheticChecklistPng(202))).status, 410);
      assert.equal((await mutate(run, { action: 'REMOVE_EVIDENCE', mutationId: randomUUID(), evidenceId: state.photos[0].evidenceId })).status, 410);
      await page.reload(); await expect(page.locator('.public-checklist__receipt')).toBeVisible();
      await expect(page.getByLabel('Choose photos', { exact: true })).toHaveCount(0);
      await expect(page.locator('input[value="DONE"]').first()).toBeDisabled();
    });
    await safeTest('authorized-manager-real-projection-and-photos', async () => {
      const manager = await call('getChecklistRun', { jobId: run.jobId });
      assertPrivateProjection(manager);
      assert.equal(manager.run.evidence.length, 50);
      await assert.rejects(call('getChecklistRun', { jobId: run.jobId }, false));
      const managerPage = await context.newPage();
      try {
        await restrictBrowser(managerPage);
        const fullRequests = new Set();
        await managerPage.exposeFunction('actualManagerEvidence', async data => {
          if (data.variant === 'full') fullRequests.add(data.evidenceId);
          return call('getChecklistEvidence', data);
        });
        await managerPage.exposeFunction('actualManagerCallable', (name, data) => call(name, data));
        await managerPage.goto(`${managerHarnessOrigin}/e2e/multi-photo-integration/index.html`);
        await managerPage.evaluate(projection => window.renderAuthorizedManager(projection), {
          job: { id: run.jobId, operationalStatus: 'ASSIGNED', propertyName: 'Synthetic Integration Property' }, run: manager.run,
        });
        await expect(managerPage.getByRole('button', { name: /^Open photo \d+:/ })).toHaveCount(50);
        assert.equal(fullRequests.size, 0);
        for (const index of [0, 49]) {
          await openPhoto(managerPage, new RegExp(`^Open photo ${index + 1}:`));
          assert.ok(fullRequests.has(manager.run.evidence[index].evidenceId));
        }
      } finally {
        await managerPage.close();
      }
    });
    await safeTest('client-report-and-owner-portal-saved-images', async () => {
      const report = await call('createClientReport', { jobId: run.jobId });
      assert.ok(report.token);
      const direct = await getPublic('client-report', report.token);
      assertPrivateProjection(direct);
      const order = evidenceIds((await read(run)).body.checklist);
      assert.deepEqual(evidenceIds(direct.report), order);
      const { access } = await call('clientPortalAccess', { clientId: run.clientId, action: 'issue' });
      const portal = await getPublic('client-portal', access.token);
      assertPrivateProjection(portal);
      assert.ok(portal.portal.reports.some(entry => entry.jobId === run.jobId));
      const owner = await getPublic('client-portal', access.token, { job: run.jobId });
      assertPrivateProjection(owner);
      assert.deepEqual(evidenceIds(owner.report), order);
      for (const photo of [owner.report.evidence[0], owner.report.evidence.at(-1)]) {
        const params = { photo: '1', evidenceId: photo.evidenceId };
        const [standalone, throughPortal] = await Promise.all([
          getPublic('client-report', report.token, params),
          getPublic('client-portal', access.token, { ...params, job: run.jobId }),
        ]);
        assert.equal(standalone.length, photo.sizeBytes);
        assert.deepEqual(throughPortal, standalone);
      }
      await page.goto(`/client-report?t=${encodeURIComponent(report.token)}`);
      await expect(page.getByRole('button', { name: /^Open photo \d+$/ })).toHaveCount(50);
      await openPhoto(page, 'Open photo 1');
      await openPhoto(page, 'Open photo 50');
      assert.equal((await run.jobRef.get()).data().operationalStatus, 'ASSIGNED');
    });
    await safeTest('direct-new-namespace-firestore-storage-denied', async () => {
      const env = await initializeTestEnvironment({ projectId: 'demo-cleanflow', firestore: { host: '127.0.0.1', port: 18480 }, storage: { host: '127.0.0.1', port: 19499 } });
      try {
        const state = (await run.runRef.collection('evidenceState').doc('current').get()).data();
        for (const actor of [env.authenticatedContext(call.uid), env.unauthenticatedContext()]) {
          for (const namespace of ['evidenceState', 'evidenceContent', 'evidenceRemovals']) {
            const doc = actor.firestore().doc(`${run.runRef.path}/${namespace}/synthetic`);
            await assertFails(doc.get()); await assertFails(doc.set({ synthetic: true }));
          }
          const file = actor.storage().ref(state.photos[0].storagePath);
          await assertFails(file.getMetadata()); await assertFails(file.put(syntheticChecklistPng(204), { contentType: 'image/png' }));
        }
      } finally { await env.cleanup(); }
      save(`${browser}-namespace-denials.json`, { project: 'demo-cleanflow', actors: ['authenticated-synthetic-manager', 'unauthenticated'],
        firestoreNamespaces: ['evidenceState', 'evidenceContent', 'evidenceRemovals'], firestoreReadWriteDenials: 12,
        storageV2ReadWriteDenials: 4, rulesChanged: false });
    });
    await safeTest('revoked-expired-context-denied', async () => {
      await call('revokeChecklistCapability', { jobId: run.jobId }); assert.equal((await read(run)).status, 410);
      const expired = await createRun(call); await expire(expired); assert.equal((await read(expired)).status, 410); assert.equal((await upload(expired, syntheticChecklistPng(206))).status, 410);
      const stale = await createRun(call); await stale.jobRef.update({ checklistContextRevision: 2 }); assert.equal((await read(stale)).status, 410); assert.equal((await upload(stale, syntheticChecklistPng(207))).status, 410);
    });
    save(`${browser}-actual-integration.json`, { browser, actualAuth: true, actualHostingFunctionsFirestoreStorage: true, checks,
      managerRendering: 'actual ChecklistRunDetail with authenticated REST callable projection and image transport adapter; not full authenticated App shell',
      serviceWorkers: 'blocked for deterministic disposable integration', physicalIPhone: false });
  } catch {
    save(`${browser}-actual-integration.json`, { browser, status: 'RED', failedStage: stage, checks });
    throw new Error(`actual-integration-RED-${stage}`);
  }
});
test('historical 20-photo Run keeps one free slot after a saved receipt is lost', async ({ page }, info) => {
  await safeTest('lost-receipt-refresh-at-historical-capacity', async () => {
    const call = await createManager();
    const run = await createRun(call, { historicalV2: true });
    const initial = (await read(run)).body.checklist;
    assert.deepEqual(initial.evidencePolicy, { version: 2, maxPhotos: 20, maxTotalBytes: 50 * 1024 * 1024 });
    for (let index = 1; index <= 18; index++) {
      const seeded = await upload(run, syntheticChecklistPng(index), index === 1 ? 'living-belongings' : 'additional');
      assert.equal(seeded.status, 200);
    }
    await page.goto(`/checklist?t=${encodeURIComponent(run.token)}`);
    const choose = page.getByLabel('Choose photos', { exact: true });
    const saved = page.getByText('Photo saved', { exact: true });
    const retry = page.getByRole('button', { name: 'Retry photo', exact: true });
    await expect(saved).toHaveCount(18);

    let putRequests = 0;
    page.on('request', request => {
      if (request.method() === 'PUT' && request.url().includes('/api/public-checklist')) putRequests++;
    });
    const api = '**/api/public-checklist?*';
    const fixture = syntheticChecklistPng(19);
    let committedId;
    let capturedBrowserBody = false;
    const dropReceipt = async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      if (!committedId) {
        // WebKit may omit Blob bytes in Playwright's route API. The byte-exact
        // idempotent receipt on the native retry below independently verifies identity.
        const captured = route.request().postDataBuffer();
        capturedBrowserBody = Boolean(captured?.length);
        const response = await route.fetch({ postData: capturedBrowserBody ? captured : fixture });
        assert.equal(response.status(), 200);
        ({ evidenceId: committedId } = await response.json());
        assert.equal(typeof committedId, 'string');
      }
      await route.abort('failed');
    };
    await page.route(api, dropReceipt);
    await choose.setInputFiles(photoInput(19));
    await expect(retry).toBeVisible({ timeout: 20_000 });
    assert.ok(committedId);
    const serverBefore = await assertStored(run, 19);
    const beforeRefresh = putRequests;
    const refresh = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/api/public-checklist'));
    await page.getByRole('button', { name: 'Refresh saved photos', exact: true }).click();
    assert.equal((await refresh).status(), 200);
    await expect(saved).toHaveCount(19);
    await expect(retry).toBeVisible();
    assert.equal(putRequests, beforeRefresh);
    assert.deepEqual(await assertStored(run, 19), serverBefore);
    await page.unroute(api, dropReceipt);

    await choose.setInputFiles(photoInput(20));
    await expect(saved).toHaveCount(20);
    assert.equal(putRequests - beforeRefresh, 1);
    await expect(retry).toBeVisible();
    const full = await assertStored(run, 20);
    const receipt = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/api/public-checklist'));
    await retry.click();
    const response = await receipt;
    assert.equal(response.status(), 200);
    const result = await response.json();
    assert.equal(result.duplicate, true);
    assert.equal(result.evidenceId, committedId);
    await expect(retry).toHaveCount(0);
    await expect(saved).toHaveCount(20);
    assert.equal(putRequests - beforeRefresh, 2);
    assert.deepEqual(await assertStored(run, 20), full);
    assert.equal((await upload(run, fixture, 'living-belongings')).status, 409);
    assert.equal((await upload(run, syntheticChecklistPng(21))).status, 413);
    save(`${info.project.name}-loss-injection.json`, { commitConfirmed: true, capturedBrowserBody, beforeRefresh,
      refreshUploadRequests: 0, finalNewUploadRequests: 1, explicitRetryUploadRequests: 1, duplicateAtCapacity: true });
  });
});

test('real HTTP quota races, invalid images, and historical V1', async ({ page }, info) => {
  const result = { browser: info.project.name }; let stage = 'auth';
  try {
    const call = await createManager();
    stage = 'quota-races';
    for (const options of [{ maxPhotos: 1 }, { maxTotalBytes: syntheticChecklistPng(1).length }]) {
      const run = await createRun(call, options);
      const results = await Promise.all([upload(run, syntheticChecklistPng(1)), upload(run, syntheticChecklistPng(2))]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 413]); await assertStored(run, 1);
      assert.equal((await upload(run, Buffer.from([255,216,255,217]), 'additional', 'image/jpeg')).status, 400);
      assert.equal((await upload(run, syntheticChecklistPng(3), 'additional', 'image/jpeg')).status, 400);
      assert.equal((await upload(run, syntheticChecklistPng(4), 'additional', 'text/plain')).status, 400);
    }
    result.actualCountAndByteConcurrency = true; result.actualInvalidMimeSignature = true;
    stage = 'historical-v1';
    const legacy = await createRun(call, { legacy: true }); assert.equal((await legacy.runRef.get()).data().evidencePolicy, undefined);
    assert.equal((await upload(legacy, syntheticChecklistPng(7), 'living-belongings')).status, 200);
    assert.equal((await completeAnswers(legacy)).status, 200);
    const revision = (await read(legacy)).body.draft.revision;
    assert.equal((await mutate(legacy, { action: 'READY_FOR_REVIEW', submissionId: randomUUID(), baseRevision: revision })).status, 200);
    const report = await call('createClientReport', { jobId: legacy.jobId });
    const projection = await getPublic('client-report', report.token);
    assert.equal(projection.report.hasPhoto, true);
    assert.equal(projection.report.evidence, undefined);
    await page.goto(`/client-report?t=${encodeURIComponent(report.token)}`);
    await expect(page.locator('.client-report__thumb-image')).toHaveCount(1);
    await openPhoto(page, 'Open photo 1');
    result.historicalPolicyAbsentAndReportImage = true;
    save(`${info.project.name}-actual-api.json`, result);
  } catch { save(`${info.project.name}-actual-api.json`, { ...result, status: 'RED', failedStage: stage }); throw new Error(`actual-api-RED-${stage}`); }
});
