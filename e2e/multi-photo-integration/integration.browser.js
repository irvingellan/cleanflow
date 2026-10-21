import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { syntheticChecklistPng } from '../../security/syntheticChecklistImages.mjs';
import { createManager, createRun, read, upload, mutate, completeAnswers, assertStored, assertPrivateProjection, expire, checklistUrl, bucket } from './fixtures.js';
const output = '.superpowers/sdd/2026-10-13-checklist-multi-photo-v1/integration-artifacts';
const checks = {};
let stage = 'initial';
async function safeTest(name, task) {
  stage = name;
  try { await task(); checks[name] = true; } catch (error) {
    save('failure-location.json', { stage, errorType: error.name, sourceLines: (error.stack?.match(/integration\.browser\.js:\d+:\d+/g) || []) });
    throw new Error(`isolated-validation-failed-at-${stage}`);
  }
}
function save(name, result) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, name), JSON.stringify(result, null, 2)); }
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (['data:', 'blob:'].includes(u.protocol)) return route.continue();
    if (u.hostname === '127.0.0.1' && ['5012', '4214'].includes(u.port)) return route.continue();
    return route.abort();
  });
});
test('actual gallery, retry, private storage, review, manager and client report', async ({ page, context }, info) => {
  let run, call; const browser = info.project.name;
  try {
    await safeTest('auth-new-run-policy', async () => { call = await createManager(); run = await createRun(call); });
    await safeTest('incomplete-422', async () => {
      assert.equal((await mutate(run, { action: 'READY_FOR_REVIEW', submissionId: randomUUID(), baseRevision: 0 })).status, 422);
      assert.equal((await run.runRef.get()).data().status, 'DRAFT');
    });
    await safeTest('real-native-browser-one-two-ten-twenty', async () => {
      await page.goto(`/checklist?t=${encodeURIComponent(run.token)}`);
      await expect(page.getByRole('heading', { name: 'Cleaning checklist' })).toBeVisible();
      const input = red => ({ name: 'synthetic.png', mimeType: 'image/png', buffer: syntheticChecklistPng(red) });
      await page.getByLabel('Choose photos', { exact: true }).setInputFiles(input(20));
      stage = 'first-native-upload';
      await expect(page.getByText('Photo saved', { exact: true })).toHaveCount(1);
      await assertStored(run, 1);
      // Real lost-response injection: continue through the actual server/Storage
      // commit, then interrupt only delivery. Retry must reconcile accepted bytes.
      let dropped = false;
      let bodyCaptureUnavailable = false;
      await page.route('**/api/public-checklist?*', async route => {
        if (route.request().method() === 'PUT' && !dropped) {
          dropped = true;
          // WebKit Playwright does not expose this Blob request body. The known
          // valid tiny PNG is retained byte-for-byte by the actual optimizer;
          // forward those exact fixture bytes only for this loss-injection.
          // All ordinary/batch uploads use untouched native browser transport.
          const captured = route.request().postDataBuffer();
          bodyCaptureUnavailable = !captured?.length;
          const actual = await route.fetch({ postData: captured?.length ? captured : syntheticChecklistPng(21) });
          assert.equal(actual.status(), 200); await route.abort('failed');
        } else await route.continue();
      });
      await page.getByLabel('Take photo', { exact: true }).setInputFiles(input(21));
      stage = 'lost-upload-delivery';
      await expect(page.getByRole('button', { name: 'Retry photo', exact: true })).toBeVisible();
      await assertStored(run, 2);
      await page.getByRole('button', { name: 'Send checklist for review', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const retryResponse = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/api/public-checklist'));
      await page.getByRole('button', { name: 'Retry photo', exact: true }).click();
      stage = 'exact-blob-retry';
      const retryReceipt = await (await retryResponse).json();
      assert.equal(retryReceipt.duplicate, true);
      await expect(page.getByText('Photo saved', { exact: true })).toHaveCount(2);
      await assertStored(run, 2);
      await page.unroute('**/api/public-checklist?*');
      await page.getByRole('button', { name: 'Remove photo', exact: true }).first().click();
      stage = 'remove-required-reload';
      await expect(page.getByText('Photo saved', { exact: true })).toHaveCount(1);
      assert.equal((await read(run)).body.checklist.evidence.some(p => p.requirementId === 'living-belongings'), false);
      await page.reload(); await expect(page.getByText('Photo saved', { exact: true })).toHaveCount(1);
      await page.getByLabel('Choose photos', { exact: true }).setInputFiles(input(22));
      stage = 'replace-required';
      await expect(page.getByText('Photo saved', { exact: true })).toHaveCount(2);
      for (const target of [10, 20]) {
        stage = `batch-${target}-native-upload`;
        const before = (await read(run)).body.checklist.evidence.length;
        await page.getByLabel('Choose photos', { exact: true }).setInputFiles(Array.from({ length: target - before }, (_, i) => input(target * 3 + i)));
        await expect(page.getByText('Photo saved', { exact: true })).toHaveCount(target, { timeout: 60000 });
        const state = await assertStored(run, target);
        for (const photo of state.photos) {
          const [bytes] = await bucket.file(photo.storagePath).download();
          assert.ok([21, 22, ...Array.from({ length: 8 }, (_, i) => 30 + i), ...Array.from({ length: 10 }, (_, i) => 60 + i)].some(red => bytes.equals(syntheticChecklistPng(red))));
        }
      }
      const before = await read(run); assertPrivateProjection(before.body);
      const savedOrder = before.body.checklist.evidence.map(photo => photo.evidenceId);
      await page.reload();
      await expect(page.getByText('Photo saved', { exact: true })).toHaveCount(20);
      assert.deepEqual((await read(run)).body.checklist.evidence.map(photo => photo.evidenceId), savedOrder);
      const displayedOrder = [];
      for (let index = 0; index < 20; index++) {
        await page.locator('.checklist-photo-gallery__list li').nth(index).getByRole('button', { name: 'View photo', exact: true }).click();
        const source = await page.locator('.checklist-photo-gallery img').getAttribute('src');
        displayedOrder.push(new URL(source, page.url()).searchParams.get('evidenceId'));
      }
      assert.deepEqual(displayedOrder, savedOrder);
      assert.equal((await upload(run, syntheticChecklistPng(201))).status, 413);
      const duplicate = await upload(run, syntheticChecklistPng(21)); assert.equal(duplicate.status, 200); assert.equal(duplicate.body.duplicate, true);
      assert.equal((await upload(run, syntheticChecklistPng(21), 'living-belongings')).status, 409);
      await assertStored(run, 20);
      await page.locator('.checklist-photo-gallery').screenshot({ path: path.join(output, `${browser}-gallery.png`) });
      save(`${browser}-loss-injection.json`, { environment: 'local-disposable-emulators',
        lostResponseInjectionKnownFixtureBodyFallback: bodyCaptureUnavailable,
        explicitNativeRetryDuplicateProvesExactOptimizedFixtureBytes: retryReceipt.duplicate === true,
        ordinaryAndBatchBrowserTransportUnmodified: true });
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
    await safeTest('authorized-manager-real-projection-and-all-photos', async () => {
      const manager = await call('getChecklistRun', { jobId: run.jobId }); assertPrivateProjection(manager); assert.equal(manager.run.evidence.length, 20);
      await assert.rejects(call('getChecklistRun', { jobId: run.jobId }, false));
      const managerPage = await context.newPage();
      await managerPage.route('**/*', route => { const u = new URL(route.request().url()); return ['blob:', 'data:'].includes(u.protocol) || u.hostname === '127.0.0.1' && u.port === '4214' ? route.continue() : route.abort(); });
      let fetched = 0;
      await managerPage.exposeFunction('actualManagerEvidence', async data => { fetched++; return call('getChecklistEvidence', data); });
      await managerPage.exposeFunction('actualManagerCallable', (name, data) => call(name, data));
      await managerPage.goto('http://127.0.0.1:4214/e2e/multi-photo-integration/index.html');
      await managerPage.evaluate(projection => window.renderAuthorizedManager(projection), { job: { id: run.jobId, operationalStatus: 'ASSIGNED', propertyName: 'Synthetic Integration Property' }, run: manager.run });
      await expect(managerPage.getByRole('button', { name: 'View photo', exact: true })).toHaveCount(20); assert.equal(fetched, 0);
      for (let i = 0; i < 20; i++) {
        // After switching, the previously selected row regains its view button.
        await managerPage.locator('.checklist-run__evidence').nth(i).getByRole('button', { name: 'View photo', exact: true }).click();
        await expect.poll(() => managerPage.locator('.checklist-run__evidence img').evaluateAll(images => images.filter(i => i.complete && i.naturalWidth > 0).length)).toBe(1);
      }
      assert.equal(fetched, 20);
      await managerPage.locator('#checklist-evidence-title').locator('..').screenshot({ path: path.join(output, `${browser}-manager-gallery.png`) });
      await managerPage.close();
    });
    await safeTest('client-report-all-saved-images', async () => {
      const report = await call('createClientReport', { jobId: run.jobId }); assert.ok(report.token);
      const response = await fetch(`http://127.0.0.1:5012/api/client-report?${new URLSearchParams({ token: report.token })}`);
      const data = await response.json(); assertPrivateProjection(data); assert.equal(data.report.evidence.length, 20);
      assert.deepEqual(data.report.evidence.map(photo => photo.evidenceId), (await read(run)).body.checklist.evidence.map(photo => photo.evidenceId));
      for (const photo of data.report.evidence) {
        const response = await fetch(`http://127.0.0.1:5012/api/client-report?${new URLSearchParams({ token: report.token, photo: '1', evidenceId: photo.evidenceId })}`);
        assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, photo.sizeBytes);
      }
      await page.goto(`/client-report?t=${encodeURIComponent(report.token)}`);
      await expect(page.locator('.client-report__photo')).toHaveCount(20);
      for (let i = 0; i < 20; i++) { await page.locator('.client-report__photo').nth(i).scrollIntoViewIfNeeded(); await expect.poll(() => page.locator('.client-report__photo').nth(i).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true); }
      assert.equal((await run.jobRef.get()).data().operationalStatus, 'ASSIGNED');
    });
    await safeTest('direct-new-namespace-firestore-storage-denied', async () => {
      const env = await initializeTestEnvironment({ projectId: 'demo-cleanflow', firestore: { host: '127.0.0.1', port: 8081 }, storage: { host: '127.0.0.1', port: 9198 } });
      try {
        const state = await assertStored(run, 20);
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
test('real HTTP quota races, invalid images, historical V1 and upload benchmarks', async ({ page }, info) => {
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
    const reportResponse = await fetch(`http://127.0.0.1:5012/api/client-report?${new URLSearchParams({ token: report.token })}`);
    const projection = await reportResponse.json(); assert.equal(projection.report.hasPhoto, true); assert.equal(projection.report.evidence, undefined);
    await page.goto(`/client-report?t=${encodeURIComponent(report.token)}`); await expect(page.locator('.client-report__photo')).toHaveCount(1);
    await page.locator('.client-report__photo').scrollIntoViewIfNeeded(); await expect.poll(() => page.locator('.client-report__photo').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    result.historicalPolicyAbsentAndReportImage = true;
    stage = 'warm-upload-benchmarks';
    const fixtureBrowser = info.project.name.startsWith('chromium') ? 'chromium' : 'webkit';
    const run = await createRun(call); const rows = [];
    for (const caseName of ['camera-jpeg', 'label', 'low-light']) {
      const base = `.superpowers/sdd/2026-10-13-checklist-multi-photo-v1/optimizer-benchmarks/${fixtureBrowser}/${caseName}`;
      const bytes = fs.readFileSync(`${base}-optimized.jpg`), csv = fs.readFileSync(`${base}.csv`, 'utf8').trim().split('\n');
      const before = performance.now(), response = await upload(run, bytes, rows.length ? 'additional' : 'living-belongings', 'image/jpeg');
      const elapsed = performance.now() - before; assert.equal(response.status, 200); await assertStored(run, rows.length + 1);
      rows.push({ fixture: caseName, optimizedBytes: bytes.length, uploadToAcknowledgedMs: Number(elapsed.toFixed(1)), optimizerCsvHeader: csv[0], optimizerCsvRow: csv[1], thermalOrIPhoneProof: false, environment: 'warm-local-loopback-disposable-emulators' });
    }
    result.uploadBenchmarks = rows; save(`${info.project.name}-actual-api.json`, result);
  } catch { save(`${info.project.name}-actual-api.json`, { ...result, status: 'RED', failedStage: stage }); throw new Error(`actual-api-RED-${stage}`); }
});
