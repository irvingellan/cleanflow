export const isMobile = (testInfo) => testInfo.project.name === "mobile";

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
