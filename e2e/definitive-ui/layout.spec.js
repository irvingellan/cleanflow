import { test } from "@playwright/test";
import { seedOperation } from "./fixtures.js";
import { goSection, loginManager, managerContext, shot } from "./support.js";

// Manager screens at the operators' real screens: Gabi's MacBook Air 13" (Safari
// tab bar, and the Dock web app), a common desktop, Irving's 3440 ultrawide and a 4K panel at 1:1.
const phase = process.env.DEFINITIVE_UI_PHASE || "after";
const screens = [
  { name: "macbook-safari", width: 1440, height: 790 },
  { name: "macbook-dock", width: 1440, height: 840 },
  { name: "desktop-1920", width: 1920, height: 1000 },
  { name: "ultrawide-3440", width: 3440, height: 1300 },
  { name: "4k-3840", width: 3840, height: 2000 },
];
const themes = (process.env.LAYOUT_THEMES || "light,dark").split(",");
let fixture;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { fixture = await seedOperation(); });

for (const theme of themes) {
  test(`layout ${theme}`, async ({ browser }) => {
    const context = await managerContext(browser, theme);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginManager(page, fixture.manager);
    for (const screen of screens) {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      const base = `${phase}-layout-${screen.name}-${theme}`;
      await goSection(page, "Painel");
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${process.env.DEFINITIVE_UI_SHOTS}/${base}-1-home-fold.png`, animations: "disabled" });
      await goSection(page, "Serviços");
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${process.env.DEFINITIVE_UI_SHOTS}/${base}-2-services-fold.png`, animations: "disabled" });
      await page.getByRole("button", { name: /Juniper Loft/ }).first().click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${process.env.DEFINITIVE_UI_SHOTS}/${base}-3-job-fold.png`, animations: "disabled" });
    }
    await context.close();
  });
}
