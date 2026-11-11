import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { e2eManager } from "../globalSetup.js";

const root = new URL("../../", import.meta.url);
const { emulators } = JSON.parse(readFileSync(new URL("firebase.cleaner-hub-test.json", root), "utf8"));
const expectedBuild = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const baseline = process.env.CLEANFLOW_AUTH_IDB_EXPECT === "baseline";
const login = (page) => page.getByLabel("Email");
const manager = (page) => page.getByRole("button", { name: `Account: ${e2eManager.email}`, exact: true });

test.beforeEach(async ({ request }) => {
  const response = await request.get("/version.json", { maxRedirects: 0 });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    buildId: expectedBuild, environment: "emulator", projectId: "demo-cleanflow",
  });
  const policy = response.headers()["content-security-policy"]?.split(";").map((value) => value.trim()) || [];
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain(
    `connect-src 'self' http://127.0.0.1:${emulators.auth.port} http://127.0.0.1:${emulators.firestore.port}`,
  );
  expect(policy).toContain("form-action 'none'");
});

async function trace(page) {
  return page.evaluate(() => {
    const stages = new Set(["auth_restore_started", "auth_restore_timeout", "auth_restore_resolved"]);
    const ring = JSON.parse(sessionStorage.getItem("cleanflow.manager-access.diagnostics") || "[]");
    return ring.filter(({ stage }) => stages.has(stage))
      .map(({ stage, attempt, durationMs }) => ({ stage, attempt, durationMs }));
  });
}

async function holdAuthStorage(page) {
  // Reproduce Firebase SDK #10540 without reading records or changing the
  // app's SDK settings. The fresh browser context is discarded after the test.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("firebaseLocalStorageDb");
    request.onerror = () => reject(new Error("Could not open the synthetic Auth database."));
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("firebaseLocalStorage")) {
        database.close();
        reject(new Error("The synthetic Auth persistence store is missing."));
        return;
      }
      const transaction = database.transaction("firebaseLocalStorage", "readonly");
      const store = transaction.objectStore("firebaseLocalStorage");
      const close = () => {
        window.__cleanflowTestAuthStorageHeld = false;
        database.close();
      };
      transaction.oncomplete = close;
      transaction.onabort = close;
      function nextCount() {
        const count = store.count();
        count.onerror = () => reject(new Error("Could not hold the synthetic Auth transaction."));
        count.onsuccess = () => {
          window.__cleanflowTestAuthStorageHeld = true;
          resolve();
          nextCount();
        };
      }
      nextCount();
    };
  }));
}

const lockHeld = (page) => page.evaluate(() => window.__cleanflowTestAuthStorageHeld === true);

for (const savedSession of [false, true]) {
  test(savedSession ? "preserves the saved synthetic manager session" : "keeps a signed-out session signed out",
    async ({ context, page: holder }) => {
      await holder.goto("/");
      await expect(login(holder)).toBeVisible();
      if (savedSession) {
        await login(holder).fill(e2eManager.email);
        await holder.getByLabel("Password").fill(e2eManager.password);
        await holder.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(manager(holder)).toBeVisible({ timeout: 10_000 });
      }

      await holdAuthStorage(holder);
      const reopened = await context.newPage();
      let navigations = 0;
      reopened.on("framenavigated", (frame) => { if (frame === reopened.mainFrame()) navigations += 1; });
      await reopened.goto("/", { waitUntil: "domcontentloaded" });
      await reopened.bringToFront();
      const expectedUi = savedSession ? manager(reopened) : login(reopened);
      const unexpectedUi = savedSession ? login(reopened) : manager(reopened);
      let releaseToUiMs;

      if (baseline) {
        await expect(reopened.getByRole("alert")).toContainText("could not check your session", { timeout: 16_000 });
        await expect(login(reopened)).toHaveCount(0);
        await expect(manager(reopened)).toHaveCount(0);
        const timedOut = (await trace(reopened)).find((entry) => entry.stage === "auth_restore_timeout");
        expect(timedOut?.durationMs).toBeGreaterThanOrEqual(12_000);

        await reopened.getByRole("button", { name: "Try again", exact: true }).click();
        await expect(reopened.getByText("Checking sign-in…", { exact: true })).toBeVisible();
        await expect.poll(() => trace(reopened)).toContainEqual(expect.objectContaining({
          stage: "auth_restore_started", attempt: 2,
        }));
        // Leave the real transaction open through an observed retry interval.
        await reopened.waitForTimeout(1_000);
        expect(await lockHeld(holder)).toBe(true);
        expect(await trace(reopened)).not.toContainEqual(expect.objectContaining({
          stage: "auth_restore_resolved",
        }));

        const released = performance.now();
        await holder.close();
        await expect(expectedUi).toBeVisible({ timeout: 10_000 });
        releaseToUiMs = Math.round(performance.now() - released);
      } else {
        await expect(expectedUi).toBeVisible({ timeout: 10_000 });
        expect(await lockHeld(holder)).toBe(true);
        expect(await trace(reopened)).not.toContainEqual(expect.objectContaining({
          stage: "auth_restore_timeout",
        }));
      }

      await expect(unexpectedUi).toHaveCount(0);
      await expect.poll(() => trace(reopened)).toContainEqual(expect.objectContaining({
        stage: "auth_restore_resolved", attempt: baseline ? 2 : 1,
      }));
      expect(navigations).toBe(1);
      console.log("auth_idb_qualification", JSON.stringify({
        expectation: baseline ? "baseline" : "fixed",
        scenario: savedSession ? "saved-synthetic-manager" : "signed-out",
        stages: await trace(reopened),
        releaseToUiMs,
        reloads: navigations - 1,
      }));
    });
}
