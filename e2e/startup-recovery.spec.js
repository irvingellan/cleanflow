import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { e2eManager, e2eAuthPort, e2eFirestorePort, requireLocalE2EEmulators } from "./globalSetup.js";

const appOrigin = "http://127.0.0.1:4173";
const firestoreOrigin = `http://127.0.0.1:${e2eFirestorePort}`;
const stress = process.env.CLEANFLOW_P0_STRESS === "1";

test.beforeEach(async ({ context }) => {
  // The actual Vite app and demo-project Auth and Firestore emulators are the
  // only network targets. Never let a fixture reach production services.
  const allowed = new Set([appOrigin, firestoreOrigin, `http://127.0.0.1:${e2eAuthPort}`]);
  // Leave the emulator's streaming requests on the browser's normal path.
  await context.route((url) => !allowed.has(url.origin), (route) => route.abort("blockedbyclient"));
});

async function advanceWhileSuspended(page, milliseconds) {
  await page.clock.setSystemTime(Date.now() + milliseconds);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
}

async function signIn(page, { email, password }) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

function restQueryCollection(request) {
  const url = new URL(request.url());
  if (url.origin !== firestoreOrigin || !url.pathname.endsWith(":runQuery")
      || request.method() !== "POST") return undefined;
  return request.postDataJSON()?.structuredQuery?.from?.[0]?.collectionId;
}

