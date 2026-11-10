import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { probeBrowser, probeHttp } from "./cleanflowPublicProbe.mjs";

const buildId = "a".repeat(40);
const deploymentId = `${buildId}-cleaner-push`;
const entryAsset = "/assets/main-fixture.js";
const cssAsset = "/assets/main-fixture.css";
const dashboardAsset = "assets/dashboardReads-TestHash.js";
const blockedRequests = ["/api/fixture", "/version.json?fixture=private"];

function entryHtml(manifest, preload = "") {
  return `<!doctype html><link rel="manifest" href="${manifest}">
    <script type="module" src="${entryAsset}"></script>
    <link rel="stylesheet" href="${cssAsset}">${preload}<main id="root"></main>`;
}

const renderedEntry = `
  const readDashboard = () => import("./dashboardReads-TestHash.js");
  const manager = '<input type="email"><input type="password"><button type="submit">Sign in</button>';
  const cleaner = '<input name="cleaner-access-code"><button type="submit" disabled>Sign in</button>';
  document.getElementById("root").innerHTML = '<form>' + (location.pathname === '/' ? manager : cleaner) + '</form>';
  fetch('${blockedRequests[0]}', { method: 'POST' }).catch(() => {});
  fetch('${blockedRequests[1]}').catch(() => {});
`;

