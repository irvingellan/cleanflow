import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// Only the approved main CSS baseline is read. Existing synthetic presentation
// harnesses render real components without Auth, credentials, SDK or mutations.
const baselineCss = execFileSync("git", ["show", "8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526:src/index.css"], { encoding: "utf8" });

for (const width of [360, 390, 768, 1280, 1440]) for (const theme of ["light", "dark"]) for (const surface of ["dashboard", "jobs", "job-detail"]) {
  test(`${surface} ${theme} ${width}px is pixel-identical to main`, async ({ page }) => {
    const errors = [], external = [];
    await page.setViewportSize({ width, height: width < 720 ? 844 : 1000 });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4189" || url.pathname.startsWith("/api/") || /firebase/.test(url.pathname)) {
        external.push(url.pathname);
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(({ theme, language }) => {
      const applyTheme = () => { document.documentElement.dataset.theme = theme; };
      if (document.documentElement) applyTheme();
      else window.addEventListener("DOMContentLoaded", applyTheme, { once: true });
      localStorage.setItem("cleanflow-language", language);
    }, { theme, language: theme === "light" ? "en" : "pt" });
    await page.goto(surface === "job-detail" ? "/e2e/lifecycle/job-detail.html" : `/e2e/lifecycle/compact.html?surface=${surface}`);
    if (surface === "job-detail") {
      await page.getByRole("combobox", { name: "Local synthetic scenario" }).selectOption("ready");
      await expect(page.locator(".job-intents__next")).toBeVisible();
    } else {
      await expect(page.locator(".compact-lifecycle").first()).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    const currentCss = await page.evaluate((baseline) => {
      const style = [...document.querySelectorAll("style[data-vite-dev-id]")].find((node) => node.dataset.viteDevId.endsWith("/src/index.css"));
      if (!style) throw new Error("Application stylesheet missing");
      const current = style.textContent;
      style.textContent = baseline;
      return current;
    }, baselineCss);
    const stem = `artifacts/visual-smoke/design-tokens/${surface}-${width}-${theme}`;
    const before = await page.screenshot({ path: `${stem}-before.png`, fullPage: true, animations: "disabled" });
    await page.evaluate((current) => {
      [...document.querySelectorAll("style[data-vite-dev-id]")].find((node) => node.dataset.viteDevId.endsWith("/src/index.css")).textContent = current;
    }, currentCss);
    const after = await page.screenshot({ path: `${stem}-after.png`, fullPage: true, animations: "disabled" });
    expect(after.equals(before), "Any pixel difference blocks Phase A").toBe(true);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}
