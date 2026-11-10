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

function restQueryCollection(response) {
  const url = new URL(response.url());
  if (url.origin !== firestoreOrigin || !url.pathname.endsWith(":runQuery")
      || response.request().method() !== "POST") return undefined;
  return response.request().postDataJSON()?.structuredQuery?.from?.[0]?.collectionId;
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

test("an unanswered Dashboard read stays actionable and resumes through the real emulator on one retry", async ({ page }) => {
  test.setTimeout(55_000);
  const successfulQueries = new Set();
  page.on("response", (response) => {
    const collection = restQueryCollection(response);
    if (collection && response.ok()) successfulQueries.add(collection);
  });
  await page.route((url) => url.pathname === "/src/features/dashboard/dashboardService.js"
    && !url.searchParams.has("p0-original"), (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      let attempts = 0;
      export async function getOperationalDashboard(observer) {
        if (++attempts === 1) {
          observer?.onPhase("core_reads", "started");
          return new Promise(() => {});
        }
        const service = await import("/src/features/dashboard/dashboardService.js?p0-original");
        return service.getOperationalDashboard(observer);
      }
    `,
  }));
  await page.goto("/");
  await page.bringToFront();
  await signIn(page, e2eManager);
  await expect(page.getByText("Loading dashboard…")).toBeVisible();
  if (!stress) await advanceWhileSuspended(page, 21_000);
  await expect(page.getByText(/Unable to load (the )?dashboard/i)).toBeVisible({ timeout: 22_000 });
  await expect.poll(() => page.evaluate(() => {
    const ring = JSON.parse(sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]");
    return { visibility: document.visibilityState, recoveryStages: ring.filter(({ attempt, stage }) => attempt === 2 && stage.startsWith("dashboard_")).map(({ stage, phase, reason }) => ({ stage, phase, reason })) };
  }), { timeout: 12_000 }).toMatchObject({
    visibility: "visible", recoveryStages: expect.arrayContaining([expect.objectContaining({ stage: "dashboard_load_ready" })]),
  });
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  await expect(page.getByText("Loading dashboard…")).toHaveCount(0);
  expect([...successfulQueries]).toEqual(expect.arrayContaining(
    stress ? ["properties", "jobs", "offers", "issues", "cleaners"] : ["properties", "jobs"],
  ));
  if (stress) {
    // The seeded offer reached the UI, rather than only returning HTTP 200.
    await expect(page.getByText(/E2E Team Cleaner A.*E2E Team Cleaner B|E2E Team Cleaner B.*E2E Team Cleaner A/)).toBeVisible();
  }
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
      page.waitForResponse((response) => restQueryCollection(response) === "properties"),
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