async function withFixture(options, run) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method });
    function send(type, body, headers = {}) {
      response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", ...headers });
      response.end(body);
    }
    switch (request.url) {
      case "/":
        return send("text/html", entryHtml("/manifest.webmanifest", options.preload));
      case "/agenda":
        return send("text/html", entryHtml("/agenda.webmanifest"), {
          "Cache-Control": "no-store, private",
          "Referrer-Policy": "no-referrer",
        });
      case "/version.json":
        if (options.hangAfterHeaders) {
          response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          response.write("{");
          return;
        }
        return send("application/json", JSON.stringify({
          version: "v0.9.3", buildId, deploymentId, projectId: "clean-flow-prototipo", environment: "production",
        }));
      case "/manifest.webmanifest":
        return send("application/manifest+json", JSON.stringify({ start_url: "/", scope: "/" }));
      case "/agenda.webmanifest":
        return send("application/manifest+json", JSON.stringify({ start_url: "/agenda", scope: "/agenda" }));
      case "/sw.js":
        return send("text/javascript", `const buildId = "${options.workerBuild || deploymentId}";\n${options.workerCode || ""}`);
      case "/firebase-messaging-sw.js":
      case "/onesignal/OneSignalSDKWorker.js":
        return send("text/javascript", "self.fixture = true;");
      case "/cleaner-messaging-sw.js":
        return send("text/javascript", "self.fixture = true;", { "Service-Worker-Allowed": "/cleaner-messaging-push/" });
      case entryAsset:
        if (options.assetFallback) return send("text/html", entryHtml("/manifest.webmanifest"));
        return send("text/javascript", options.emptyApp ? "export {};" : renderedEntry);
      case cssAsset:
        return send("text/css", "input,button { display: inline-block; }");
      case "/" + dashboardAsset:
        if (options.dashboardFallback) return send("text/html", entryHtml("/manifest.webmanifest"));
        return send("text/javascript", "export default true;");
      default:
        response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    return await run(`http://127.0.0.1:${server.address().port}`, requests);
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

test("checks the deployed worker marker and deduplicates hashed entry assets across pages", async () => {
  await withFixture({}, async (origin, requests) => {
    const result = await probeHttp(origin, { expectedBuild: buildId });
    assert.equal(result.ok, true);
    assert.equal(result.buildId, buildId);
    assert.equal(result.deploymentId, deploymentId);
    assert.deepEqual(requests.filter(({ url }) => url === entryAsset), [{ url: entryAsset, method: "HEAD" }]);
  });
});

test("rejects an SPA fallback served with HTTP 200 in place of an entry JavaScript asset", async () => {
  await withFixture({ assetFallback: true }, async (origin) => {
    const result = await probeHttp(origin);
    const asset = result.rows.find(({ path }) => path === entryAsset);
    assert.equal(result.ok, false);
    assert.equal(asset.status, 200);
    assert.equal(asset.issue, "WRONG_CONTENT_TYPE");
  });
});

test("checks a pinned lazy Dashboard asset even though anonymous HTML does not reference it", async () => {
  await withFixture({ dashboardFallback: true }, async (origin, requests) => {
    assert.equal((await probeHttp(origin)).ok, true);
    assert.equal(requests.some(({ url }) => url === `/${dashboardAsset}`), false);
    const result = await probeHttp(origin, { dashboardAsset });
    assert.equal(result.ok, false);
    const chunk = result.rows.find(({ path }) => path === `/${dashboardAsset}`);
    assert.equal(chunk.method, "HEAD");
    assert.equal(chunk.status, 200);
    assert.equal(chunk.issue, "WRONG_CONTENT_TYPE");
  });
});

test("detects release skew between the version marker and root worker", async () => {
  await withFixture({ workerBuild: "b".repeat(40) }, async (origin) => {
    const result = await probeHttp(origin);
    assert.equal(result.ok, false);
    assert.equal(result.rows.find(({ path }) => path === "/sw.js").issue, "WORKER_VERSION_MISMATCH");
  });
});

test("detects a return to root worker fetch interception", async () => {
  await withFixture({ workerCode: 'self.addEventListener("fetch", handler);' }, async (origin) => {
    const result = await probeHttp(origin);
    assert.equal(result.ok, false);
    assert.equal(result.rows.find(({ path }) => path === "/sw.js").issue, "ROOT_WORKER_INTERCEPTS_FETCH");
  });
});

test("bounds a version request whose server sent HTTP 200 headers and stopped sending data", async () => {
  await withFixture({ hangAfterHeaders: true }, async (origin) => {
    const result = await probeHttp(origin, { timeoutMs: 500 });
    const version = result.rows.find(({ path }) => path === "/version.json");
    assert.equal(result.ok, false);
    assert.equal(version.status, 200);
    assert.equal(version.issue, "TIMEOUT");
  });
});

test("rejects a query-bearing asset reference without requesting or recording the URL", async () => {
  await withFixture({ preload: '<link rel="modulepreload" href="/assets/other.js?token=fixture">' }, async (origin, requests) => {
    const result = await probeHttp(origin);
    assert.equal(result.rows.find(({ path }) => path === "/").issue, "UNEXPECTED_ASSET_REFERENCE");
    assert.equal(requests.some(({ url }) => url.includes("token=")), false);
    assert.equal(JSON.stringify(result).includes("token="), false);
  });
});

const browser = process.env.CLEANFLOW_PROBE_TEST_BROWSER;
test("renders anonymous screens while blocking writes and query-bearing requests", { skip: !browser }, async () => {
  await withFixture({}, async (origin, requests) => {
    const result = await probeBrowser(origin, browser, { timeoutMs: 4000 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.rows.map(({ path, screenReady }) => [path, screenReady]), [["/", true], ["/agenda", true]]);
    assert.equal(requests.some(({ url }) => blockedRequests.includes(url)), false);
    assert.equal(requests.some(({ url }) => url === `/${dashboardAsset}`), false);
  });
});

test("fails the browser check for a blank app even when every HTTP check passes", { skip: !browser }, async () => {
  await withFixture({ emptyApp: true }, async (origin) => {
    assert.equal((await probeHttp(origin)).ok, true);
    const result = await probeBrowser(origin, browser, { timeoutMs: 2500 });
    assert.equal(result.ok, false);
    assert.deepEqual(result.rows.map(({ status, issue }) => [status, issue]), [
      [200, "ENTRY_FORM_UNAVAILABLE"], [200, "ENTRY_FORM_UNAVAILABLE"],
    ]);
  });
});
