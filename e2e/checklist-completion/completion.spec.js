import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const url = (scenario, lang, variant = 'improved') => `/e2e/checklist-completion/index.html?variant=${variant}&scenario=${scenario}&lang=${lang}`;
for (const [width, height] of [[1440, 1000], [390, 844]]) for (const lang of ['en', 'pt']) {
  test(`${width} ${lang}: incomplete, photo, ready, sending, receipt and reload`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors = []; page.on('pageerror', e => errors.push({ name: e.name, message: e.message, stack: e.stack }));
    const external = [];
    await page.route('**/*', route => { const target = new URL(route.request().url()); if (['data:', 'blob:'].includes(target.protocol)) return route.continue(); if (target.hostname !== '127.0.0.1') { external.push(target.hostname); return route.abort(); } return route.continue(); });
    await mkdir('artifacts/checklist-completion/screenshots', { recursive: true });
    const shot = async state => page.screenshot({ path: `artifacts/checklist-completion/screenshots/${info.project.name}-${width}-${lang}-${state}.png`, fullPage: true });
    await page.goto(url('incomplete', lang));
    await expect(page.getByRole('heading', { name: lang === 'pt' ? 'Checklist incompleto' : 'Checklist incomplete' })).toBeVisible();
    await expect(page.locator('.public-checklist__missing-marker')).toHaveCount(0);
    await page.getByRole('button', { name: lang === 'pt' ? 'Enviar checklist para revisão' : 'Send checklist for review', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.public-checklist__missing-marker')).not.toHaveCount(0);
    await page.getByRole('button', { name: lang === 'pt' ? 'Ir ao primeiro item pendente' : 'Go to first missing item' }).click();
    await expect(page.locator('input[value="DONE"]').first()).toBeFocused();
    await shot('incomplete');
    await page.goto(url('missing-photo', lang));
    await expect(page.getByRole('heading', { name: lang === 'pt' ? 'Checklist incompleto' : 'Checklist incomplete' })).toBeVisible();
    await shot('missing-photo');
    await page.locator('input[type="file"]').nth(1).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1sAAAAASUVORK5CYII=', 'base64') });
    await expect(page.getByRole('heading', { name: lang === 'pt' ? 'Pronto para enviar para revisão' : 'Ready to send for review' })).toBeVisible();
    await shot('ready');
    await page.goto(url('submitting', lang));
    const send = lang === 'pt' ? 'Enviar checklist para revisão' : 'Send checklist for review';
    await page.getByRole('button', { name: send, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: send, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog').getByRole('button').first()).toBeDisabled();
    await expect(page.locator('.public-checklist__review-state')).toHaveCount(0);
    await shot('sending');
    await expect(page.locator('.public-checklist__receipt')).toBeVisible();
    await expect(page.locator('input[value="DONE"]').first()).toBeDisabled();
    await shot('success');
    await page.reload();
    await expect(page.locator('.public-checklist__receipt')).toBeVisible();
    await expect(page.getByRole('button', { name: send, exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(external).toEqual([]);
  });
  test(`${width} ${lang}: error/retry, uncertain committed response and CURRENT comparison`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const send = lang === 'pt' ? 'Enviar checklist para revisão' : 'Send checklist for review';
    for (const scenario of ['error', 'uncertain-response']) {
      await page.goto(url(scenario, lang));
      await page.getByRole('button', { name: send, exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: send, exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.locator('.public-checklist__receipt')).toHaveCount(0);
      await page.screenshot({ path: `artifacts/checklist-completion/screenshots/${info.project.name}-${width}-${lang}-${scenario}.png`, fullPage: true });
      await page.getByRole('dialog').getByRole('button', { name: send, exact: true }).click();
      await expect(page.locator('.public-checklist__receipt')).toBeVisible();
    }
    await page.goto(url('incomplete', lang, 'current'));
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.public-checklist__completion')).toHaveCount(0);
    await page.screenshot({ path: `artifacts/checklist-completion/screenshots/${info.project.name}-${width}-${lang}-current.png`, fullPage: true });
  });
}
