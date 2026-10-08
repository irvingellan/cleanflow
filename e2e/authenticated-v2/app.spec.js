import { expect, test } from "@playwright/test";
async function open(page) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const external = []; await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) { external.push(url.hostname); return route.abort(); }
    return route.continue();
  });
  await page.goto("/e2e/authenticated-v2/index.html?experience=v2");
  await expect(page.locator(".dashboard-v2-metric")).toHaveCount(5);
  return { errors, external };
}
test("real App: one Sandbox presentation choice preserves Dashboard metrics, Services and origin-aware Back", async ({ page }) => {
  const signals = await open(page);
  const values = await page.locator(".dashboard-v2-metric strong").allTextContents();
  await page.getByRole("button", { name: "Account & settings" }).click();
  await page.getByRole("button", { name: "CURRENT", exact: true }).click();
  await expect(page.locator(".dashboard")).toBeVisible();
  expect(await page.locator(".summary-card strong").allTextContents()).toEqual(values);
  await page.getByRole("button", { name: "V2", exact: true }).click();
  await expect(page.locator(".dashboard-v2")).toBeVisible();
  await page.locator(".dashboard-v2-next-row").first().click();
  await expect(page.locator(".job-detail-v2")).toBeVisible();
  await expect(page.locator(".job-detail-section")).toHaveCount(7);
  await page.getByRole("button", { name: /Back$/ }).click();
  await expect(page.locator(".dashboard-v2")).toBeVisible();
  await page.getByRole("complementary").getByRole("button", { name: "Services", exact: true }).click();
  await expect(page.locator(".services-v2")).toBeVisible();
  const row = page.locator("[data-job-id]").first(); await row.click();
  await expect(page.locator(".job-detail-v2")).toBeVisible();
  await page.getByRole("button", { name: /Back$/ }).click();
  await expect(page.locator(".services-v2")).toBeVisible();
  expect(signals.errors).toEqual([]); expect(signals.external).toEqual([]);
});
test("real App preserves secondary directory navigation and Property-to-Job context", async ({ page }) => {
  const signals = await open(page);
  await page.getByRole("complementary").getByRole("button", { name: "Properties", exact: true }).click();
  await page.locator(".property-card").first().click();
  await expect(page.locator("#property-detail-title")).toBeVisible();
  await page.getByRole("button", { name: "View job", exact: true }).first().click();
  await expect(page.locator(".job-detail-v2")).toBeVisible();
  await page.getByRole("button", { name: /Back$/ }).click();
  await expect(page.locator("#property-detail-title")).toBeVisible();
  expect(signals.errors).toEqual([]); expect(signals.external).toEqual([]);
  expect(await page.evaluate(() => __integratedBlocked)).toEqual([]);
});
test("real App mobile More, account utilities and keyboard dismissal remain accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const signals = await open(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clients", exact: true }).click();
  await expect(page.locator("#clients-title")).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByLabel("Language", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(signals.errors).toEqual([]); expect(signals.external).toEqual([]);
  expect(await page.evaluate(() => __integratedBlocked)).toEqual([]);
});
for (const width of [1440, 1280, 768, 390, 360]) for (const [language, theme] of [["en", "light"], ["pt", "dark"]]) {
  test(`real App responsive ${width} ${language} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 1000 });
    await page.addInitScript(({ language, theme }) => { localStorage.setItem("cleanflow-language", language); localStorage.setItem("cleanflow-manager-theme", theme); }, { language, theme });
    const signals = await open(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const contained = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await contained(); await page.screenshot({ path: `artifacts/authenticated-v2/screenshots/${info.project.name}-${width}-${language}-${theme}-dashboard.png`, fullPage: true });
    const services = width < 720 ? page.locator(".cfv2-shell-tabs") : page.getByRole("complementary");
    await services.getByRole("button", { name: language === "pt" ? "Serviços" : "Services", exact: true }).click();
    await expect(page.locator(".services-v2")).toBeVisible(); await contained();
    await page.screenshot({ path: `artifacts/authenticated-v2/screenshots/${info.project.name}-${width}-${language}-${theme}-services.png`, fullPage: true });
    await page.locator("[data-job-id]").first().click();
    await expect(page.locator(".job-detail-v2")).toBeVisible(); await contained();
    if (width >= 1280) expect(await page.locator(".job-v2-main").evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(450);
    await page.screenshot({ path: `artifacts/authenticated-v2/screenshots/${info.project.name}-${width}-${language}-${theme}-detail.png`, fullPage: true });
    expect(signals.errors).toEqual([]); expect(signals.external).toEqual([]);
  });
}
