import { expect, test } from "@playwright/test";
import { e2eManager, e2eAuthPort, e2eFirestorePort } from "./globalSetup.js";

test.beforeEach(async ({ context }) => {
  // The actual Vite app and demo-project Auth and Firestore emulators are the
  // only network targets. Never let a fixture reach production services.
  const allowed = new Set(["http://127.0.0.1:4173", `http://127.0.0.1:${e2eFirestorePort}`, `http://127.0.0.1:${e2eAuthPort}`]);
  // Leave the emulator's streaming requests on the browser's normal path.
  await context.route((url) => !allowed.has(url.origin), (route) => route.abort("blockedbyclient"));
});

async function advanceWhileSuspended(page, milliseconds) {
  await page.clock.setSystemTime(Date.now() + milliseconds);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
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
  await page.getByLabel("Email").fill(e2eManager.email);
  await page.getByLabel("Password").fill(e2eManager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Loading dashboard…")).toBeVisible();
  if (process.env.CLEANFLOW_P0_STRESS !== "1") await advanceWhileSuspended(page, 21_000);
  await expect(page.getByText(/Unable to load (the )?dashboard/i)).toBeVisible({ timeout: 22_000 });
  await expect.poll(() => page.evaluate(() => {
    const ring = JSON.parse(sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]");
    return { visibility: document.visibilityState, recoveryStages: ring.filter(({ attempt, stage }) => attempt === 2 && stage.startsWith("dashboard_")).map(({ stage, phase, reason }) => ({ stage, phase, reason })) };
  }), { timeout: 12_000 }).toMatchObject({
    visibility: "visible", recoveryStages: expect.arrayContaining([expect.objectContaining({ stage: "dashboard_load_ready" })]),
  });
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  await expect(page.getByText("Loading dashboard…")).toHaveCount(0);
});
