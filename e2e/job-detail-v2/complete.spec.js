import { expect, test } from "@playwright/test";
const scenarios = ["unassigned", "offered", "assigned", "assigned-draft", "in-progress", "ready", "completed", "archived", "open-issue", "stale", "unknown", "loading", "error"];
for (const lang of ["en", "pt", "es"]) for (const theme of ["light", "dark"]) {
  for (const [index, scenario] of scenarios.entries()) test(`F3 ${scenario} ${lang} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: index % 2 ? 360 : 390, height: 844 });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=${scenario}&lang=${lang}&theme=${theme}`);
    await expect(page.locator(".job-detail-v2")).toBeVisible();
    await expect(page.locator(".job-intents")).toHaveCount(1);
    await expect(page.locator(".job-detail-section")).toHaveCount(7);
    await expect(page.locator(".cfv2-sticky")).toBeVisible();
    await expect(page.locator(".job-v2-lifecycle-current")).not.toHaveText(/lifecycle\.|jobV2\./);
    if (["completed", "archived"].includes(scenario)) await expect(page.locator(".job-intents__secondary")).toHaveCount(0);
    if (["ready", "stale", "open-issue"].includes(scenario)) await expect(page.locator(".service-attention")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const small = await page.locator(".job-detail-v2").evaluate(node => [...node.querySelectorAll("button, summary")].filter(item => item.getClientRects().length && item.getBoundingClientRect().height < 44).map(item => item.textContent));
    expect(small).toEqual([]);
    expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
    expect(await page.evaluate(() => window.__lifecycleProviderCalls)).toEqual([]);
    expect(errors).toEqual([]);
    if (lang !== "es") await page.screenshot({ path: testInfo.outputPath(`complete-mobile-${scenario}-${lang}-${theme}.png`), fullPage: true });
  });
}
for (const width of [360, 390, 768, 1280, 1440]) for (const [lang, theme] of [["en", "light"], ["pt", "dark"], ["es", "dark"]]) {
  test(`F3/F4 confirmation ${width} ${lang} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned&lang=${lang}&theme=${theme}`);
    await page.locator(".job-intents__secondary > summary").click();
    await page.locator(".job-intents__actions button").nth(4).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Lifecycle Demo Assigned");
    const buttons = dialog.getByRole("button");
    await expect(buttons.nth(1)).toBeFocused();
    await page.keyboard.press("Tab"); await expect(buttons.first()).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(buttons.nth(1)).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`complete-confirmation-${width}-${lang}-${theme}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".job-intents__actions button").nth(4)).toBeFocused();
    expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`complete-canceled-${width}-${lang}-${theme}.png`), fullPage: true });
    await page.locator(".job-intents__actions button").nth(4).click();
    await dialog.getByRole("button").first().click();
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => window.__f1Calls)).toEqual(["onCompleteCleaning"]);
  });
}
test("mobile editing hides competing sticky even after blur and keeps inputs mounted", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned&lang=en&theme=light");
  await page.locator(".job-intents__secondary > summary").click();
  await page.getByRole("button", { name: "Choose intention: Change date / time" }).click();
  const date = page.getByLabel("Scheduled date"); await date.focus();
  await expect(page.locator(".cfv2-sticky")).not.toBeVisible();
  await date.fill("2026-10-12");
  await page.locator(".job-detail-section > summary").first().click();
  await expect(date).toBeAttached();
  await expect(page.locator(".cfv2-sticky")).not.toBeVisible();
  await page.locator(".job-detail-section > summary").first().click();
  await expect(date).toHaveValue("2026-10-12");
  await page.screenshot({ path: testInfo.outputPath("complete-mobile-expanded-form.png"), fullPage: true });
  expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
  await page.getByRole("region", { name: "Change date / time" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".cfv2-sticky")).toBeVisible();
});
test("existing reminder link replacement uses in-app confirmation and cancel preserves link", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/job-detail-v2/index.html?jobDetail=v2&scenario=assigned-draft");
  await page.locator(".job-intents__secondary > summary").click();
  await page.getByRole("button", { name: "Choose intention: Prepare reminder" }).click();
  await page.getByRole("checkbox", { name: "Include checklist link" }).check();
  await page.getByRole("button", { name: "Prepare checklist link", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("invalidates");
  await page.screenshot({ path: testInfo.outputPath("complete-reminder-replace-mobile.png"), fullPage: true });
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__f1Calls)).toEqual([]);
});
