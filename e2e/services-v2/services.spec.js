import { test, expect } from "@playwright/test";
import path from "node:path";

for (const [name, width, height, lang, theme] of [
  ["desktop-light-en", 1440, 1000, "en", "light"], ["desktop-dark-pt", 1440, 1000, "pt", "dark"],
  ["mobile-light-en", 390, 844, "en", "light"], ["mobile-dark-pt", 390, 844, "pt", "dark"],
  ["small-light-es", 360, 844, "es", "light"], ["tablet-dark-en", 768, 1024, "en", "dark"],
  ["desktop1280-light-pt", 1280, 900, "pt", "light"],
]) {
  test(`${name}: populated, filters, keyboard, detail, anchor, pagination; no network`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const failures = []; page.on("pageerror", error => failures.push(error.message));
    const external = []; page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4196")) external.push(request.url()); });
    await page.goto(`/e2e/services-v2/?services=v2&lang=${lang}&theme=${theme}`);
    await expect(page.locator("[data-job-id]")).toHaveCount(19);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const clipped = await page.locator("[data-job-id]").evaluateAll(rows => rows.some(row => {
      const rect = row.getBoundingClientRect();
      return [...row.children].filter(child => child.getClientRects().length).some(child => child.getBoundingClientRect().right > rect.right + 1);
    }));
    expect(clipped).toBe(false);
    const targetHeights = await page.locator(".services-v2 button, .services-v2 input").evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height));
    expect(targetHeights.every(height => height >= 44)).toBe(true);
    await page.screenshot({ path: path.resolve(`artifacts/services-v2/${name}.png`), fullPage: true });
    await page.screenshot({ path: path.resolve(`artifacts/services-v2/${name}-viewport.png`) });
    const filters = page.locator(".services-v2__toolbar > button[aria-expanded]");
    await filters.click(); await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("combobox")).toHaveCount(4);
    expect(await page.evaluate(() => document.activeElement.closest("dialog") !== null)).toBe(true);
    if (width === 390) await page.screenshot({ path: path.resolve(`artifacts/services-v2/${name}-filters.png`), fullPage: true });
    await page.keyboard.press("Escape"); await expect(filters).toBeFocused();
    const search = page.getByRole("searchbox"); await search.fill("Property 03");
    await expect(page.locator("[data-job-id]")).toHaveCount(2);
    await page.screenshot({ path: path.resolve(`artifacts/services-v2/${name}-search.png`) });
    await search.fill("does-not-exist"); await expect(page.locator(".cfv2-empty")).toBeVisible();
    await page.screenshot({ path: path.resolve(`artifacts/services-v2/${name}-no-results.png`) });
    await search.fill("");
    const needs = page.locator(".services-v2__chips button").nth(1); await needs.click();
    await expect(needs).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: path.resolve(`artifacts/services-v2/${name}-needs-assignment.png`), fullPage: true });
    await needs.click();
    const row = page.locator('[data-job-id="compact-demo-5"]'); await row.scrollIntoViewIfNeeded();
    const top = await row.evaluate(node => node.getBoundingClientRect().top);
    await row.click(); await expect(page.locator(".services-v2")).toHaveCount(0);
    await expect(page.locator(".job-intents")).toBeVisible();
    await page.getByRole("button", { name: /Back|Voltar|Volver/, exact: false }).first().click();
    await expect(row).toBeVisible();
    expect(Math.abs(await row.evaluate(node => node.getBoundingClientRect().top) - top)).toBeLessThan(8);
    await page.locator(".services-v2__continuation button").click();
    expect(await page.evaluate(() => window.__servicesHarness.loadMore)).toBe(1);
    expect(await page.evaluate(() => window.__servicesHarness.mutations)).toBe(0);
    await page.locator(".services-v2__heading button").click();
    await expect(page.locator(".cleaning-form")).toBeVisible();
    await page.getByRole("button", { name: /Back|Voltar|Volver/, exact: false }).first().click();
    await expect(page.locator(".services-v2")).toBeVisible();
    expect(failures).toEqual([]); expect(external).toEqual([]);
  });
}
for (const state of ["loading", "refresh", "error", "empty"]) {
  test(`${state} explicitly represented`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/e2e/services-v2/?services=v2&state=${state}&lang=pt&theme=dark`);
    if (state === "loading") await expect(page.locator(".cfv2-skeleton")).toBeVisible();
    if (state === "refresh") { await expect(page.locator("[data-job-id]")).toHaveCount(19); await expect(page.getByRole("status")).toContainText("Resultados anteriores"); }
    if (state === "error") { await expect(page.getByRole("alert")).toBeVisible(); }
    if (state === "empty") await expect(page.locator(".cfv2-empty")).toBeVisible();
    await page.screenshot({ path: path.resolve(`artifacts/services-v2/mobile-${state}.png`), fullPage: true });
    if (state === "error") { await page.getByRole("button", { name: "Tentar novamente" }).click(); await expect(page.getByRole("alert")).toHaveCount(0); await expect(page.locator("[data-job-id]")).toHaveCount(19); }
  });
}
