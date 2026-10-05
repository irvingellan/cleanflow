import { test, expect } from "@playwright/test";
for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
  test(`${name} synthetic shadow inbox remains contained and read-only`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors = [], remote = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4191")) remote.push(request.url()); });
    await page.goto("/e2e/reservation-intake/inbox.html");
    await expect(page.locator("article")).toHaveCount(5);
    await expect(page.locator("strong", { hasText: "Dates changed" })).toBeVisible();
    await expect(page.locator("strong", { hasText: "Possible cancellation" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/reservation-intake-${name}.png`, fullPage: true });
    await page.getByRole("button", { name: "View observation / diff" }).nth(1).click();
    await page.screenshot({ path: `artifacts/reservation-intake-${name}-detail.png`, fullPage: true });
    expect(errors).toEqual([]); expect(remote).toEqual([]);
    await expect(page.getByRole("button", { name: /Create Job|Assign cleaner|Send message/ })).toHaveCount(0);
  });
}
