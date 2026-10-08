import { test, expect } from "@playwright/test";
const experience = process.env.CLEANFLOW_RC_QA_EXPERIENCE;
test("Production presentation is build-bound, ignores queries, and preserves mobile primary navigation", async ({ page }, info) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const external = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) { external.push(url.hostname); return route.abort(); }
    return route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/authenticated-v2/index.html?experience=v2&shell=v2&dashboard=v2&services=v2");
  if (experience === "current") {
    await expect(page.locator(".dashboard")).toBeVisible();
    await expect(page.locator(".dashboard-v2")).toHaveCount(0);
    await expect(page.locator(".cfv2-shell")).toHaveCount(0);
  } else {
    await expect(page.locator(".dashboard-v2")).toBeVisible();
    await expect(page.getByText("SANDBOX · TEST DATA", { exact: true })).toHaveCount(0);
    await page.locator(".cfv2-shell-tabs").getByRole("button", { name: "Services", exact: true }).click();
    await expect(page.locator(".services-v2")).toBeVisible();
    await page.locator("[data-job-id]").first().click();
    await expect(page.locator(".job-detail-v2")).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    const dialog = page.getByRole("dialog");
    for (const name of ["Dashboard", "Services", "Properties"]) await expect(dialog.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "CURRENT", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.locator(".dashboard-v2")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: `artifacts/v2-production-rc/screenshots/${info.project.name}-production-${experience}-390.png`, fullPage: true });
  expect(errors).toEqual([]); expect(external).toEqual([]);
  expect(await page.evaluate(() => __integratedBlocked)).toEqual([]);
});
