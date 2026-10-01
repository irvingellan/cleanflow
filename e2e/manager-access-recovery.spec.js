import { expect, test } from "@playwright/test";
import { e2eManager } from "./globalSetup.js";

test("mobile manager access reaches terminal retry despite sustained lifecycle signals", async ({ page }, testInfo) => {
  test.setTimeout(40_000);
  await page.setViewportSize({ width: 390, height: 844 });

  // Intercept only the local Vite service module, not Auth or application UI.
  // An unresolved server-only read reproduces the installed-PWA transport
  // stall without production credentials or a new application test seam.
  await page.route("**/src/features/auth/managerAccessService.js*", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export function verifyManagerAccess() {
          window.__stalledMembershipReads = (window.__stalledMembershipReads || 0) + 1;
          window.__firstMembershipReadAt ??= performance.now();
          return new Promise(() => {});
        }
        export function subscribeToManagerAccess() {
          throw new Error("Unverified membership must not attach a listener");
        }
      `,
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(e2eManager.email);
  await page.getByLabel("Password").fill(e2eManager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toHaveText("Checking manager access…");
  await expect.poll(() => page.evaluate(() => window.__stalledMembershipReads)).toBe(1);

  const dashboard = page.getByRole("heading", { name: "Operations dashboard" });
  const retry = page.getByRole("button", { name: "Try again", exact: true });
  await page.evaluate(() => {
    window.__accessLifecycleStorm = setInterval(() => {
      window.dispatchEvent(new Event("pageshow"));
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    }, 1_500);
  });
  try {
    // Per-attempt failure may still recover through lifecycle signals inside
    // the original cycle budget. Its outer deadline must settle terminally,
    // rather than being renewed by the next signal or verification attempt.
    // Polling may finish just before the deadline callback. Permit observation
    // jitter without relaxing the recorded eighteen-second browser deadline.
    await expect.poll(() => page.evaluate(() => {
      const events = JSON.parse(sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]");
      return events.some((event) => event.stage === "outer_deadline_expired");
    }), { timeout: 20_000, intervals: [100] }).toBe(true);
    const deadlineEvent = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]",
    ).find((event) => event.stage === "outer_deadline_expired"));
    expect(deadlineEvent.durationMs).toBeGreaterThanOrEqual(18_000);
    expect(deadlineEvent.durationMs).toBeLessThanOrEqual(18_500);
    await expect(retry).toBeVisible();
    await expect(page.getByRole("alert")).toHaveText("Unable to verify manager access right now. Please try again.");
    await expect(dashboard).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
    const settledReadCount = await page.evaluate(() => window.__stalledMembershipReads);
    expect(settledReadCount).toBeGreaterThanOrEqual(2);
    expect(settledReadCount).toBeLessThanOrEqual(3);

    // Leave the storm running beyond both attempt deadlines and well beyond
    // terminal settlement: background signals must not restart verification.
    await expect.poll(() => page.evaluate(() => performance.now() - window.__firstMembershipReadAt), {
      timeout: 12_000,
    }).toBeGreaterThanOrEqual(24_000);
    await expect(retry).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(dashboard).toHaveCount(0);
    expect(await page.evaluate(() => window.__stalledMembershipReads)).toBe(settledReadCount);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  } catch (error) {
    await testInfo.attach("manager-access-lifecycle-diagnostics", {
      body: await page.evaluate(() => sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]"),
      contentType: "application/json",
    });
    throw error;
  } finally {
    await page.evaluate(() => clearInterval(window.__accessLifecycleStorm));
  }
});

test("mobile manager access recovers after an offline reload without force-closing", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Chromium requires this after an intercepted offline document reload;
  // it authorizes only the test's local emulator connections.
  await context.grantPermissions(["local-network-access"], { origin: "http://127.0.0.1:4173" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(e2eManager.email);
  await page.getByLabel("Password").fill(e2eManager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const dashboard = page.getByRole("heading", { name: "Operations dashboard" });
  await expect(dashboard).toBeVisible();

  // E2E uses Vite without an installed PWA worker. Keep only the local app
  // document/assets available so an offline reload reaches the auth boundary;
  // browser requests to the Firebase emulators still fail while offline.
  await context.route("http://127.0.0.1:4173/**", async (route) => {
    await route.fulfill({ response: await route.fetch() });
  });
  // Chromium's emulated network interruption does not consistently change
  // navigator.onLine. Model the offline browser signal explicitly as well.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });
  await context.setOffline(true);
  await page.reload();
  const offlineNotice = page.getByText("You appear to be offline. Reconnect and try again.", { exact: true });
  await expect(offlineNotice).toBeVisible({ timeout: 18_000 });
  await expect(dashboard).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();

  await page.evaluate(() => {
    for (let index = 0; index < 5; index += 1) {
      window.dispatchEvent(new Event("pageshow"));
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  await expect(offlineNotice).toBeVisible();
  await expect(dashboard).toHaveCount(0);

  await context.setOffline(false);
  await page.evaluate(() => {
    delete navigator.onLine;
    window.dispatchEvent(new Event("online"));
  });
  try {
    await expect(dashboard).toBeVisible({ timeout: 18_000 });
  } catch (error) {
    await testInfo.attach("manager-access-diagnostics", {
      body: await page.evaluate(() => sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]"),
      contentType: "application/json",
    });
    throw error;
  }
  await expect(offlineNotice).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
