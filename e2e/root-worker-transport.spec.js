import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("root worker without fetch interception preserves navigation and a 5 MiB Blob PUT", async ({ page }) => {
  // Exercise the actual pure worker generator without requiring a prior build
  // or exporting test-only production APIs.
  const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  const generator = config.slice(config.indexOf("function rootWorkerSource("), config.indexOf("function cleanflowServiceWorkers("));
  const worker = new Function(`${generator}; return rootWorkerSource;`)()("synthetic-transport-build");
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
        navigator.serviceWorker.controller?.postMessage({type:'CLEANFLOW_UPDATE_CLIENT_READY'});
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
    servedWorker = worker;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    await expect.poll(() => page.evaluate(() => window.syntheticWorkerBuild)).toBe("synthetic-transport-build");
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
