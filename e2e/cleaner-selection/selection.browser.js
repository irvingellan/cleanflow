import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const names = ["Riley Demo", "Taylor Demo", "Alex Demo", "Jamie Demo"];
const capture = resolve(".tmp/gabi-evidence/cleaner-selection");

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4251") return route.continue();
    throw new Error("Unexpected request outside the disposable Vite harness");
  });
});

for (const theme of ["light", "dark"]) {
  for (const width of [375, 1440]) {
    test(`orders offer options and shows schedule without blocking selection · ${theme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      await page.goto(`/e2e/cleaner-selection/index.html?theme=${theme}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByText("Já agendada neste dia · 08:30, 15:00")).toBeVisible();
      await expect(page.getByText("Já agendada neste dia · Horário não informado")).toBeVisible();
      await expect(page.getByText(/Limpou esta casa 3 vezes no histórico recente · Última em 5 de nov\. de 2026/)).toBeVisible();
      await expect(page.getByText(/Limpou esta casa uma vez no histórico recente/)).toBeVisible();
      const inputs = page.locator(".cleaner-list").getByRole("checkbox");
      await expect.poll(() => inputs.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")))).toEqual(names);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const name of names) await expect(page.getByRole("checkbox", { name, exact: true })).toBeEnabled();
      await page.getByRole("checkbox", { name: "Riley Demo" }).check();
      await expect(page.locator(".offer-form button[type=submit]")).toBeEnabled();
      if (info.project.name === "chromium") {
        await mkdir(capture, { recursive: true });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: resolve(capture, `cleaner-selection-${theme}-${width}.png`), fullPage: true, animations: "disabled" });
      }
      await page.getByRole("searchbox").fill("Jamie");
      await expect(inputs).toHaveCount(1);
      await expect(page.getByRole("checkbox", { name: "Jamie Demo" })).toBeEnabled();
    });
  }
}

test("direct assignment uses the same advisory context and keeps confirmation explicit", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/e2e/cleaner-selection/index.html?view=assign");
  const intents = page.getByRole("region", { name: "O que você quer fazer?" });
  await intents.getByText("Mais ações", { exact: true }).click();
  await intents.getByRole("button", { name: "Escolher intenção: Atribuir / trocar cleaner" }).click();
  await expect(page.getByText("Já agendada neste dia · 08:30, 15:00")).toBeVisible();
  const inputs = page.locator(".direct-cleaner-picker").getByRole("radio");
  await expect.poll(() => inputs.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")))).toEqual(names);
  await expect(page.getByRole("button", { name: "Confirmar atribuição" })).toBeDisabled();
  await page.getByRole("radio", { name: "Riley Demo" }).check();
  await expect(page.getByRole("button", { name: "Confirmar atribuição" })).toBeEnabled();
  await page.getByRole("radio", { name: "Taylor Demo" }).check();
  await expect(page.getByRole("radio", { name: "Riley Demo" })).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
