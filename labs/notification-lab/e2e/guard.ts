import type { Page } from "@playwright/test";

/** Instruments the page so any use of real notification / push / network APIs is recorded. */
export async function installGuard(page: Page): Promise<{ external: string[] }> {
  const external: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    const local = url.protocol === "data:" || url.protocol === "blob:" || url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!local) external.push(req.url());
  });
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __labGuard: string[] }).__labGuard = calls;
    const N = (window as unknown as { Notification?: { requestPermission?: unknown } }).Notification;
    if (N) {
      const Original = N as unknown as new (...a: unknown[]) => unknown;
      const Wrapped = function (this: unknown, ...args: unknown[]) {
        calls.push("new Notification");
        return new Original(...args);
      } as unknown as { requestPermission: () => Promise<string> };
      Wrapped.requestPermission = () => {
        calls.push("Notification.requestPermission");
        return Promise.resolve("denied");
      };
      Object.defineProperty(window, "Notification", { value: Wrapped, configurable: true });
    }
    if (navigator.serviceWorker) {
      const reg = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = (...args: Parameters<typeof reg>) => {
        calls.push("serviceWorker.register");
        return reg(...args);
      };
    }
    const PM = (window as unknown as { PushManager?: { prototype: { subscribe: (...a: unknown[]) => unknown } } }).PushManager;
    if (PM) {
      const sub = PM.prototype.subscribe;
      PM.prototype.subscribe = function (...args: unknown[]) {
        calls.push("PushManager.subscribe");
        return sub.apply(this, args);
      };
    }
  });
  return { external };
}

export async function guardCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __labGuard: string[] }).__labGuard ?? []);
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1600) < 1100;

/** On narrow screens, sections live behind tabs. */
export async function openTab(page: Page, tab: "scenarios" | "phones" | "trail" | "evidence") {
  if (isMobile(page)) await page.click(`[data-mtab-btn="${tab}"]`);
}

export async function selectScenario(page: Page, id: string) {
  await openTab(page, "scenarios");
  await page.click(`.cat-item[data-scenario="${id}"]`);
  await openTab(page, "phones");
}

export async function showMoreControls(page: Page) {
  if (isMobile(page) && (await page.locator("[data-control=more]").getAttribute("aria-expanded")) !== "true") await page.click("[data-control=more]");
}

export async function runInstant(page: Page) {
  await showMoreControls(page);
  await page.selectOption("[data-control=speed]", "instant");
  await page.click("[data-control=run]");
  if (isMobile(page)) await page.click("[data-control=more]"); // collapse again
  await page.waitForSelector('[data-testid="run-status"]', { state: "attached" });
}
