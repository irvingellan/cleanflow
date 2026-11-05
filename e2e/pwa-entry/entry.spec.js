import { test, expect } from "@playwright/test";

const cleanerRoutes = ["/agenda", "/agenda/", "/agenda.html", "/agenda?inbox=1&eventId=synthetic-event", "/agenda/?inbox=1"];

async function localOnly(context, origin) {
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort("blockedbyclient"));
}

test.beforeEach(async ({ context, baseURL }) => localOnly(context, baseURL));

test("Hosting exposes the correct installation metadata before JavaScript runs", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, serviceWorkers: "block" });
  await localOnly(context, baseURL);
  const page = await context.newPage();
  try {
    for (const route of ["/", "/?source=legacy-home-screen", ...cleanerRoutes]) {
      const cleaner = route.startsWith("/agenda");
      const response = await page.goto(route);
      expect(response.status(), route).toBe(200);
      expect(response.request().redirectedFrom(), route).toBeNull();
      expect(response.headers()["content-type"]).toContain("text/html");
      expect(response.headers()["cache-control"], route).toContain("no-store");
      expect(page.url()).toBe(baseURL + route);
      await expect(page.locator("#root")).toBeEmpty();
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", cleaner ? "/agenda.webmanifest" : "/manifest.webmanifest");
      await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", cleaner ? "Minha agenda" : "CleanFlow");
      await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
      await expect(page).toHaveTitle(cleaner ? "Minha agenda · CleanFlow" : "CleanFlow");
      if (cleaner) {
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "/agenda");
        await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/agenda-apple-touch-icon.png");
        expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      }
    }
  } finally { await context.close(); }
});

test("manifests keep distinct start identities and independently available icons", async ({ request, baseURL }) => {
  const managerResponse = await request.get("/manifest.webmanifest");
  const cleanerResponse = await request.get("/agenda.webmanifest");
  for (const response of [managerResponse, cleanerResponse]) {
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/application\/(manifest\+json|json)/);
  }
  const manager = await managerResponse.json();
  const cleaner = await cleanerResponse.json();
  // Preserve the legacy manager identity: no new id or start URL migration.
  expect(manager.id).toBeUndefined();
  expect(manager.start_url).toBe("/");
  expect(manager.scope).toBe("/");
  expect(cleaner).toMatchObject({ id: "/agenda", start_url: "/agenda", scope: "/agenda", name: "Minha agenda", short_name: "Minha agenda", display: "standalone" });
  expect(new URL(manager.id ?? manager.start_url, baseURL).href).not.toBe(new URL(cleaner.id, baseURL).href);
  expect(new URL(cleaner.start_url, baseURL).href.startsWith(new URL(cleaner.scope, baseURL).href)).toBe(true);
  expect(new URL(manager.start_url, baseURL).href.startsWith(new URL(cleaner.scope, baseURL).href)).toBe(false);
  for (const manifest of [manager, cleaner]) {
    for (const icon of manifest.icons) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      const bytes = await response.body();
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  }
  const appleIcon = await request.get("/agenda-apple-touch-icon.png");
  expect(appleIcon.status()).toBe(200);
  const appleBytes = await appleIcon.body();
  expect([appleBytes.readUInt32BE(16), appleBytes.readUInt32BE(20)]).toEqual([180, 180]);
});

test("start URLs, Inbox links and reloads keep their role without changing legacy launches", async ({ page, context, request, baseURL, browserName }, testInfo) => {
  const manager = await (await request.get("/manifest.webmanifest")).json();
  const cleaner = await (await request.get("/agenda.webmanifest")).json();
  await page.goto(manager.start_url);
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator(".hb-root")).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await page.screenshot({ path: testInfo.outputPath("manager-start.png") });

  for (const route of cleanerRoutes) {
    await page.goto(route);
    await expect(page.locator(".hb-root")).toBeVisible();
    await expect(page.locator('input[name="email"]')).toHaveCount(0);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/agenda.webmanifest");
    expect(page.url()).toBe(baseURL + route);
    await page.reload();
    await expect(page.locator(".hb-root")).toBeVisible();
    expect(page.url()).toBe(baseURL + route);
  }

  const freshLaunch = await context.newPage();
  await freshLaunch.goto(cleaner.start_url);
  await expect(freshLaunch.locator(".hb-root")).toBeVisible();
  await expect(freshLaunch).toHaveTitle("Minha agenda · CleanFlow");
  await freshLaunch.screenshot({ path: testInfo.outputPath("cleaner-start.png") });
  if (browserName === "chromium") {
    const session = await context.newCDPSession(freshLaunch);
    const parsed = await session.send("Page.getAppManifest");
    expect(parsed.url).toBe(baseURL + "/agenda.webmanifest");
    expect(parsed.errors.filter((error) => error.critical)).toEqual([]);
    expect(JSON.parse(parsed.data)).toMatchObject({ id: "/agenda", start_url: "/agenda" });
    await session.detach();
  }
  await freshLaunch.close();
  // An existing manager installation still launching '/' must remain a manager entry.
  await page.goto(manager.start_url);
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page).toHaveTitle("CleanFlow");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
});

test("the network-only root worker coexists with both entry documents", async ({ page, baseURL }) => {
  for (const route of ["/", "/agenda?inbox=1", "/"]) {
    await page.goto(route);
    await expect.poll(() => page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.map((registration) => ({ scope: registration.scope, script: registration.active?.scriptURL })).sort((a, b) => a.scope.localeCompare(b.scope));
    })).toEqual([{ scope: baseURL + "/", script: baseURL + "/sw.js" }]);
    expect(await page.evaluate(() => caches.keys())).toEqual([]);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", route.startsWith("/agenda") ? "/agenda.webmanifest" : "/manifest.webmanifest");
  }
});
