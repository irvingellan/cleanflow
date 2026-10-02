import { test, expect } from "@playwright/test";
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`local intention scenarios ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const forbiddenRequests = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1" || url.pathname.startsWith("/api/")) {
        forbiddenRequests.push(`${route.request().method()} ${url.hostname}`);
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(() => localStorage.setItem("cleanflow-language", "pt"));
    await page.goto("/workspace-intent-preview.html");
    await page.getByRole("button", { name: /Atribuir \/ trocar/ }).click();
    await expect(page.getByText(/interesse nunca atribui automaticamente/)).toBeVisible();
    await page.getByRole("button", { name: /Bay Apartment/ }).click();
    await page.getByRole("button", { name: /Alterar data/ }).click();
    await expect(page.getByText(/reenvie a mensagem atualizada/)).toBeVisible();
    await page.getByRole("button", { name: /Hill House/ }).click();
    await page.getByRole("button", { name: /Alterar data/ }).click();
    await expect(page.getByText(/Não apague o serviço/)).toBeVisible();
    if (viewport.width === 390) {
      await expect(page.locator("#wv1-intent-panel")).toBeFocused();
      const panel = await page.locator("#wv1-intent-panel").boundingBox();
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.y + panel.height).toBeLessThan(viewport.height - 70);
    }
    await page.screenshot({ path: `artifacts/visual-smoke/workspace-v1-${viewport.width}-blocked.png`, fullPage: true });
    await page.getByRole("button", { name: /Revisar o checklist existente/ }).click();
    await expect(page.getByText(/28 itens de checklist/)).toBeVisible();
    await page.getByRole("button", { name: /Palm Cottage/ }).click();
    const primary = viewport.width === 390 ? page.locator(".wv1-mobile-primary button") : page.locator(".wv1-next button");
    await expect(primary).toHaveText(/Revisar checklist/);
    await page.screenshot({ path: `artifacts/visual-smoke/workspace-v1-${viewport.width}.png`, fullPage: true });
    if (viewport.width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: "artifacts/visual-smoke/workspace-v1-mobile-viewport.png" });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(forbiddenRequests).toEqual([]);
    expect(errors).toEqual([]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Garden Studio" })).toBeVisible();
  });
}
