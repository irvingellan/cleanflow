import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { writeFile } from "node:fs/promises";
import { e2eManager, getE2eFirestore } from "./globalSetup.js";

const syntheticUid = "e2e-layout-manager-0000000001";
const fixturePrefix = "e2e-load-diagnostics-layout";
const pages = ["dashboard", "jobs", "properties", "clients", "cleaners", "payouts"];
const operations = ["offers", "issues", "assignments", "checklist-run", "checklist-capability", "cleaners"];
const viewports = [
  { width: 2560, height: 1080 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const labels = {
  en: { signIn: "Sign in", email: "Email", password: "Password", title: "Manager page-load timings", top: "Back to top" },
  pt: { signIn: "Entrar", email: "E-mail", password: "Senha", title: "Tempos de carregamento da gerente", top: "Voltar ao topo" },
  es: { signIn: "Ingresar", email: "Correo electrónico", password: "Contraseña", title: "Tiempos de carga del panel", top: "Volver arriba" },
};

function fixtureReferences() {
  if (!["127.0.0.1:8080", "localhost:8080"].includes(process.env.FIRESTORE_EMULATOR_HOST)
    || !["127.0.0.1:9099", "localhost:9099"].includes(process.env.FIREBASE_AUTH_EMULATOR_HOST)
    || process.env.GCLOUD_PROJECT !== "demo-cleanflow") {
    throw new Error("Diagnostics layout fixtures require local demo-cleanflow emulators.");
  }
  const organization = getE2eFirestore().collection("organizations").doc("cleanflow-demo");
  return [
    ...Array.from({ length: 48 }, (_, index) => organization.collection("managerPageLoadEvents").doc(`${fixturePrefix}-${index}`)),
    ...Array.from({ length: 18 }, (_, index) => organization.collection("managerOperationEvents").doc(`${fixturePrefix}-${index}`)),
  ];
}

test.beforeAll(async () => {
  const references = fixtureReferences();
  const batch = getE2eFirestore().batch();
  const now = Date.now();
  const common = {
    uid: syntheticUid,
    sessionId: "e2esess0-synthetic-layout-session",
    deviceId: "e2edev00-synthetic-layout-device",
    deviceClass: "desktop",
    browser: "chrome",
    platform: "macos",
    standalone: false,
    viewport: { width: 1920, height: 1080 },
    appVersion: "e2e-layout",
    connection: { effectiveType: "4g", downlink: 10, rtt: 50, saveData: false },
  };
  references.slice(0, 48).forEach((reference, index) => batch.set(reference, {
    ...common,
    page: pages[index % pages.length],
    durationMs: index === 0 ? 600000 : 250 + index * 83,
    dataDurationMs: 180 + index * 11,
    result: index > 0 && index % 11 === 0 ? "error" : "success",
    createdAt: Timestamp.fromMillis(now - (index + 1) * 60000),
  }));
  references.slice(48).forEach((reference, index) => {
    const visitIndex = Math.floor(index / operations.length);
    const operationIndex = index % operations.length;
    batch.set(reference, {
      ...common,
      page: "job-detail",
      operation: operations[operationIndex],
      phase: "initial",
      pageVisitId: `e2evisit-${fixturePrefix}-${visitIndex}`,
      startedAtMs: now - (visitIndex + 1) * 120000 + operationIndex * 60,
      durationMs: 240 + operationIndex * 210,
      result: operationIndex === 1 ? "error" : "success",
      createdAt: Timestamp.fromMillis(now - (visitIndex + 1) * 120000 + operationIndex * 1000),
    });
  });
  await batch.commit();
});

test.afterAll(async () => {
  // Delete only this spec's exact synthetic fixture documents.
  const references = fixtureReferences();
  const batch = getE2eFirestore().batch();
  references.forEach((reference) => batch.delete(reference));
  await batch.commit();
});

async function openDiagnostics(page, language) {
  await page.addInitScript((locale) => {
    localStorage.setItem("cleanflow-language", locale);
    localStorage.setItem("cleanflow-manager-theme", "light");
  }, language);
  // The existing E2E setup runs Auth + Firestore only. Mock this one local
  // developer callable; manager authorization and timing reads use emulators.
  await page.route("http://127.0.0.1:5001/demo-cleanflow/us-central1/getDevCenterAccess", async (route) => {
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:4173",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
    };
    await route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: route.request().method() === "OPTIONS" ? "" : JSON.stringify({ result: { authorized: true } }),
    });
  });
  await page.goto("/diagnostics/load-times");
  await expect(page.getByRole("heading", { name: labels[language].signIn, exact: true })).toBeVisible();
  await page.getByLabel(labels[language].email, { exact: true }).fill(e2eManager.email);
  await page.getByLabel(labels[language].password, { exact: true }).fill(e2eManager.password);
  await page.getByRole("button", { name: labels[language].signIn, exact: true }).click();
  await expect(page.getByRole("heading", { name: labels[language].title, exact: true })).toBeVisible();
  const diagnostics = page.locator(".manager-load-diagnostics");
  await expect(diagnostics.locator(".load-diagnostics__filters select").nth(2)).toContainText(syntheticUid);
  await diagnostics.locator(".load-diagnostics__filters select").nth(2).selectOption(syntheticUid);
  await expect(diagnostics.locator(".load-diagnostics__events-table tbody tr")).toHaveCount(48);
  await expect(diagnostics.locator(".load-diagnostics__waterfall-row")).toHaveCount(6);
  return diagnostics;
}

