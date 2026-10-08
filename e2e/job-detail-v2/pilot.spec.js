import { expect, test } from "@playwright/test";

for (const [language, theme] of [["en", "light"], ["pt", "dark"], ["es", "light"]]) {
  for (const scenario of ["unassigned", "offered", "assigned-draft", "in-progress", "ready", "completed", "open-issue", "archived", "unknown"]) {
    test(`${scenario} desktop ${language} ${theme}: one decision rail, preserved groups, no provider operations`, async ({ page }, testInfo) => {
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(`/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=${scenario}&lang=${language}&theme=${theme}`);
      await expect(page.locator(".job-detail-v2")).toBeVisible();
      await expect(page.locator(".job-v2-decision .job-intents")).toHaveCount(1);
      await expect(page.locator(".job-detail-section")).toHaveCount(7);
      await expect(page.locator(".job-v2-decision .job-intents__next button")).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
      expect(await page.evaluate(() => window.__lifecycleProviderCalls)).toEqual([]);
      expect(errors).toEqual([]);
      if (scenario === "archived" || scenario === "completed") await expect(page.locator(".job-intents__secondary")).toHaveCount(0);
      if (["assigned-draft", "open-issue", "ready", "completed", "archived"].includes(scenario) && language !== "es") await page.screenshot({ path: testInfo.outputPath(`${scenario}-${language}-${theme}.png`), fullPage: true });
    });
  }
}

test("real schedule intent reveals and focuses unchanged controls; selection never mutates", async ({ page }) => {
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned");
  await page.locator(".job-intents__secondary > summary").click();
  await page.getByRole("button", { name: "Choose intention: Change date / time" }).click();
  await expect(page.getByLabel("Scheduled date")).toBeVisible();
  await expect(page.getByRole("region", { name: "Change date / time" })).toBeFocused();
  expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
  await page.getByRole("button", { name: "Save schedule" }).click();
  expect(await page.evaluate(() => window.__f1Calls)).toEqual(["onUpdateSchedule"]);
});

test("mobile V2 uses shared intents and CURRENT remains available", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=ready&lang=pt&theme=dark");
  await expect(page.locator(".job-detail-v2")).toBeVisible();
  await expect(page.locator(".cfv2-sticky .job-intents__next button")).toHaveCount(1);
  await page.getByRole("button", { name: "ATUAL", exact: true }).click();
  await expect(page.locator(".panel.job-detail")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-current-pt-dark.png"), fullPage: true });
});

test("CURRENT comparison retains entered controlled form values", async ({ page }) => {
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned");
  await page.locator(".job-intents__secondary > summary").click();
  await page.getByRole("button", { name: "Choose intention: Change date / time" }).click();
  await page.getByLabel("Scheduled date").fill("2026-10-10");
  await page.getByRole("button", { name: "CURRENT", exact: true }).click();
  await page.locator(".job-detail-section > summary").first().click();
  await expect(page.getByLabel("Scheduled date")).toHaveValue("2026-10-10");
  expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
});

for (const width of [1100, 1280, 1440, 1920]) test(`desktop ${width}px preserves decision width, keyboard and 44px targets`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned-draft");
  const rail = page.locator(".job-v2-decision");
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox()).width).toBe(360);
  await rail.locator(".job-intents__next button").focus();
  await expect(rail.locator(".job-intents__next button")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(rail.locator("summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rail.locator("details")).toHaveAttribute("open", "");
  const small = await page.locator(".job-detail-v2").evaluate(node => [...node.querySelectorAll("button, summary")].filter(item => item.getClientRects().length && item.getBoundingClientRect().height < 44).map(item => item.textContent));
  expect(small).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
});

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) test(`CURRENT wrapper equals existing Job Detail pixels ${width}px ${theme}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(theme => {
    localStorage.setItem("cleanflow-language", "en");
    const apply = () => { document.documentElement.dataset.theme = theme; };
    if (document.documentElement) apply(); else addEventListener("DOMContentLoaded", apply, { once: true });
  }, theme);
  await page.goto("/e2e/lifecycle/job-detail.html");
  await page.addStyleTag({ content: ".app-shell { max-width: 1560px; }" });
  await page.getByRole("combobox", { name: "Local synthetic scenario" }).selectOption("assigned-draft");
  await page.evaluate(() => document.fonts.ready);
  // Compare under identical screenshot parents/coordinates: Chromium rasterizes
  // rounded corners differently after scrolling past different harness toolbars.
  const dimensions = await page.locator(".panel.job-detail").boundingBox();
  await page.locator(".panel.job-detail").evaluate(node => { const width = node.getBoundingClientRect().width; document.body.replaceChildren(node); document.body.style.margin = "0"; node.style.width = `${width}px`; });
  const baseline = await page.locator(".panel.job-detail").screenshot({ path: testInfo.outputPath("baseline.png"), animations: "disabled" });
  await page.goto(`/e2e/job-detail-v2/index.html?scenario=assigned-draft&theme=${theme}`);
  await page.evaluate(() => document.fonts.ready);
  const currentDimensions = await page.locator(".panel.job-detail").boundingBox();
  expect(currentDimensions.width).toBe(dimensions.width);
  expect(currentDimensions.height).toBe(dimensions.height);
  await page.locator(".panel.job-detail").evaluate(node => { const width = node.getBoundingClientRect().width; document.body.replaceChildren(node); document.body.style.margin = "0"; node.style.width = `${width}px`; });
  const current = await page.locator(".panel.job-detail").screenshot({ path: testInfo.outputPath("current.png"), animations: "disabled" });
  expect(current.equals(baseline)).toBe(true);
});
