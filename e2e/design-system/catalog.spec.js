import { expect, test } from "@playwright/test";
import { catalogMessages } from "../../src/design-system/catalog/messages.js";
import fs from "node:fs";
const widths = [360, 390, 768, 1280, 1440];
for (const theme of ["light", "dark"]) for (const language of ["en", "pt", "es"]) for (const width of widths) {
  test(`${theme} ${language} ${width}: network-free catalog, contrast, targets, containment`, async ({ page }) => {
    const external = []; const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { const url = new URL(route.request().url()); if (url.origin !== new URL(test.info().project.use.baseURL).origin || /api\/|firestore|identitytoolkit|storage|firebase/.test(url.pathname)) { external.push(url.origin + url.pathname); return route.abort(); } return route.continue(); });
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(({ theme, language }) => { localStorage.setItem("cleanflow-manager-theme", theme); localStorage.setItem("cleanflow-language", language); }, { theme, language });
    await page.goto("/design-system/catalog/");
    const t = catalogMessages[language];
    await expect(page.getByRole("heading", { name: t.title })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await page.getByRole("button", { name: t.secondary, exact: true }).first().hover();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const contrast = await page.locator(".cfv2-state, .cfv2-button:not(:disabled), .cfv2-field-hint, .cfv2-secondary, .cfv2-sync, .cfv2-sticky-label, .cfv2-panel h2").evaluateAll(nodes => {
      const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = color => rgb(color).map(channel => { const v = channel / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      return nodes.filter(n => n.getClientRects().length).map(node => {
        let parent = node;
        while (parent && ["rgba(0, 0, 0, 0)", "transparent"].includes(getComputedStyle(parent).backgroundColor)) parent = parent.parentElement;
        const foreground = luminance(getComputedStyle(node).color); const background = luminance(getComputedStyle(parent || document.body).backgroundColor);
        return { text: node.textContent, ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
      });
    });
    for (const sample of contrast) expect(sample.ratio, sample.text).toBeGreaterThanOrEqual(4.5);
    const targets = await page.locator("button, summary, .cfv2-choice, .cfv2-input").evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => ({ label: n.textContent || n.getAttribute("aria-label"), width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })));
    for (const target of targets) { expect(target.height, target.label).toBeGreaterThanOrEqual(44); expect(target.width, target.label).toBeGreaterThanOrEqual(44); }
    const skeleton = page.locator(".cfv2-skeleton-row span").first(); expect(await skeleton.evaluate(n => getComputedStyle(n).animationName)).toBe("none");
    await page.getByRole("button", { name: t.openConfirmation }).click();
    const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: t.cancel })).toBeFocused();
    await page.keyboard.press("Tab"); await expect(dialog.getByRole("button", { name: t.confirm })).toBeFocused();
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: t.openConfirmation })).toBeFocused();
    await page.getByText(t.technical, { exact: true }).click(); await expect(page.locator(".cfv2-technical")).toBeVisible();
    await page.getByText(t.technical, { exact: true }).click();
    expect(errors).toEqual([]); expect(external).toEqual([]);
    if ([390, 1440].includes(width) && language === "pt") {
      fs.mkdirSync("artifacts/visual-smoke/design-system", { recursive: true });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `artifacts/visual-smoke/design-system/catalog-${theme}-${width}.png`, fullPage: true });
      await page.locator("#system-states").screenshot({ path: `artifacts/visual-smoke/design-system/system-${theme}-${width}.png` });
    }
  });
}
test("keyboard editing, retry, switches and sticky keyboard presentation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cleanflow-language", "en"));
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/design-system/catalog/");
  const search = page.getByRole("searchbox", { name: "Search by name" }); await search.fill("demo"); await page.getByRole("button", { name: "Clear search" }).click(); await expect(search).toHaveValue("");
  const details = page.getByText("Saved details", { exact: true }).first(); await details.click(); const guest = page.getByLabel("Guest name").last(); await guest.fill("synthetic pending"); await details.click(); await details.click(); await expect(guest).toHaveValue("synthetic pending");
  await page.getByRole("button", { name: "Try again" }).first().click(); await expect(page.locator(".cfv2-catalog-notice")).toHaveText("Synthetic retry complete. No request was made.");
  await expect(page.locator(".cfv2-sticky")).toBeVisible(); await page.getByLabel("Simulate on-screen keyboard").check(); await expect(page.locator(".cfv2-sticky")).not.toBeVisible();
  await page.getByRole("button", { name: "Dark", exact: true }).click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Language" }).selectOption("es"); await expect(page.getByRole("heading", { name: "Catálogo de componentes" })).toBeVisible();
  const localizedSearch = page.getByRole("searchbox", { name: "Buscar por nombre" }); await localizedSearch.focus(); expect(await localizedSearch.evaluate(n => getComputedStyle(n).outlineWidth)).toBe("3px");
});
