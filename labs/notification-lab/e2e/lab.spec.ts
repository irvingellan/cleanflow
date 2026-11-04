import { expect, test } from "@playwright/test";
import { guardCalls, installGuard, isMobile, openTab, runInstant, selectScenario, showMoreControls } from "./guard.ts";

const IDS = [
  ...Array.from({ length: 11 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 12 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`),
];

test.describe("Notification Lab V1", () => {
  test("all 33 scenarios load and run in the UI with every expectation passing; nothing real is used", async ({ page }) => {
    const guard = await installGuard(page);
    await page.goto("/");
    await expect(page.getByTestId("sim-badge")).toHaveText("SIMULADO");
    await openTab(page, "scenarios");
    await expect(page.locator(".cat-item[data-scenario]")).toHaveCount(33);
    for (const id of IDS) {
      await selectScenario(page, id);
      await runInstant(page);
      const checks = page.locator("[data-check]");
      expect(await checks.count(), id).toBeGreaterThan(0);
      const results = await checks.evaluateAll((els) => els.map((e) => e.getAttribute("data-result")));
      expect(results, id).toEqual(results.map(() => "pass"));
      await expect(page.locator(".banner").first()).toBeVisible();
    }
    expect(guard.external).toEqual([]);
    expect(await guardCalls(page)).toEqual([]);
  });

  test("F04 race: exactly one cleaner gets the job; the other sees it unavailable", async ({ page }) => {
    await page.goto("/");
    await selectScenario(page, "F04");
    await runInstant(page);
    for (const id of ["ana-iphone", "bia-android"]) await page.locator(`[data-testid="phone-${id}"] [role=tab]`).nth(2).click();
    const anaHas = await page.locator('[data-testid="phone-ana-iphone"] [data-job="job-maple"]').count();
    const biaHas = await page.locator('[data-testid="phone-bia-android"] [data-job="job-maple"]').count();
    expect(anaHas + biaHas).toBe(1);
    const loser = anaHas ? "bia-android" : "ana-iphone";
    await expect(page.locator(`[data-testid="phone-${loser}"] [data-offer="job-maple"]`)).toContainText(/Indisponível — este serviço já foi aceito/);
  });

  test("permission denied: inbox has the notice, lock screen shows no push", async ({ page }) => {
    await page.goto("/");
    await selectScenario(page, "F01");
    await runInstant(page);
    const ana = page.locator('[data-testid="phone-ana-iphone"]');
    await expect(ana.getByTestId("push-card")).toHaveCount(0);
    await ana.locator("[role=tab]").nth(1).click();
    await expect(ana.getByTestId("inbox-item")).toHaveCount(1);
    await expect(ana).toContainText("Avisos no celular desligados");
  });

  test("Step, Pause and Replay are functional and deterministic", async ({ page }) => {
    await page.goto("/");
    await selectScenario(page, "C04");
    await page.click("[data-control=step]");
    await page.click("[data-control=step]");
    await expect(page.getByTestId("run-status")).toHaveText(/Pausado/);
    await showMoreControls(page);
    await page.selectOption("[data-control=speed]", "fast");
    await page.click("[data-control=run]");
    await expect(page.getByTestId("run-status")).toHaveText(/Concluído/, { timeout: 15_000 });
    const print = await page.getByTestId("fingerprint").textContent();
    await page.click("[data-control=replay]");
    await expect(page.getByTestId("run-status")).toHaveText(/Concluído/, { timeout: 15_000 });
    await expect(page.getByTestId("fingerprint")).toHaveText(print!);
    await expect(page.getByTestId("toast")).toContainText("Repetição idêntica");
  });

  test("Export evidence downloads a local JSON file", async ({ page }) => {
    await page.goto("/");
    await selectScenario(page, "F09");
    await runInstant(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("[data-top=export]")]);
    expect(download.suggestedFilename()).toMatch(/^cleanflow-notification-lab_F09_seed4242_[0-9a-f]{8}\.json$/);
    const path = await download.path();
    const fs = await import("node:fs");
    const report = JSON.parse(fs.readFileSync(path!, "utf8"));
    expect(report.simulated).toBe(true);
    expect(report.push[0].providerResult).toBe("UNKNOWN");
    expect(report.push[0].displayedAt).toBeNull();
  });

  test("snapshot survives a reload; Clear all removes only lab data", async ({ page }) => {
    await page.goto("/");
    await selectScenario(page, "C11");
    await runInstant(page);
    const print = await page.getByTestId("fingerprint").textContent();
    await openTab(page, "evidence");
    if (!isMobile(page)) await page.click('[data-rtab="evidence"]');
    await page.evaluate(() => localStorage.setItem("not-the-lab", "1"));
    await page.click('[data-action="save"]');
    await page.reload();
    await openTab(page, "evidence");
    if (!isMobile(page)) await page.click('[data-rtab="evidence"]');
    await page.click('[data-action="restore"]');
    await expect(page.getByTestId("fingerprint")).toHaveText(print!);
    await page.click('[data-action="clear"]');
    await page.click('[data-action="confirm-clear"]');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toEqual(["not-the-lab"]);
  });

  test("layout has no horizontal page scroll and keyboard reaches the controls", async ({ page }) => {
    await page.goto("/");
    const tabs = isMobile(page) ? (["scenarios", "phones", "trail", "evidence"] as const) : (["phones"] as const);
    for (const tab of tabs) {
      await openTab(page, tab);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, tab).toBeLessThanOrEqual(1);
    }
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["BUTTON", "INPUT", "SELECT"]).toContain(focused);
    const small = await page.locator("[data-control], .cat-item, .phone-tabs button").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null).filter((e) => e.getBoundingClientRect().height < 36).length,
    );
    expect(small).toBe(0);
  });
});
