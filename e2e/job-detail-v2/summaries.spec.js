import { expect, test } from "@playwright/test";

for (const [lang, theme] of [["en", "light"], ["pt", "dark"], ["es", "light"]]) {
  for (const scenario of ["unassigned", "offered", "assigned", "assigned-draft", "in-progress", "ready", "completed", "archived", "open-issue", "unknown", "loading", "error"]) {
    test(`F2 collapsed ${scenario} ${lang} ${theme}`, async ({ page }, testInfo) => {
      await page.goto(`/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=${scenario}&lang=${lang}&theme=${theme}`);
      const headings = page.locator(".job-v2-groups .job-detail-section > summary");
      await expect(headings).toHaveCount(7);
      await expect(page.locator(".job-v2-disclosure-summary")).toHaveCount(7);
      await expect(page.locator(".job-v2-groups details[open]")).toHaveCount(0);
      const texts = await page.locator(".job-v2-disclosure-summary").allTextContents();
      expect(texts.join(" ")).not.toMatch(/jobV2\.|\$|US\$|USD/);
      if (scenario === "unknown" || scenario === "error") {
        expect(texts[2]).toBe({ en: "Not provided", pt: "Não informado", es: "No indicado" }[lang]);
      }
      if (scenario === "loading") expect(texts[2]).toBe({ en: "Loading…", pt: "Carregando…", es: "Cargando…" }[lang]);
      if (scenario === "ready") expect(texts[2]).toBe({ en: "Ready for review", pt: "Pronto para revisão", es: "Listo para revisión" }[lang]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
      expect(await page.evaluate(() => window.__lifecycleProviderCalls)).toEqual([]);
      if (lang !== "es") await page.screenshot({ path: testInfo.outputPath(`f2-${scenario}-${lang}-${theme}.png`), fullPage: true });
    });
  }
}
for (const width of [1100, 1280, 1440]) test(`F2 native keyboard, descriptions and contained wrapping ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned-draft&lang=pt&theme=dark");
  const summary = page.locator(".job-v2-groups summary").first();
  await expect(summary).toHaveAccessibleName("Detalhes do serviço");
  await summary.focus();
  await expect(summary).toBeFocused();
  expect(await summary.evaluate(node => getComputedStyle(node).outlineWidth)).toBe("3px");
  await page.keyboard.press("Enter");
  await expect(page.locator(".job-v2-groups details").first()).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(page.locator(".job-v2-groups details[open]")).toHaveCount(0);
  const financial = page.locator(".job-v2-groups summary").nth(5);
  await financial.click();
  await expect(page.locator(".job-detail-section").nth(5)).toHaveAttribute("open", "");
  await expect(page.locator(".service-financial-summary")).toBeVisible();
  expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const outside = await page.locator(".job-v2-disclosure-summary").evaluateAll(nodes => nodes.some(node => node.getBoundingClientRect().bottom > node.closest("summary").getBoundingClientRect().bottom));
  expect(outside).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`f2-expanded-${width}-pt-dark.png`), fullPage: true });
});

test("F2 collapsing a disclosure retains a pending form without saving", async ({ page }, testInfo) => {
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned-draft&lang=en&theme=light");
  const financial = page.locator(".job-v2-groups summary").nth(5);
  await financial.click();
  await expect(page.locator(".job-detail-section").nth(5)).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Edit prices", exact: true }).click();
  await page.getByLabel("Client price", { exact: true }).fill("123.45");
  await financial.click();
  await expect(page.locator(".job-detail-section").nth(5)).not.toHaveAttribute("open", "");
  await expect(page.getByLabel("Client price", { exact: true })).toBeAttached();
  await financial.click();
  await expect(page.locator(".job-detail-section").nth(5)).toHaveAttribute("open", "");
  await expect(page.getByLabel("Client price", { exact: true })).toHaveValue("123.45");
  expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("f2-expanded-en-light.png"), fullPage: true });
});

for (const width of [360, 768]) test(`F2 summaries survive F3 integration at ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned-draft&lang=pt&theme=light");
  await expect(page.locator(".job-detail-v2")).toBeVisible();
  await expect(page.locator(".job-v2-disclosure-summary")).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`f2-current-${width}-pt-light.png`), fullPage: true });
});
