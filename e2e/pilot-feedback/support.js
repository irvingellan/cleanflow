import { expect, test as base } from "@playwright/test";

// Fail closed across every browser check and screenshot, including new cases.
export const test = base.extend({
  providerBoundary: [async ({ page }, use) => {
    const external = [];
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["127.0.0.1", "localhost"].includes(url.hostname) || ["data:", "blob:"].includes(url.protocol)) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await use();
    expect(external, "Synthetic harness must not request external services").toEqual([]);
    expect(await providerCalls(page), "Synthetic harness must not call Firebase").toEqual([]);
  }, { auto: true }],
});
export { expect };

export const isMobile = (testInfo) => testInfo.project.name.startsWith("mobile");

/** Records every non-local request; the harness must make none. */
export function watchNetwork(page) {
  const external = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname) && !["data:", "blob:"].includes(url.protocol)) external.push(request.url());
  });
  return external;
}

export async function providerCalls(page) {
  return page.evaluate(() => globalThis.__providerCalls || []);
}

export async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