test("recovers from an unanswered Firebase Auth observer without treating the browser as signed out", async ({ page }) => {
  await page.route("**/src/features/auth/authService.js*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      export const signInWithEmail = () => { throw new Error("Unexpected interactive sign-in"); };
      export const signOutManager = () => { throw new Error("Unexpected sign-out"); };
      export const subscribeToAuthState = (callback) => {
        const ready = () => callback(null);
        window.addEventListener("synthetic-auth-ready", ready);
        return () => window.removeEventListener("synthetic-auth-ready", ready);
      };
    `,
  }));
  await page.goto("/");
  await expect(page.getByText("Checking sign-in…")).toBeVisible();
  await advanceWhileSuspended(page, 13_000);
  await expect(page.getByRole("alert")).toContainText("could not check your session");
  await expect(page.locator('input[name="email"]')).toHaveCount(0);
  let navigations = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
  await page.evaluate(() => window.dispatchEvent(new Event("synthetic-auth-ready")));
  await expect(page.locator('input[name="email"]')).toBeVisible();
  expect(navigations).toBe(0);
});

test("an unanswered Dashboard REST request stays actionable and resumes through the real emulator on one retry", async ({ page }) => {
  test.setTimeout(55_000);
  const successfulQueries = new Set();
  page.on("response", (response) => {
    const collection = restQueryCollection(response.request());
    if (collection && response.ok()) successfulQueries.add(collection);
  });
  await page.addInitScript((origin) => {
    const fetchFromBrowser = window.fetch.bind(window);
    let propertiesSeen = false;
    let holdFirstWave = true;
    const firstWaveReleased = new Promise((resolve) =>
      window.addEventListener("p0-release-rest-response", resolve, { once: true }));
    window.fetch = async (resource, options) => {
      const url = new URL(typeof resource === "string" || resource instanceof URL ? resource : resource.url, location.href);
      if (url.origin !== origin || !url.pathname.endsWith(":runQuery") || options?.method !== "POST") {
        return fetchFromBrowser(resource, options);
      }
      // The second Properties request begins the retry. Hold only the first
      // wave's results so the retry still uses the real emulator transport.
      const collection = JSON.parse(options.body).structuredQuery.from[0].collectionId;
      if (collection === "properties") {
        if (propertiesSeen) holdFirstWave = false;
        propertiesSeen = true;
      }
      if (!holdFirstWave) return fetchFromBrowser(resource, options);
      try {
        const response = await fetchFromBrowser(resource, options);
        if (response.ok) window.__p0HeldRestResponse = true;
        return await firstWaveReleased.then(() => response);
      } catch (error) {
        await firstWaveReleased;
        throw error;
      }
    };
  }, firestoreOrigin);

  try {
    await page.goto("/");
    await page.bringToFront();
    await signIn(page, e2eManager);
    await expect.poll(() => page.evaluate(() => window.__p0HeldRestResponse)).toBe(true);
    await expect(page.getByText("Loading dashboard…")).toBeVisible();
    if (!stress) await advanceWhileSuspended(page, 21_000);
    await expect(page.getByText(/Unable to load (the )?dashboard/i)).toBeVisible({ timeout: 22_000 });
    await expect.poll(() => page.evaluate(() => {
      const ring = JSON.parse(sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]");
      return {
        timedOut: ring.some(({ attempt, stage, phase }) => attempt === 1
          && stage === "dashboard_load_timeout" && phase === "core_reads"),
        ready: ring.some(({ attempt, stage }) => attempt === 2 && stage === "dashboard_load_ready"),
      };
    }), { timeout: 12_000 }).toEqual({ timedOut: true, ready: true });
    await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
    await expect(page.getByText("Loading dashboard…")).toHaveCount(0);
    expect([...successfulQueries]).toEqual(expect.arrayContaining(
      stress ? ["properties", "jobs", "offers", "issues", "cleaners"] : ["properties", "jobs"],
    ));
    if (stress) {
      await expect(page.getByText(/E2E Team Cleaner A.*E2E Team Cleaner B|E2E Team Cleaner B.*E2E Team Cleaner A/)).toBeVisible();
    }
  } finally {
    await page.evaluate(() => window.dispatchEvent(new Event("p0-release-rest-response"))).catch(() => {});
  }
});

test("Dashboard retries automatically when an offline browser reconnects", async ({ page, context }) => {
  await page.goto("/");
  await signIn(page, e2eManager);
  const dashboard = page.getByRole("heading", { name: "Operations dashboard" });
  await expect(dashboard).toBeVisible();
  let navigations = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });

  try {
    await context.setOffline(true);
    // Playwright network emulation and the OS online hint are independent.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
    });
    await page.getByRole("button", { name: "Refresh dashboard" }).click();
    await expect(page.getByText(/Unable to load (the )?dashboard/i)).toBeVisible();
    await expect(dashboard).toHaveCount(0);

    await context.setOffline(false);
    const recoveredProperties = page.waitForResponse((response) =>
      response.ok() && restQueryCollection(response.request()) === "properties");
    await page.evaluate(() => {
      delete navigator.onLine;
      window.dispatchEvent(new Event("online"));
    });
    await recoveredProperties;
    await expect(dashboard).toBeVisible();
    expect(navigations).toBe(0);
  } finally {
    await context.setOffline(false);
  }
});

test("Dashboard retries a Firestore Lite fetch failure once without navigating", async ({ page }) => {
  await page.addInitScript((origin) => {
    const fetchFromBrowser = window.fetch.bind(window);
    let failed = false;
    window.fetch = (resource, options) => {
      const url = new URL(resource instanceof Request ? resource.url : resource, location.href);
      if (!failed && url.origin === origin && url.pathname.endsWith(":runQuery") && options?.method === "POST") {
        failed = true;
        return Promise.reject(new TypeError("Synthetic request failure before HTTP response"));
      }
      return fetchFromBrowser(resource, options);
    };
  }, firestoreOrigin);

  await page.goto("/");
  await page.bringToFront();
  let navigations = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
  await signIn(page, e2eManager);
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  const events = await page.evaluate(() => {
    const ring = JSON.parse(sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]");
    return ring.filter(({ stage }) => ["dashboard_load_error", "dashboard_recovery", "dashboard_load_ready"].includes(stage))
      .map(({ stage, attempt, reason }) => ({ stage, attempt, reason }));
  });
  expect(events).toEqual([
    { stage: "dashboard_load_error", attempt: 1, reason: "firestore-unknown" },
    { stage: "dashboard_recovery", attempt: 2, reason: "auto" },
    { stage: "dashboard_load_ready", attempt: 2, reason: undefined },
  ]);
  expect(navigations).toBe(0);
});

test("Dashboard REST queries enforce manager access in Firestore independently of the UI", async ({ page }) => {
  requireLocalE2EEmulators();
  let rawLiteQueryLogs = 0;
  page.on("console", (message) => {
    if (message.type() !== "warning" && message.type() !== "error") return;
    const line = message.text();
    if (line.includes("_lite") && line.includes("RunQuery")) rawLiteQueryLogs += 1;
  });
  const admin = initializeApp({ projectId: "demo-cleanflow" }, "cleanflow-p0-dashboard-outsider");
  const auth = getAuth(admin);
  const outsider = { email: `dashboard-outsider-${randomUUID()}@cleanflow.e2e`, password: e2eManager.password };
  let uid;

  async function expectQueryDenied() {
    const [response, errorCode] = await Promise.all([
      page.waitForResponse((response) => restQueryCollection(response.request()) === "properties"),
      page.evaluate(async () => {
        const { getOperationalDashboard } = await import("/src/features/dashboard/dashboardService.js?p0-original");
        try {
          await getOperationalDashboard();
          return "unexpected-success";
        } catch (error) {
          return error?.code;
        }
      }),
    ]);
    expect(response.status()).toBe(403);
    expect(errorCode).toBe("permission-denied");
    await expect(page.getByRole("heading", { name: "Operations dashboard" })).toHaveCount(0);
  }

  try {
    ({ uid } = await auth.createUser(outsider));
    await page.goto("/");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expectQueryDenied();

    await signIn(page, outsider);
    await expect(page.getByRole("alert")).toContainText("does not have active manager access");
    await expectQueryDenied();
    expect(rawLiteQueryLogs).toBe(0);
  } finally {
    if (uid) await auth.deleteUser(uid);
    await deleteApp(admin);
  }
});
