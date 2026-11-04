// Synthetic QA screenshots (fictitious data). They prove UI behavior in the lab,
// NOT physical push delivery on any device.
import { test } from "@playwright/test";
import { isMobile, openTab, runInstant, selectScenario, showMoreControls } from "./guard.ts";

const out = (page: import("@playwright/test").Page, name: string) =>
  `test-results/evidence/${isMobile(page) ? "mobile" : "desktop"}-${name}.png`;

test("evidence screenshots a–f", async ({ page }) => {
  await page.goto("/");

  // (a) Gabi's view
  await page.click('[data-mode-btn="gabi"]');
  if (isMobile(page)) await page.locator(".mtabs.is-gabi button").nth(0).click();
  await page.click('.gabi-card[data-scenario="F04"]'); // switches to the phones tab on mobile
  await showMoreControls(page);
  await page.selectOption("[data-control=speed]", "instant");
  await page.click("[data-control=gabi-play]");
  await page.waitForTimeout(300);
  await page.screenshot({ path: out(page, "a-gabi-view"), fullPage: false });
  await page.click('[data-mode-btn="lab"]');

  // (b) cleaner view: an offer opened on Ana's phone (expanded)
  await selectScenario(page, "C01");
  await runInstant(page);
  await page.locator('[data-testid="phone-ana-iphone"] button', { hasText: "Tocar para abrir" }).click();
  await page.locator('[data-testid="phone-ana-iphone"] button', { hasText: "Ampliar" }).click();
  await page.screenshot({ path: out(page, "b-cleaner-view"), fullPage: false });
  await page.keyboard.press("Escape");

  // (c) first-accept-wins race
  await selectScenario(page, "F04");
  await runInstant(page);
  for (const id of ["ana-iphone", "bia-android"]) await page.locator(`[data-testid="phone-${id}"] [role=tab]`).nth(2).click();
  await page.screenshot({ path: out(page, "c-first-accept-race"), fullPage: false });

  // (d) push failure with persistent inbox
  await selectScenario(page, "F01");
  await runInstant(page);
  await page.locator('[data-testid="phone-ana-iphone"] [role=tab]').nth(1).click();
  await page.screenshot({ path: out(page, "d-push-denied-inbox-kept"), fullPage: false });

  // (e) two devices for Gabi
  await selectScenario(page, "F06");
  await runInstant(page);
  await page.locator('[data-testid="phone-gabi-ipad"] [role=tab]').nth(1).click();
  await page.screenshot({ path: out(page, "e-two-devices"), fullPage: false });

  // (f) event timeline with details
  await selectScenario(page, "F09");
  await runInstant(page);
  await openTab(page, "trail");
  await page.locator('.trail-row[data-step="PROVIDER_UNKNOWN"]').first().click();
  if (isMobile(page)) await page.getByTestId("event-details").scrollIntoViewIfNeeded();
  await page.screenshot({ path: out(page, "f-event-timeline"), fullPage: false });
});
