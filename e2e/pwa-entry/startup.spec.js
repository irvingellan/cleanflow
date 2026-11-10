import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const moduleAsset = /\/assets\/main-[\w-]+\.js$/;
const stylesheetAsset = /\/assets\/main-[\w-]+\.css$/;
const retryButton = (page) => page.locator("[data-startup-retry]");
const login = (page) => page.locator('input[name="email"]');
const trace = (page) => page.evaluate(() => JSON.parse(
  sessionStorage.getItem("cleanflow.startup.diagnostics") || "[]",
).map(({ stage }) => stage));

test.beforeEach(async ({ context, baseURL }) => {
  await context.route("**/*", (route) => new URL(route.request().url()).origin === baseURL
    ? route.continue() : route.abort("blockedbyclient"));
});

test("renders the public manager entry after a slow JavaScript response without restarting", async ({ page }) => {
  await page.route(moduleAsset, async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({ response });
  });
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator("[data-startup-pending]")).toBeVisible();
  await expect(login(page)).toBeVisible();
  await expect(page.locator("#cleanflow-startup")).toBeHidden();
  expect(await trace(page)).toContain("react_mounted");
  expect(await trace(page)).not.toContain("online_recovery");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test("reports HTTP 200 HTML returned instead of the entry module", async ({ page }) => {
  await page.route(moduleAsset, (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><title>Wrong asset</title>",
  }));
  await page.goto("/agenda");
  await expect(retryButton(page)).toBeVisible();
  await expect(page.locator("[data-startup-alert]")).toBeVisible();
  await expect(page.locator("[data-startup-pending]")).toBeHidden();
  expect(await trace(page)).toContain("script_error");
  expect(await trace(page)).not.toContain("react_mounted");
});

test("a stalled stylesheet leaves the HTML fallback visible and opens when the stylesheet arrives", async ({ page, browserName }) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let stylesheetRequests = 0;
  await page.route(stylesheetAsset, async (route) => {
    stylesheetRequests += 1;
    await held;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("[data-startup-pending]")).toBeVisible();
    await expect.poll(() => trace(page)).toContain("react_mounted");
    await expect(login(page)).toBeHidden();
    if (browserName === "chromium") {
      await expect.poll(() => page.evaluate(() => performance.getEntriesByName("first-contentful-paint").length))
        .toBeGreaterThan(0);
    }
    await page.clock.setSystemTime(Date.now() + 16_000);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(page.locator("[data-startup-alert]")).toBeVisible();
    expect(await trace(page)).toContain("stylesheet_timeout");
    await expect(login(page)).toBeHidden();
    release();
    await expect(login(page)).toBeVisible();
    await expect(page.locator("#cleanflow-startup")).toBeHidden();
    await expect(page.locator("[data-startup-stylesheet]")).toHaveAttribute("media", "all");
    expect(stylesheetRequests).toBe(1);
    expect(await trace(page)).toEqual(expect.arrayContaining(["stylesheet_ready", "entry_ready"]));
  } finally {
    release();
  }
});

test("a transient stylesheet 503 triggers one checked retry", async ({ page }) => {
  let gets = 0;
  let heads = 0;
  await page.route(stylesheetAsset, (route) => {
    if (route.request().method() === "HEAD") {
      heads += 1;
      return route.continue();
    }
    gets += 1;
    return gets === 1 ? route.fulfill({ status: 503, body: "synthetic outage" }) : route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  await expect(login(page)).toBeVisible();
  expect(gets).toBe(2);
  expect(heads).toBe(1);
  expect((await trace(page)).filter((stage) => stage === "asset_recovery")).toHaveLength(1);
});

test("reports a head asset failure as soon as a delayed HTML fallback is parsed", async ({ page, baseURL }) => {
  let releaseParser;
  let releaseModule;
  const parserHeld = new Promise((resolve) => { releaseParser = resolve; });
  const moduleHeld = new Promise((resolve) => { releaseModule = resolve; });
  await page.route(`${baseURL}/`, async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: html.replace("</head>", '<script src="/held-parser.js"></script></head>') });
  });
  await page.route("**/held-parser.js", async (route) => {
    await parserHeld;
    await route.fulfill({ contentType: "application/javascript", body: "" });
  });
  await page.route(stylesheetAsset, (route) => route.fulfill({ status: 503, body: "synthetic outage" }));
  await page.route(moduleAsset, async (route) => {
    await moduleHeld;
    await route.abort().catch(() => undefined);
  });
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect.poll(() => trace(page)).toContain("stylesheet_error");
    await expect(page.locator("#cleanflow-startup")).toHaveCount(0);
    releaseParser();
    await expect(page.locator("[data-startup-alert]")).toBeVisible();
    expect(await trace(page)).not.toContain("react_mounted");
  } finally {
    releaseParser();
    releaseModule();
  }
});

