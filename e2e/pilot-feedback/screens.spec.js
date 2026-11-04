// Before/after screenshots. Works on the pilot baseline (5469a32) and on this
// branch: steps that only exist after the change are skipped when absent.
// Output: $PILOT_SHOTS_DIR/<variant>/<project>-<name>.png (fictitious data).
import { test } from "@playwright/test";
import path from "node:path";
import { isMobile } from "./support.js";

const variant = process.env.PILOT_VARIANT || "after";
const dir = process.env.PILOT_SHOTS_DIR || path.resolve("test-results/pilot-feedback-shots");
const shot = (page, testInfo, name, options = {}) => page.screenshot({ path: path.join(dir, variant, `${testInfo.project.name}-${name}.png`), ...options });

async function openHub(page, query = "") {
  await page.goto(`/?screen=hub&lang=pt${query}`);
  await page.locator('[data-job-id="job-1"]').first().waitFor();
}

test("FB03 manager — one interested cleaner", async ({ page }, testInfo) => {
  await page.goto("/?screen=manager&scenario=one&lang=pt");
  await page.locator(".job-intents").waitFor();
  await shot(page, testInfo, "fb03-manager-one-interested", { fullPage: isMobile(testInfo) });
});

test("FB03 manager — several interested cleaners", async ({ page }, testInfo) => {
  await page.goto("/?screen=manager&scenario=several&lang=pt");
  await page.locator(".job-intents").waitFor();
  await shot(page, testInfo, "fb03-manager-several-interested", { fullPage: isMobile(testInfo) });
});

test("FB02/FB04 cleaner — agenda today", async ({ page }, testInfo) => {
  await openHub(page);
  await shot(page, testInfo, "fb04-hub-today");
});

test("FB02 cleaner — scheduled list", async ({ page }, testInfo) => {
  await openHub(page);
  await page.locator(".hb-seg button").nth(1).click();
  await shot(page, testInfo, "fb02-hub-scheduled");
  const byMonth = page.locator('[data-sched-mode="month"]');
  if (await byMonth.count()) {
    await byMonth.click();
    await shot(page, testInfo, "fb02-hub-scheduled-by-month");
  }
});

test("FB01/FB04 cleaner — service detail", async ({ page }, testInfo) => {
  await openHub(page);
  await page.locator('[data-job-id="job-1"]').first().click();
  await page.locator(".hb-checkcard").waitFor();
  await page.waitForTimeout(400);
  await shot(page, testInfo, "fb01-hub-job-detail");
  const access = page.locator(".hb-access");
  if (await access.count()) {
    await page.locator("details.hb-house > summary").click();
    await access.scrollIntoViewIfNeeded();
    await shot(page, testInfo, "fb01-hub-job-access-open");
  }
});

test("FB01 cleaner — access revoked", async ({ page }, testInfo) => {
  test.skip(variant === "before", "state did not exist");
  await openHub(page, "&access=revoked");
  await page.locator('[data-job-id="job-1"]').first().click();
  await page.locator('.hb-access[data-access-state="revoked"]').waitFor();
  await page.locator(".hb-access").scrollIntoViewIfNeeded();
  await shot(page, testInfo, "fb01-hub-job-access-revoked");
});

test("FB06 checklist — 16 photos guidance", async ({ page }, testInfo) => {
  await page.goto("/?screen=checklist&photos=16&lang=pt");
  const gallery = page.locator(".checklist-photo-gallery");
  await gallery.waitFor();
  await gallery.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector(".checklist-photo-gallery").scrollIntoView({ block: "start" }));
  await shot(page, testInfo, "fb06-checklist-guidance");
});

test("FB06 checklist — example photo requirement list", async ({ page }, testInfo) => {
  await page.goto("/?screen=checklist&photos=3&requirements=1&lang=pt");
  const gallery = page.locator(".checklist-photo-gallery");
  await gallery.waitFor();
  await page.evaluate(() => document.querySelector(".checklist-photo-gallery").scrollIntoView({ block: "start" }));
  await shot(page, testInfo, "fb06-checklist-requirements");
});
