import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, step, loginManager } from "./support.js";
import { formatPrice } from "../../src/lib/presentation.js";
import { translateInLanguage } from "../../src/i18n/translations.js";
import {
  seedWeeklyCloseFixture,
  cleanupWeeklyCloseFixture,
  weeklyCloseDomainSnapshot,
} from "./weekly-close-fixtures.js";

const viewports = [
  { width: 2560, height: 1080 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

async function openGroups(root) {
  for (const group of await root.locator(".weekly-close-client").all()) {
    if (await group.getAttribute("open") === null) await group.locator("summary").click();
  }
}

function metric(root, translate, key) {
  return root.locator(".weekly-close-metrics > div").filter({
    has: root.page().getByText(translate(`weeklyClose.${key}`), { exact: true }),
  });
}

async function verifyFinancialRows(root, language) {
  const translate = (key, replacements) => translateInLanguage(language, key, replacements);
  const currency = (value) => formatPrice(value, translate, language);
  await expect(root.locator(".weekly-close-client")).toHaveCount(3);
  await openGroups(root);
  await expect(root.locator(".weekly-close-job")).toHaveCount(6);
  const expectations = [
    ["Weekly paid service", 200, 100, "PAID"],
    ["Weekly outstanding service", 180, 80, "OUTSTANDING"],
    ["Weekly v2 service", 240, 120, "UNKNOWN"],
    ["Weekly grouped service", 140, 70, "UNKNOWN"],
    ["Weekly missing charge service", null, 90, "OUTSTANDING"],
    ["Weekly missing payout service", 110, null, "UNKNOWN"],
  ];
  for (const [property, charge, payout, status] of expectations) {
    const row = root.locator(".weekly-close-job").filter({ hasText: property });
    await expect(row).toHaveCount(1);
    const financialValue = (key) => row.locator("dl > div").filter({
      has: root.page().getByText(translate(`weeklyClose.${key}`), { exact: true }),
    }).locator("dd");
    await expect(financialValue("clientCharge")).toHaveText(charge === null ? translate("weeklyClose.unknown") : currency(charge));
    await expect(financialValue("cleanerPayout")).toHaveText(payout === null ? translate("weeklyClose.unknown") : currency(payout));
    await expect(row.locator(".weekly-close-status")).toHaveText(translate(`weeklyClose.status.${status}`));
  }
  await expect(metric(root, translate, "completedServiceCount").locator("dd")).toHaveText("6");
  // Incomplete financial totals are labelled incomplete; only explicitly labelled known
  // subtotals reconcile with the available rows, never fabricated zero values.
  await expect(metric(root, translate, "clientCharges").locator("dd")).toHaveText(translate("weeklyClose.incomplete"));
  await expect(metric(root, translate, "clientCharges")).toContainText(translate("weeklyClose.pendingService", { count: 1 }));
  await expect(root.locator(".weekly-close-attention")).toContainText(translate("weeklyClose.attentionSummary", { count: 4 }));
  await expect(metric(root, translate, "clientCharges")).toContainText(currency(870));
  await expect(metric(root, translate, "grossOperationalMargin")).toContainText(translate("weeklyClose.pendingServices", { count: 2 }));
  await expect(metric(root, translate, "grossOperationalMargin")).not.toContainText(translate("weeklyClose.pendingServices", { count: 4 }));
  await expect(metric(root, translate, "cleanerPayoutTotal")).toContainText(currency(460));
  await expect(metric(root, translate, "cleanerPaidTotal")).toContainText(currency(100));
  await expect(metric(root, translate, "cleanerOutstandingTotal")).toContainText(currency(170));
  await expect(root).toContainText(translate("weeklyClose.externalPayments"));
  await expect(root).not.toContainText(/weeklyClose\.|weekly-close-\d-/);
  const visibleRows = await root.locator(".weekly-close-job").allTextContents();
  expect(visibleRows.every((value) => !/Excluded |Outside /.test(value))).toBe(true);
  await expect(root.getByRole("button", { name: /invoice|record payment|mark paid/i })).toHaveCount(0);
}

test("weekly-close", async ({ page, browser, baseURL }, testInfo) => {
  const fixture = await step(0, "Seed synthetic Weekly Close fixtures", () => seedWeeklyCloseFixture(testInfo));
  const before = await weeklyCloseDomainSnapshot(fixture);
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  try {
    await step(10, "Anonymous route does not expose financial data", async () => {
      const anonymous = await browser.newContext({ baseURL, serviceWorkers: "block" });
      try {
        const anonymousPage = await anonymous.newPage();
        await anonymousPage.goto("/weekly-close-preview");
        await expect(anonymousPage.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
        await expect(anonymousPage.locator(".weekly-close-preview")).toHaveCount(0);
        await expect(anonymousPage.getByText("Weekly Client Alpha")).toHaveCount(0);
      } finally { await anonymous.close(); }
    });
    await step(20, "Open authorized manager Weekly Close", async () => {
      await loginManager(page);
      await page.clock.setFixedTime(new Date("2026-10-01T12:00:00.000Z"));
      await page.goto("/weekly-close-preview");
      await expect(page.locator(".weekly-close-preview")).toBeVisible();
      await page.getByLabel("Week starting", { exact: true }).fill("2026-09-21");
      await verifyFinancialRows(page.locator(".weekly-close-preview"), "en");
    });
    await step(40, "Week selection and refresh are deterministic read-only actions", async () => {
      const root = page.locator(".weekly-close-preview");
      await root.getByRole("button", { name: "This week", exact: true }).click();
      await expect(root.getByLabel("Week starting", { exact: true })).toHaveValue("2026-09-28");
      await expect(root.locator(".weekly-close-metrics > div").first().locator("dd")).toHaveText("1");
      await root.getByRole("button", { name: "Previous week", exact: true }).click();
      await expect(root.getByLabel("Week starting", { exact: true })).toHaveValue("2026-09-21");
      await verifyFinancialRows(root, "en");
      await root.getByLabel("Week starting", { exact: true }).fill("2026-09-24");
      await expect(root.getByLabel("Week starting", { exact: true })).toHaveValue("2026-09-21");
      await root.getByRole("button", { name: "Refresh", exact: true }).click();
      await verifyFinancialRows(root, "en");
      await root.getByRole("button", { name: "Previous week", exact: true }).click();
      await expect(root.getByLabel("Week starting", { exact: true })).toHaveValue("2026-09-14");
      await expect(root.locator(".weekly-close-metrics > div").first().locator("dd")).toHaveText("1");
      await root.getByLabel("Week starting", { exact: true }).fill("2026-09-07");
      await expect(root.locator(".weekly-close-metrics > div").first().locator("dd")).toHaveText("0");
      await expect(root.locator(".weekly-close-client")).toHaveCount(0);
      await root.getByLabel("Week starting", { exact: true }).fill("2026-09-21");
      await verifyFinancialRows(root, "en");
    });
    await step(60, "Visual matrix: EN/PT/ES across desktop, tablet and phone", async () => {
      const directory = resolve("test-results/weekly-close", `run-${testInfo.repeatEachIndex}`);
      await mkdir(directory, { recursive: true });
      const measurements = [];
      for (const language of ["en", "pt", "es"]) {
        await page.evaluate((locale) => {
          localStorage.setItem("cleanflow-language", locale);
          localStorage.setItem("cleanflow-manager-theme", "light");
        }, language);
        await page.reload();
        const root = page.locator(".weekly-close-preview");
        const translate = (key) => translateInLanguage(language, key);
        await expect(root.getByRole("heading", { name: translate("weeklyClose.title"), exact: true })).toBeVisible();
        await root.getByLabel(translate("weeklyClose.weekStarting"), { exact: true }).fill("2026-09-21");
        await verifyFinancialRows(root, language);
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          const dimensions = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
          }));
          expect(dimensions.documentWidth).toBeLessThanOrEqual(viewport.width);
          expect(dimensions.bodyWidth).toBeLessThanOrEqual(viewport.width);
          const bounds = await root.boundingBox();
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
          const path = resolve(directory, `${language}-${viewport.width}x${viewport.height}.png`);
          await page.screenshot({ path, fullPage: true });
          await testInfo.attach(`${language}-${viewport.width}x${viewport.height}`, { path, contentType: "image/png" });
          measurements.push({ language, viewport, ...dimensions, bounds });
        }
      }
      await writeFile(resolve(directory, "measurements.json"), JSON.stringify(measurements, null, 2));
    });
    await step(100, "All seeded Job and Payout values remain unchanged", async () => {
      expect(await weeklyCloseDomainSnapshot(fixture)).toEqual(before);
      expect(runtimeErrors).toEqual([]);
    });
  } finally { await cleanupWeeklyCloseFixture(fixture); }
});
