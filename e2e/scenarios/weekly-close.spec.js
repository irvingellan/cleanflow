import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, step, loginManager } from "./support.js";
import { periodMessage } from "../../src/features/weekly-close/weeklyClosePeriodMessages.js";
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
  // Unpaired amounts remain on their own service. Comparing these partial aggregates would mix scopes.
  await expect(metric(root, translate, "clientCharges").locator("dd")).toHaveText(translate("weeklyClose.incomplete"));
  await expect(metric(root, translate, "clientCharges")).toContainText(translate("weeklyClose.pendingService", { count: 1 }));
  await expect(root.locator(".weekly-close-attention")).toContainText(periodMessage(language, "attention", { count: 4 }));
  await expect(metric(root, translate, "clientCharges")).not.toContainText(currency(870));
  await expect(metric(root, translate, "grossOperationalMargin")).toContainText(translate("weeklyClose.pendingServices", { count: 2 }));
  await expect(metric(root, translate, "grossOperationalMargin")).not.toContainText(translate("weeklyClose.pendingServices", { count: 4 }));
  await expect(metric(root, translate, "cleanerPayoutTotal")).not.toContainText(currency(460));
  const review = root.getByRole("region", { name: periodMessage(language, "moneyIssues", { count: 2 }) });
  await expect(review.getByRole("listitem")).toHaveCount(2);
  for (const [property, field] of [["Weekly missing charge service", "missing_client_price"], ["Weekly missing payout service", "missing_cleaner_payout"]]) {
    const item = review.getByRole("listitem").filter({ hasText: property });
    await expect(item).toContainText(translate(`weeklyClose.reason.${field}`));
    await expect(item.getByRole("button")).toBeVisible();
  }
  await expect(metric(root, translate, "cleanerPaidTotal")).toContainText(currency(100));
  await expect(metric(root, translate, "cleanerOutstandingTotal")).toContainText(currency(170));
  await expect(root).toContainText(translate("weeklyClose.externalPayments"));
  await expect(root).not.toContainText(/weeklyClose\.|weekly-close-\d-/);
  const visibleRows = await root.locator(".weekly-close-job").allTextContents();
  expect(visibleRows.every((value) => !/Excluded |Outside /.test(value))).toBe(true);
  await expect(root.getByRole("button", { name: /invoice|record payment|mark paid/i })).toHaveCount(0);
}

async function applyDates(root, start, end, language = "en") {
  await root.getByLabel(periodMessage(language, "start"), { exact: true }).fill(start);
  await root.getByLabel(periodMessage(language, "end"), { exact: true }).fill(end);
  await root.getByRole("button", { name: periodMessage(language, "apply"), exact: true }).click();
}

function isEmulatorWebChannelError(message, browserName) {
  if (browserName !== "webkit") return false;
  return /^(?:Fetch API cannot load http:\/\/)?\/?127\.0\.0\.1:\d+\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel\?\S+ due to access control checks\.$/.test(message);
}

