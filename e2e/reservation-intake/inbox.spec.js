import { test, expect } from "@playwright/test";
import { designMessages } from "../../src/features/reservation-intake/reservationDesignMessages.js";
import { reviewMessages } from "../../src/features/reservation-intake/reservationReviewMessages.js";
import { reservationIntakeMessages } from "../../src/features/reservation-intake/reservationIntakeMessages.js";

for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
  for (const [language, theme] of [["en", "light"], ["pt", "light"], ["pt", "dark"]]) {
    test(`${name} ${language} ${theme}: review/confirmation/persistence/discrepancy`, async ({ page }) => {
      const d = designMessages[language], r = reviewMessages[language], t = reservationIntakeMessages[language];
      await page.setViewportSize({ width, height });
      const errors = [], remote = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4191")) remote.push(request.url()); });
      const shot = async state => {
        await page.locator(".intake-local-tools").evaluate(element => { element.open = false; });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        return page.screenshot({ path: `artifacts/reservation-design-${language}-${theme}-${name}-${state}.png`, fullPage: state !== "confirmation" });
      };
      const counts = () => page.evaluate(() => window.__intakeAcceptance.counts());
      const rows = () => page.locator(".intake-queue-row button");
      const select = async index => {
        if (width < 701 && await page.locator(".intake-mobile-back").isVisible()) await page.locator(".intake-mobile-back").click();
        await rows().nth(index).click();
      };
      await page.goto(`/e2e/reservation-intake/inbox.html?lang=${language}&theme=${theme}`);
      await expect(page.locator("article")).toHaveCount(5);
      expect(await counts()).toEqual({ reservations: 0, jobs: 0 });
      await expect(page.getByText(d.environment, { exact: false })).toBeVisible(); await shot("inbox");
      await select(1);
      await expect(page.locator(".intake-candidate-heading")).toBeFocused();
      await expect(page.getByText(d.previous, { exact: true })).toBeVisible();
      expect(await page.locator(".intake-diagnostics").evaluate(element => element.open)).toBe(false);
      await page.getByRole("button", { name: d.refresh, exact: true }).click();
      await page.getByRole("radio", { name: "Synthetic Harbor House" }).check();
      await page.getByRole("button", { name: r.resolve, exact: true }).click();
      await expect(page.getByRole("button", { name: d.approve, exact: true })).toBeEnabled();
      await shot("review");
      await page.getByRole("button", { name: d.approve, exact: true }).click();
      expect(await counts()).toEqual({ reservations: 0, jobs: 0 });
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("button", { name: d.final, exact: true })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("dialog").getByRole("button", { name: d.back, exact: true })).toBeFocused();
      await shot("confirmation");
      await page.getByRole("dialog").getByRole("button", { name: d.back, exact: true }).click();
      expect(await counts()).toEqual({ reservations: 0, jobs: 0 });
      await page.getByRole("button", { name: d.approve, exact: true }).click();
      await page.getByRole("button", { name: d.final, exact: true }).click();
      await expect(page.locator(".intake-candidate-heading").locator("..").getByText(r.PROMOTED, { exact: true })).toBeVisible();
      expect(await counts()).toEqual({ reservations: 1, jobs: 0 }); await shot("promoted");
      await page.reload(); await select(1); await page.getByRole("button", { name: d.refresh, exact: true }).click();
      expect(await counts()).toEqual({ reservations: 1, jobs: 0 });
      await expect(page.getByRole("button", { name: d.approve, exact: true })).toHaveCount(0);
      if (width < 701) await page.locator(".intake-mobile-back").click();
      // Operational acceptance uses the NEW candidate for later synthetic source changes.
      await select(4); await page.getByRole("button", { name: d.refresh, exact: true }).click();
      await page.getByRole("radio", { name: "Synthetic Harbor House" }).check(); await page.getByRole("button", { name: r.resolve, exact: true }).click();
      await page.getByRole("button", { name: d.approve, exact: true }).click(); await page.getByRole("button", { name: d.final, exact: true }).click();
      expect(await counts()).toEqual({ reservations: 2, jobs: 0 });
      for (const signal of ["DATES_CHANGED", "STATUS_CHANGED", "SOURCE_DISAPPEARED"]) {
        if (width < 701) await page.locator(".intake-mobile-back").click();
        const content = await page.evaluate(signal => window.__intakeAcceptance.snapshot(signal), signal);
        await page.locator(".intake-local-tools summary").click();
        await page.getByLabel(t.import).setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(content) });
        await select(4); await page.getByRole("button", { name: d.refresh, exact: true }).click();
        await expect(page.getByText(r.discrepancy, { exact: true })).toBeVisible();
        expect(await counts()).toEqual({ reservations: 2, jobs: 0 });
        if (signal === "DATES_CHANGED") await shot("discrepancy");
      }
      await select(3); await page.getByRole("button", { name: d.refresh, exact: true }).click();
      await expect(page.getByRole("button", { name: d.locked, exact: true })).toBeDisabled(); await shot("property-required");
      await page.getByRole("button", { name: d.ignore, exact: true }).click();
      await expect(page.getByRole("button", { name: language === "pt" ? "Cancelar" : "Cancel", exact: true })).toBeFocused();
      await page.keyboard.press("Escape"); await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await page.getByRole("button", { name: d.ignore, exact: true }).click();
      await page.getByRole("button", { name: language === "pt" ? "Confirmar ignorar" : "Confirm ignore", exact: true }).click();
      await page.reload(); await select(3); await page.getByRole("button", { name: d.refresh, exact: true }).click();
      await expect(page.locator(".intake-review__main > strong")).toHaveText(r.IGNORED);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]); expect(remote).toEqual([]);
      await expect(page.getByRole("button", { name: /Create Job|Assign cleaner|Send message/ })).toHaveCount(0);
    });
  }
}
