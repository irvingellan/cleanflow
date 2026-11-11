import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

function generateRootWorker(config, build) {
  const generator = config.slice(config.indexOf("function rootWorkerSource("), config.indexOf("function cleanflowServiceWorkers("));
  return new Function(`${generator}; return rootWorkerSource;`)()(build);
}

test("root worker without fetch interception preserves navigation and a 5 MiB Blob PUT", async ({ page }) => {
  // Exercise the actual pure worker generator without requiring a prior build
  // or exporting test-only production APIs.
  const config = process.env.ROOT_WORKER_BASELINE === "1"
    ? execFileSync("git", ["show", "8bc70165c9bdf8a48ba54aa5c3ff5b3583c6a526:vite.config.js"], { encoding: "utf8" })
    : await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  const worker = generateRootWorker(config, "synthetic-transport-build");
  expect(worker).not.toMatch(/addEventListener\(["']fetch["']/);
  // Model the removed network-only handler, then update the same registration.
  let servedWorker = worker.replace("synthetic-transport-build", "synthetic-old-build")
    + '\nself.addEventListener("fetch", (event) => event.respondWith(fetch(event.request)));';
  let received;
  const server = createServer(async (request, response) => {
    if (request.url === "/sw.js") {
      response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      return response.end(servedWorker);
    }
    if (request.method === "PUT") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      received = Buffer.concat(chunks);
      response.writeHead(200, { "Content-Type": "application/json" });
      return response.end(JSON.stringify({ size: received.length, type: request.headers["content-type"] }));
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<title>Synthetic transport</title><script>
      navigator.serviceWorker.addEventListener('message', (event) => {
        window.syntheticWorkerBuild = event.data.buildId;
        window.syntheticWorkerState = event.source;
        event.source?.postMessage({type:'CLEANFLOW_UPDATE_CLIENT_READY'});
      });
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(origin + "/checklist");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      }
      navigator.serviceWorker.controller.postMessage({ type: "CLEANFLOW_UPDATE_CLIENT_READY" });
    });
    await expect.poll(() => page.evaluate(() => window.syntheticWorkerBuild)).toBe("synthetic-old-build");
    await expect.poll(() => page.evaluate(() => window.syntheticWorkerState?.state)).toBe("activated");
    servedWorker = worker;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      // Match PwaUpdatePrompt's existing explicit update protocol. WebKit may
      // leave the newly installed worker waiting while this page is controlled.
      const installing = registration.installing;
      if (installing && installing.state !== "installed" && installing.state !== "activated") {
        await new Promise((resolve) => installing.addEventListener("statechange", () => {
          if (["installed", "activated", "redundant"].includes(installing.state)) resolve();
        }));
      }
      registration.waiting?.postMessage({ type: "CLEANFLOW_SKIP_WAITING" });
    });
    try {
      await expect.poll(() => page.evaluate(() => window.syntheticWorkerBuild)).toBe("synthetic-transport-build");
    } catch (error) {
      const state = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { observedBuild: window.syntheticWorkerBuild, controller: navigator.serviceWorker.controller?.state,
          active: registration?.active?.state, waiting: registration?.waiting?.state,
          installing: registration?.installing?.state };
      });
      await test.info().attach('synthetic-worker-state', { body: JSON.stringify(state), contentType: 'application/json' });
      throw error;
    }
    const result = await page.evaluate(async () => {
      const file = new File([new Uint8Array(5 * 1024 * 1024).fill(0x5a)], "synthetic.png", { type: "image/png" });
      const body = new Blob([await file.arrayBuffer()], { type: file.type });
      return (await fetch("/api/public-checklist", { method: "PUT", headers: { "Content-Type": file.type }, body })).json();
    });
    expect(result).toEqual({ size: 5 * 1024 * 1024, type: "image/png" });
    expect(received.every((byte) => byte === 0x5a)).toBe(true);
    await page.goto(origin + "/checklist?synthetic-navigation=1");
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(page).toHaveTitle("Synthetic transport");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function expectWorkerUpdateToPreserveDocument(page, update, startup = "") {
  let worker = 'self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));';
  let documentRequests = 0;
  let documentAvailable = true;
  const server = createServer((request, response) => {
    if (request.url === "/sw.js") {
      response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      return response.end(worker);
    }
    if (request.url !== "/agenda?inbox=1") return response.writeHead(404).end();
    documentRequests += 1;
    if (!documentAvailable) return response.writeHead(503).end("Synthetic navigation outage");
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    response.end(`<!doctype html><title>Synthetic reopen</title>${startup}<label>Current work <input></label><script>
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "CLEANFLOW_UPDATE_AVAILABLE") {
          window.syntheticWorkerBuild = event.data.buildId;
          window.syntheticWorkerState = event.source;
        }
      });
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const entry = `http://127.0.0.1:${server.address().port}/agenda?inbox=1`;

  try {
    await page.goto(entry);
    await page.evaluate(() => navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(() => undefined));
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");
    await page.getByLabel("Current work").fill("Synthetic unsaved edit");
    worker = update;
    documentAvailable = false;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      registration.waiting?.postMessage({ type: "CLEANFLOW_SKIP_WAITING" });
    });
    await expect.poll(() => page.evaluate(() => window.syntheticWorkerBuild)).toBe("synthetic-reopen-build");
    await expect.poll(() => page.evaluate(() => window.syntheticWorkerState?.state)).toBe("activated");
    await expect(page.getByLabel("Current work")).toHaveValue("Synthetic unsaved edit");
    expect(documentRequests).toBe(1);
    expect(page.url()).toBe(entry);
    expect(await page.evaluate(() => caches.keys())).toEqual([]);

    documentAvailable = true;
    await page.reload();
    await expect(page.getByLabel("Current work")).toBeVisible();
    expect(documentRequests).toBe(2);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("activating the root worker preserves an unacknowledged document through a navigation outage", async ({ page }) => {
  const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  await expectWorkerUpdateToPreserveDocument(page, generateRootWorker(config, "synthetic-reopen-build"));
});

test("the entry HTML acknowledges the rollback worker even before React opens", async ({ page }) => {
  const startup = await readFile(new URL("../src/features/startup/startupShell.js", import.meta.url), "utf8");
  // The retained rollback worker honors this acknowledgement and navigates
  // clients that have not answered before its activation finishes.
  const rollbackWorker = `
    const acknowledged = new Set();
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("message", (event) => {
      if (event.data?.type === "CLEANFLOW_UPDATE_CLIENT_READY") acknowledged.add(event.source.id);
      if (event.data?.type === "CLEANFLOW_SKIP_WAITING") self.skipWaiting();
    });
    self.addEventListener("activate", (event) => {
      event.waitUntil((async () => {
        await self.clients.claim();
        const windows = await self.clients.matchAll({ type: "window" });
        for (const client of windows) {
          client.postMessage({ type: "CLEANFLOW_UPDATE_AVAILABLE", buildId: "synthetic-reopen-build" });
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await Promise.all(windows.filter((client) => !acknowledged.has(client.id))
          .map((client) => client.navigate(client.url)));
      })());
    });
  `;
  await expectWorkerUpdateToPreserveDocument(page, rollbackWorker, `<script>${startup}</script>`);
});