async function attachScreenshot(page, testInfo, name, options = {}) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ ...options, path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const language of Object.keys(labels)) {
  for (const viewport of viewports) {
    test(`diagnostics layout ${language} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const diagnostics = await openDiagnostics(page, language);
      const topButton = page.getByRole("button", { name: labels[language].top, exact: true });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect(topButton).toHaveCount(0);
      await expect(page.locator(".foundation--diagnostics")).toBeVisible();
      const foundation = await page.locator(".foundation--diagnostics").boundingBox();
      expect(foundation.width).toBeLessThanOrEqual(1601);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

      const byPage = diagnostics.locator('section[aria-labelledby="load-diagnostics-by-page"]');
      const operationSection = diagnostics.locator('section[aria-labelledby="load-diagnostics-operations"]');
      const events = diagnostics.locator('section[aria-labelledby="load-diagnostics-events"]');
      const boxes = await Promise.all([byPage.boundingBox(), operationSection.boundingBox(), events.boundingBox()]);
      const eventsOverflow = await events.locator(".load-diagnostics__table-wrap").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflow: element.scrollWidth - element.clientWidth,
      }));
      const measurementsPath = testInfo.outputPath("diagnostics-layout-measurements.json");
      await writeFile(measurementsPath, JSON.stringify({ language, viewport, foundation, byPage: boxes[0], operations: boxes[1], events: boxes[2], eventsTable: eventsOverflow }, null, 2));
      await testInfo.attach("diagnostics-layout-measurements", { path: measurementsPath, contentType: "application/json" });
      if (viewport.width >= 1440) {
        expect(foundation.width).toBeGreaterThanOrEqual(Math.min(viewport.width - 48, 1600) - 1);
        expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(1);
        expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
        expect(boxes[2].width).toBeGreaterThan(boxes[0].width + boxes[1].width);
        expect(boxes[2].y).toBeGreaterThanOrEqual(Math.max(boxes[0].y + boxes[0].height, boxes[1].y + boxes[1].height));
        const rowTops = await diagnostics.locator(".load-diagnostics__metric, .load-diagnostics__filters label").evaluateAll((elements) => ({
          metrics: elements.filter((element) => element.classList.contains("load-diagnostics__metric")).map((element) => element.getBoundingClientRect().top),
          filters: elements.filter((element) => element.tagName === "LABEL").map((element) => element.getBoundingClientRect().top),
        }));
        expect(Math.max(...rowTops.metrics) - Math.min(...rowTops.metrics)).toBeLessThanOrEqual(1);
        expect(Math.max(...rowTops.filters) - Math.min(...rowTops.filters)).toBeLessThanOrEqual(1);
        expect(eventsOverflow.overflow).toBeLessThanOrEqual(1);
      } else {
        expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThanOrEqual(1);
        expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height);
      }
      await attachScreenshot(page, testInfo, "diagnostics-top");
      await attachScreenshot(page, testInfo, "diagnostics-full-page", { fullPage: true });
      const waterfallPath = testInfo.outputPath("diagnostics-visit-waterfall.png");
      await diagnostics.locator(".load-diagnostics__visits").screenshot({ path: waterfallPath });
      await testInfo.attach("diagnostics-visit-waterfall", { path: waterfallPath, contentType: "image/png" });

      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await expect(topButton).toBeVisible();
      const button = await topButton.boundingBox();
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.x + button.width).toBeLessThanOrEqual(viewport.width);
      expect(button.y + button.height).toBeLessThanOrEqual(viewport.height);
      await attachScreenshot(page, testInfo, "diagnostics-bottom-scroll-control");
      await topButton.focus();
      await expect(topButton).toBeFocused();
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
      await expect(topButton).toHaveCount(0);
    });
  }
}

test("diagnostics scroll-to-top respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const nativeScrollTo = window.scrollTo.bind(window);
    window.__diagnosticsScrollCalls = [];
    window.scrollTo = (...arguments_) => {
      window.__diagnosticsScrollCalls.push(arguments_[0]);
      nativeScrollTo(...arguments_);
    };
  });
  await openDiagnostics(page, "en");
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    window.__diagnosticsScrollCalls = [];
  });
  const topButton = page.getByRole("button", { name: labels.en.top, exact: true });
  await expect(topButton).toBeVisible();
  await topButton.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.__diagnosticsScrollCalls)).toEqual([{ top: 0, behavior: "auto" }]);
});