test("a failed module checks the deployed version and reopens stale HTML once", async ({ page }) => {
  let calls = 0;
  await page.route("**/version.json", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ buildId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
  }));
  await page.route(moduleAsset, (route) => {
    calls += 1;
    return calls === 1 ? route.abort() : route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  await expect(login(page)).toBeVisible();
  expect(calls).toBe(2);
  expect((await trace(page)).filter((stage) => stage === "version_recovery")).toHaveLength(1);
});

for (const recovered of [true, false]) {
  test(`an online entry 503 gets one checked retry (${recovered ? "transient" : "persistent"})`, async ({ page }) => {
    let gets = 0;
    let heads = 0;
    await page.route(moduleAsset, (route) => {
      if (route.request().method() === "HEAD") {
        heads += 1;
        return route.continue();
      }
      gets += 1;
      if (recovered && gets > 1) return route.continue();
      return route.fulfill({ status: 503, headers: { "Cache-Control": "no-store" }, body: "synthetic outage" });
    });
    await page.goto("/", { waitUntil: "commit" });
    await expect.poll(() => gets).toBe(2);
    if (recovered) await expect(login(page)).toBeVisible();
    else await expect(retryButton(page)).toBeVisible();
    expect(heads).toBeGreaterThanOrEqual(1);
    expect((await trace(page)).filter((stage) => stage === "asset_recovery")).toHaveLength(1);
  });
}

test("a pending entry request expires on return after simulated suspension", async ({ page }) => {
  let release;
  const stalled = new Promise((resolve) => { release = resolve; });
  await page.route(moduleAsset, async (route) => {
    await stalled;
    await route.abort().catch(() => undefined);
  });
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("[data-startup-pending]")).toBeVisible();
    // Move wall time past the deadline without waiting for a background timer.
    await page.clock.setSystemTime(Date.now() + 16_000);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(retryButton(page)).toBeVisible();
    expect(await trace(page)).toContain("entry_timeout");
    expect(await trace(page)).not.toContain("react_mounted");
  } finally {
    release();
  }
});

test("an interrupted module reloads once when the network really comes back", async ({ page, context }) => {
  let calls = 0;
  await page.route(moduleAsset, async (route) => {
    calls += 1;
    if (calls > 1) return route.continue();
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    return route.abort("internetdisconnected");
  });
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect(retryButton(page)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
  // Chromium/WebKit may not deliver the online event for driver emulation;
  // dispatch it too, using the normal online browser state.
  await page.evaluate(() => window.dispatchEvent(new Event("online"))).catch(() => undefined);
  await expect(login(page)).toBeVisible();
  expect(calls).toBe(2);
  const stages = await trace(page);
  expect(stages.filter((stage) => stage === "online_recovery")).toHaveLength(1);
  expect(stages).not.toContain("manual_reload");
});

test("denied language preference storage cannot prevent the manager entry from opening", async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key, ...args) {
        if (key === "cleanflow-language") throw new DOMException("Synthetic denial", "SecurityError");
        return original.call(this, key, ...args);
      };
    }
  });
  await page.goto("/");
  await expect(login(page)).toBeVisible();
  await expect(page.locator("#cleanflow-startup")).toBeHidden();
  expect(await trace(page)).toContain("react_mounted");
});
