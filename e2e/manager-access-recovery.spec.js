import { expect, test } from "@playwright/test";
import { e2eManager } from "./globalSetup.js";

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
