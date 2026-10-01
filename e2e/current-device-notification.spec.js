import { expect, test } from "@playwright/test";
import { e2eManager } from "./globalSetup.js";

const labels = {
  en: {
    signIn: "Sign in", email: "Email", password: "Password",
    test: "Enable & test notifications", testing: "Testing this device…",
    accepted: "FCM accepted the test. Check whether the notification appeared on this device.",
  },
  pt: {
    signIn: "Entrar", email: "E-mail", password: "Senha",
    test: "Ativar e testar notificações", testing: "Testando este dispositivo…",
    accepted: "O FCM aceitou o teste. Verifique se a notificação apareceu neste dispositivo.",
  },
  es: {
    signIn: "Ingresar", email: "Correo electrónico", password: "Contraseña",
    test: "Activar y probar notificaciones", testing: "Probando este dispositivo…",
    accepted: "FCM aceptó la prueba. Comprueba si la notificación apareció en este dispositivo.",
  },
};

async function openManager(page, { locale = "en", result = "pending" } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((language) => localStorage.setItem("cleanflow-language", language), locale);
  // Only provider transport is synthetic. Real local Auth and Firestore
  // manager membership still gate the normal shell; no OS permission/push
  // or production credential is needed or claimed by these Chromium checks.
  await page.route("**/src/features/notifications/notificationService.js*", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: `
      export async function getPushChannelDiagnostics() {
        window.__notificationCheckCalls = (window.__notificationCheckCalls || 0) + 1;
        return { state: "ready" };
      }
      export async function enablePushNotifications() { throw new Error("Not this explicit test action"); }
      export function getLocalPushDeviceId() { return "11111111-2222-4333-8444-555555555555"; }
      export function getCachedFcmRegistrationState() { return "unknown"; }
      export async function testCurrentDeviceNotifications() {
        window.__currentDeviceTestCalls = (window.__currentDeviceTestCalls || 0) + 1;
        return ${result === "pending"
    ? 'new Promise((resolve) => { window.__resolveCurrentDeviceTest = resolve; })'
    : JSON.stringify({ state: result })};
      }
    ` });
  });
  await page.route("**/src/features/notifications/notificationHealthReporter.js*", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "export async function reportCurrentManagerNotificationHealth() { return true; }",
    });
  });
  await page.goto("/");
  await page.getByLabel(labels[locale].email, { exact: true }).fill(e2eManager.email);
  await page.getByLabel(labels[locale].password, { exact: true }).fill(e2eManager.password);
  await page.getByRole("button", { name: labels[locale].signIn, exact: true }).click();
  const button = page.getByRole("button", { name: labels[locale].test, exact: true });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  return button;
}

for (const locale of Object.keys(labels)) {
  test(`mobile current-device test is explicit, single pending action and acceptance is not phone delivery (${locale})`, async ({ page }) => {
    const button = await openManager(page, { locale });
    expect(await page.evaluate(() => window.__currentDeviceTestCalls || 0)).toBe(0);
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await button.click();
    const pending = page.getByRole("button", { name: labels[locale].testing, exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    expect(await page.evaluate(() => window.__currentDeviceTestCalls)).toBe(1);
    await page.evaluate(() => window.__resolveCurrentDeviceTest({ state: "fcm-accepted" }));
    await expect(page.getByText(labels[locale].accepted, { exact: true })).toBeVisible();
    await expect(button).toBeEnabled();
    expect(await page.evaluate(() => window.__currentDeviceTestCalls)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

test("mobile denied permission exposes settings guidance and check again without silently testing", async ({ page }) => {
  const button = await openManager(page, { result: "permission-blocked" });
  await button.click();
  await expect(page.getByText(
    "Notifications are blocked on this device. Update browser/app and device settings, then check again.",
    { exact: true },
  )).toBeVisible();
  const before = await page.evaluate(() => window.__notificationCheckCalls);
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__notificationCheckCalls)).toBe(before + 1);
  expect(await page.evaluate(() => window.__currentDeviceTestCalls)).toBe(1);
  await expect(page.getByRole("button", { name: "Check again", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("mobile unsupported browser explains installed iPhone app prerequisite without silent retries", async ({ page }) => {
  const button = await openManager(page, { result: "unsupported" });
  await button.click();
  await expect(page.getByText(
    "FCM notifications are not supported here. On iPhone/iPad, open the installed Home Screen app and try again.",
    { exact: true },
  )).toBeVisible();
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => window.__currentDeviceTestCalls)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
