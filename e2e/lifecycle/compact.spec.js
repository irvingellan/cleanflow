import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) for (const surface of ["dashboard", "jobs"]) {
  test(`synthetic Sandbox ${surface} compact scan at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors = [], external = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4188" || url.pathname.startsWith("/api/") || /firebase/.test(url.pathname)) {
        external.push(url.pathname); return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(() => localStorage.setItem("cleanflow-language", "pt"));
    await page.goto(`/e2e/lifecycle/compact.html?surface=${surface}`);
    const cards = page.locator(surface === "jobs" ? ".job-card" : ".dashboard-next-item");
    await expect(cards).toHaveCount(surface === "jobs" ? 10 : 8);
    await expect(page.locator(".compact-lifecycle")).toHaveCount(surface === "jobs" ? 10 : 8);
    for (const card of await cards.all()) {
      await expect(card.locator("[role=listitem]")).toHaveCount(5);
      expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await expect(card).toHaveAccessibleDescription(/Atual/);
    }
    await expect(page.locator(".compact-lifecycle__stage--unknown-past").first()).toContainText("?");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(external).toEqual([]);
    await page.screenshot({ path: `artifacts/visual-smoke/compact-${surface}-${width}.png`, fullPage: true });
    await cards.first().focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toBeVisible();
    expect(errors).toEqual([]); expect(external).toEqual([]);
  });
}
