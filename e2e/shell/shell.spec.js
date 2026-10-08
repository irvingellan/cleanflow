import { expect, test } from "@playwright/test";
import { shellText } from "../../src/components/v2/shellMessages.js";
const origin = "http://127.0.0.1:4211";
test.beforeEach(async ({ page }) => {
  page.__failures = [];
  page.on("pageerror", error => page.__failures.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /\/api\/|firebase|googleapis/.test(url.pathname)) {
      page.__failures.push(`Unexpected request: ${url.origin}${url.pathname}`); return route.abort();
    }
    return route.continue();
  });
});
test.afterEach(async ({ page }) => expect(page.__failures).toEqual([]));
async function open(page, width, theme = "light", lang = "en", view = "dashboard") {
  await page.setViewportSize({ width, height: width < 720 ? 844 : 1000 });
  await page.goto(`/e2e/shell/index.html?theme=${theme}&lang=${lang}&view=${view}`);
  await expect(page.locator(".cfv2-shell")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
for (const [width, theme, lang, views] of [
  [1440, "light", "en", ["dashboard", "jobs", "properties"]],
  [1440, "dark", "pt", ["dashboard", "jobs"]],
  [768, "light", "en", ["dashboard"]], [768, "dark", "pt", ["dashboard"]],
  [390, "light", "en", ["dashboard", "jobs"]], [390, "dark", "pt", ["dashboard"]],
  [360, "light", "pt", ["properties"]], [1280, "dark", "en", ["dashboard"]], [1920, "light", "es", ["dashboard"]],
]) for (const view of views) {
  test(`${view} ${width} ${theme} ${lang} shell/content containment`, async ({ page }) => {
    await open(page, width, theme, lang, view);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".environment-banner")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    if (width < 720) {
      await expect(page.locator(".cfv2-shell-tabs button")).toHaveCount(4);
      for (const button of await page.locator(".cfv2-shell-tabs button").all()) {
        const box = await button.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44);
      }
    } else {
      expect((await page.locator(".cfv2-shell-sidebar").boundingBox()).width).toBe(width < 1100 ? 64 : 232);
      for (const item of await page.locator(".cfv2-shell-sidebar nav button").all()) await expect(item).toHaveAttribute("aria-label", /.+/);
    }
    await page.screenshot({ path: `artifacts/visual-smoke/shell/${view}-${width}-${theme}-${lang}.png`, fullPage: true });
  });
}
for (const [width, lang, theme] of [[1440, "en", "light"], [1440, "pt", "dark"], [390, "en", "light"], [390, "pt", "dark"]]) {
  test(`account/More focus, utilities, Escape ${width} ${lang}`, async ({ page }) => {
    await open(page, width, theme, lang);
    const trigger = width < 720 ? page.locator(".cfv2-shell-tabs").getByRole("button", { name: shellText(lang, "more") })
      : page.getByRole("button", { name: shellText(lang, "account") });
    await trigger.click();
    const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: shellText(lang, "close") })).toBeFocused();
    await expect(dialog.getByRole("combobox")).toBeVisible();
    await expect(dialog.getByText("Demo Operator")).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Production|produção|producción/i })).toHaveAttribute("href", "https://clean-flow-prototipo.web.app");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/visual-smoke/shell/utilities-${width}-${theme}-${lang}.png`, fullPage: true });
    await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("link", { name: shellText(lang, "current") })).toBeFocused();
    await page.keyboard.press("Tab"); await expect(dialog.getByRole("button", { name: shellText(lang, "close") })).toBeFocused();
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  });
}
test("mobile destinations, detail Back, language/theme persistence and nested utilities", async ({ page }) => {
  await open(page, 390);
  await page.locator(".cfv2-shell-tabs").getByRole("button", { name: "Services" }).click();
  await expect(page.locator(".job-list")).toBeVisible();
  await page.locator(".cfv2-shell-tabs").getByRole("button", { name: "Properties" }).click();
  await page.getByRole("button", { name: "View Demo Property 1" }).click();
  await expect(page.locator(".job-detail")).toBeVisible(); await expect(page.locator(".cfv2-shell-tabs")).toHaveCount(0);
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page.locator(".property-list")).toBeVisible();
  for (const name of ["Cleaners", "Payouts", "Clients", "Dev Center"]) {
    await page.locator(".cfv2-shell-tabs").getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.locator(".cfv2-shell-tabs").getByRole("button", { name: "More" }).click();
  await page.getByRole("combobox").selectOption("pt");
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Feedback" }).click();
  await expect(page.locator(".feedback-dialog")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.locator(".feedback-dialog")).not.toBeVisible();
  await expect(page.locator(".cfv2-shell-overlay")).toBeVisible();
  await page.keyboard.press("Escape");
});
test("wide collapse and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await open(page, 1440);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  expect((await page.locator(".cfv2-shell-sidebar").boundingBox()).width).toBe(64);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  expect((await page.locator(".cfv2-shell-sidebar").boundingBox()).width).toBe(232);
  expect(await page.locator(".cfv2-shell").evaluate(node => getComputedStyle(node).animationName)).toBe("none");
});