test("weekly-close", async ({ page, browser, browserName, baseURL }, testInfo) => {
  const fixture = await step(0, "Seed synthetic Weekly Close fixtures", () => seedWeeklyCloseFixture(testInfo));
  const before = await weeklyCloseDomainSnapshot(fixture);
  const runtimeErrors = [];
  let unrelatedEmulatorWebChannelErrors = 0;
  page.on("pageerror", (error) => {
    // On WebKit, unrelated realtime subscriptions can report local CORS during
    // a page reload. The Weekly Close result still requires server-only reads.
    if (isEmulatorWebChannelError(error.message, browserName)) unrelatedEmulatorWebChannelErrors += 1;
    else runtimeErrors.push(error.message);
  });
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
      await page.getByRole("button", { name: "Payouts", exact: true }).click();
      await page.getByRole("button", { name: "Weekly close · Preview", exact: true }).click();
      await expect(page).toHaveURL(/\/weekly-close-preview$/);
      await expect(page.getByRole("button", { name: "Payouts", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.locator(".weekly-close-preview")).toBeVisible();
      await page.locator(".weekly-close-preview").getByRole("button", { name: /Back/ }).click();
      await expect(page).toHaveURL(baseURL + "/");
      await expect(page.getByRole("heading", { name: "Cleaner payouts", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Weekly close · Preview", exact: true }).click();
      await verifyFinancialRows(page.locator(".weekly-close-preview"), "en");
      const firestorePort = process.env.VITE_CLEANFLOW_EMULATOR_FIRESTORE_PORT || process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1);
      const lookup = (url) => url.origin === `http://127.0.0.1:${firestorePort}` && url.pathname.endsWith(":runQuery");
      let propertyLookups = 0;
      const dropFirstPropertyLookup = async (route) => {
        const request = route.request();
        if (request.method() === "POST"
          && request.postDataJSON()?.structuredQuery?.from?.[0]?.collectionId === "properties"
          && ++propertyLookups === 1) {
          await route.abort("failed");
        } else {
          await route.continue();
        }
      };
      await page.route(lookup, dropFirstPropertyLookup);
      try {
        await page.reload();
        await verifyFinancialRows(page.locator(".weekly-close-preview"), "en");
        expect(propertyLookups).toBe(2);
      } finally {
        await page.unroute(lookup, dropFirstPropertyLookup);
      }
    });
    await step(40, "Week selection and refresh are deterministic read-only actions", async () => {
      const root = page.locator(".weekly-close-preview");
      await root.getByRole("button", { name: "This week", exact: true }).click();
      await expect(root.getByLabel("Service date from", { exact: true })).toHaveValue("2026-09-28");
      await expect(root.locator(".weekly-close-metrics > div").first().locator("dd")).toHaveText("1");
      await root.getByRole("button", { name: "Previous week", exact: true }).click();
      await expect(root.getByLabel("Service date from", { exact: true })).toHaveValue("2026-09-21");
      await verifyFinancialRows(root, "en");
      await applyDates(root, "2026-09-24", "2026-09-25");
      await expect(root.getByLabel("Service date from", { exact: true })).toHaveValue("2026-09-24");
      await expect(root.locator(".weekly-close-metrics > div").first().locator("dd")).toHaveText("2");
      await applyDates(root, "2026-09-21", "2026-09-27");
      await root.getByRole("button", { name: "Refresh", exact: true }).click();
      await verifyFinancialRows(root, "en");
      await root.getByRole("button", { name: "Previous week", exact: true }).click();
      await expect(root.getByLabel("Service date from", { exact: true })).toHaveValue("2026-09-14");
      await expect(root.locator(".weekly-close-metrics > div").first().locator("dd")).toHaveText("1");
      await applyDates(root, "2026-09-07", "2026-09-13");
      await expect(root.locator(".weekly-close-metrics > div").first().locator("dd")).toHaveText("0");
      await expect(root.locator(".weekly-close-client")).toHaveCount(0);
      await applyDates(root, "2026-09-21", "2026-09-27");
      await verifyFinancialRows(root, "en");
    });
    await step(50, "Client selection narrows the loaded service rows and totals", async () => {
      const root = page.locator(".weekly-close-preview");
      await root.getByLabel("Client", { exact: true }).selectOption({ label: "Weekly Client Alpha" });
      await expect(root.locator(".weekly-close-client")).toHaveCount(1);
      await expect(root.locator(".weekly-close-metrics > div").first().locator("dd")).toHaveText("2");
      await expect(root.locator(".weekly-close-client")).toContainText("Weekly Client Alpha");
      await root.getByLabel("Client", { exact: true }).selectOption("");
      await verifyFinancialRows(root, "en");
    });
    await step(55, "Dense dates remain partial and a narrower range restores complete totals", async () => {
      const root = page.locator(".weekly-close-preview");
      const count = root.locator(".weekly-close-metrics > div").first().locator("dd");
      const charges = metric(root, (key) => translateInLanguage("en", key), "clientCharges");
      const partial = root.getByText(/Partial results.*200 Job records/);
      await applyDates(root, "2026-10-10", "2026-10-11");
      await expect(partial).toBeVisible();
      await expect(count).toHaveText("200");
      await expect(charges.locator("dd")).toHaveText("Incomplete");
      await expect(charges).toContainText("$200.00");
      await applyDates(root, "2026-10-11", "2026-10-11");
      await expect(count).toHaveText("101");
      await expect(charges.locator("dd")).toHaveText("$101.00");
      await expect(partial).toHaveCount(0);
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
        await applyDates(root, "2026-09-21", "2026-09-27", language);
        await verifyFinancialRows(root, language);
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          let dimensions;
          await expect.poll(async () => {
            dimensions = await page.evaluate(() => ({
              viewportWidth: window.innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              bodyWidth: document.body.scrollWidth,
            }));
            return Math.max(dimensions.documentWidth, dimensions.bodyWidth);
          }, { message: `${language} layout at ${viewport.width}px` }).toBeLessThanOrEqual(viewport.width);
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
      if (unrelatedEmulatorWebChannelErrors) {
        await testInfo.attach("emulator-webchannel-cors-count", {
          body: JSON.stringify({ count: unrelatedEmulatorWebChannelErrors }),
          contentType: "application/json",
        });
      }
    });
  } finally { await cleanupWeeklyCloseFixture(fixture); }
});
