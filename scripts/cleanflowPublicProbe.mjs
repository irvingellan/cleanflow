import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { hostingBundleAsset } from "./prepareHosting.mjs";

const projectId = "clean-flow-prototipo";
const hosts = ["web.app", "firebaseapp.com"];
const engines = ["chromium", "webkit"];
const fullSha = /^[a-f0-9]{40}$/;
const versionLabel = /^v?\d+\.\d+\.\d+(?:[-.][\w.-]+)?$/;
const deploymentLabel = /^[a-f0-9]{40}(?:-[a-z0-9-]{1,48})?$/;
const javascriptType = /^(?:application|text)\/(?:x-)?(?:java|ecma)script$/;
const assetType = {
  js: javascriptType,
  css: /^text\/css$/,
};
const browserAsset = /^\/assets\/[a-z0-9_-]{1,110}\.(?:js|css|woff2)$/i;
const routeChecks = [
  { path: "/", manifest: "/manifest.webmanifest", inputs: 'input[type="email"], input[type="password"]', inputCount: 2, submitEnabled: true },
  { path: "/agenda", manifest: "/agenda.webmanifest", inputs: 'input[name="cleaner-access-code"]', inputCount: 1, submitEnabled: false },
];
const workers = ["/sw.js", "/firebase-messaging-sw.js", "/cleaner-messaging-sw.js", "/onesignal/OneSignalSDKWorker.js"];
const otherPublicAssets = new Set([
  ...routeChecks.map((entry) => entry.manifest),
  "/favicon.svg", "/cleanflow-icon.svg", "/apple-touch-icon.png", "/agenda-apple-touch-icon.png",
  "/icon-192.png", "/icon-512.png", "/agenda-icon-192.png", "/agenda-icon-512.png",
]);
const contentType = (headers) => (headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
const hasCacheDirective = (headers, value) => (headers.get("cache-control") || "").split(",")
  .some((directive) => directive.trim().toLowerCase() === value);
const elapsed = (started) => Math.round(performance.now() - started);

// Only accept Vite-generated entry and preloaded chunk paths. Never follow URLs embedded in a page.
function readEntryHtml(html, manifest) {
  const assets = new Map();
  let correctManifest = false;
  let hasEntry = false;
  for (const match of html.matchAll(/<(script|link)\b([^>]+)>/gi)) {
    const [, tag, attributes] = match;
    const attrs = new Map(Array.from(attributes.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g), ([, key, , value]) => [key.toLowerCase(), value]));
    const entry = tag.toLowerCase() === "script" && attrs.get("type") === "module";
    const rel = attrs.get("rel");
    if (rel === "manifest") correctManifest ||= attrs.get("href") === manifest;
    if (!entry && rel !== "stylesheet" && rel !== "modulepreload") continue;

    const path = attrs.get(entry ? "src" : "href") || "";
    const extension = rel === "stylesheet" ? "css" : "js";
    if (!browserAsset.test(path) || !path.endsWith(`.${extension}`)) return { issue: "UNEXPECTED_ASSET_REFERENCE" };
    if (entry) {
      if (!hostingBundleAsset.test(path.slice(1))) return { issue: "UNEXPECTED_ENTRY_REFERENCE" };
      hasEntry = true;
    }
    assets.set(path, extension);
    if (assets.size > 24) return { issue: "TOO_MANY_ENTRY_ASSETS" };
  }
  if (!correctManifest || !hasEntry || ![...assets.values()].includes("css")) {
    return { issue: "ENTRY_MARKUP_INCOMPLETE" };
  }
  return { assets };
}

async function readSmallBody(response, signal) {
  const stream = response.body?.getReader();
  if (!stream) return "";
  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  try {
    while (!signal.aborted) {
      const { value, done } = await stream.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > 64 * 1024) return null;
      body += decoder.decode(value, { stream: true });
    }
    signal.throwIfAborted();
  } finally {
    // Cancellation should never keep a failed sample open.
    void stream.cancel().catch(() => {});
  }
}

export async function probeHttp(origin, { expectedBuild, timeoutMs = 10_000 } = {}) {
  const rows = [];
  async function check(path, validate, { head = false } = {}) {
    const row = { path, method: head ? "HEAD" : "GET" };
    rows.push(row);
    const start = performance.now();
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetch(origin + path, { method: row.method, redirect: "manual", signal });
      row.status = response.status;
      row.headersMs = elapsed(start);
      const cache = (response.headers.get("x-cache") || "").match(/\b(?:HIT|MISS|PASS)\b/g);
      if (cache?.length) row.cache = cache.slice(0, 4);
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        row.issue = response.status >= 300 && response.status < 400 ? "UNEXPECTED_REDIRECT" : "HTTP_STATUS";
        return {};
      }
      const body = head ? undefined : await readSmallBody(response, signal);
      if (!head && !body) {
        row.issue = body === null ? "BODY_TOO_LARGE" : "EMPTY_BODY";
        return {};
      }
      const { issue, ...data } = validate(response.headers, body);
      if (issue) row.issue = issue;
      return issue ? {} : data;
    } catch {
      row.issue = signal.aborted ? "TIMEOUT" : "NETWORK_OR_BODY_ERROR";
      return {};
    } finally {
      row.elapsedMs = elapsed(start);
    }
  }

  const versionPromise = check("/version.json", (headers, body) => {
    if (contentType(headers) !== "application/json") return { issue: "WRONG_CONTENT_TYPE" };
    if (!hasCacheDirective(headers, "no-store")) return { issue: "MISSING_NO_STORE" };
    let version;
    try { version = JSON.parse(body); } catch { return { issue: "INVALID_VERSION_JSON" }; }
    if (typeof version?.buildId !== "string" || !fullSha.test(version.buildId) ||
        typeof version.version !== "string" || version.version.length > 40 || !versionLabel.test(version.version) ||
        version.projectId !== projectId || version.environment !== "production" ||
        (version.deploymentId !== undefined &&
          (typeof version.deploymentId !== "string" || !deploymentLabel.test(version.deploymentId) ||
            !version.deploymentId.startsWith(version.buildId)))) {
      return { issue: "UNEXPECTED_VERSION_MARKER" };
    }
    if (expectedBuild && version.buildId !== expectedBuild) return { issue: "UNEXPECTED_BUILD" };
    return { buildId: version.buildId, deploymentId: version.deploymentId || version.buildId, version: version.version };
  });

  const pages = routeChecks.map(({ path, manifest }) => check(path, (headers, body) => {
    if (contentType(headers) !== "text/html") return { issue: "WRONG_CONTENT_TYPE" };
    if (!hasCacheDirective(headers, "no-store")) return { issue: "MISSING_NO_STORE" };
    if (path === "/agenda" && (headers.get("referrer-policy") !== "no-referrer" || !hasCacheDirective(headers, "private"))) {
      return { issue: "AGENDA_PRIVACY_HEADERS" };
    }
    return readEntryHtml(body, manifest);
  }));

  const manifests = routeChecks.map(({ path, manifest }) => check(manifest, (headers, body) => {
    if (!["application/manifest+json", "application/json"].includes(contentType(headers))) {
      return { issue: "WRONG_CONTENT_TYPE" };
    }
    try {
      const data = JSON.parse(body);
      return data?.start_url === path && data.scope === path ? {} : { issue: "UNEXPECTED_PWA_ENTRY" };
    } catch {
      return { issue: "INVALID_MANIFEST_JSON" };
    }
  }));

  const workerChecks = workers.map((path) => check(path, (headers, body) => {
    if (!javascriptType.test(contentType(headers))) return { issue: "WRONG_CONTENT_TYPE" };
    if (!hasCacheDirective(headers, "no-store")) return { issue: "MISSING_NO_STORE" };
    if (path === "/cleaner-messaging-sw.js" && headers.get("service-worker-allowed") !== "/cleaner-messaging-push/") {
      return { issue: "UNEXPECTED_WORKER_SCOPE" };
    }
    if (path !== "/sw.js") return {};
    if (/\baddEventListener\s*\(\s*["']fetch["']|\bonfetch\s*=/.test(body)) {
      return { issue: "ROOT_WORKER_INTERCEPTS_FETCH" };
    }
    const match = body.match(/^const buildId\s*=\s*"([a-z0-9-]+)";/m);
    return match ? { workerBuild: match[1] } : { issue: "MISSING_WORKER_BUILD" };
  }));

  const [version, entries, , [rootWorker]] = await Promise.all([
    versionPromise, Promise.all(pages), Promise.all(manifests), Promise.all(workerChecks),
  ]);
  if (version.deploymentId && rootWorker.workerBuild && version.deploymentId !== rootWorker.workerBuild) {
    rows.find(({ path }) => path === "/sw.js").issue = "WORKER_VERSION_MISMATCH";
  }

  const assets = new Map(entries.flatMap(({ assets }) => assets ? [...assets] : []));
  await Promise.all([...assets].map(([path, extension]) => check(path, (headers) => {
    if (!assetType[extension].test(contentType(headers))) return { issue: "WRONG_CONTENT_TYPE" };
    if (headers.get("content-length") === "0") return { issue: "EMPTY_BODY" };
    return {};
  }, { head: true })));
  return { ok: rows.every(({ issue }) => !issue), ...version, rows };
}

function allowedBrowserRequest(url, method, origin) {
  return method === "GET" && url.origin === origin && !url.search &&
    (browserAsset.test(url.pathname) || otherPublicAssets.has(url.pathname) ||
      url.pathname === "/version.json" || routeChecks.some(({ path }) => path === url.pathname));
}

export async function probeBrowser(origin, engine, { timeoutMs = 15_000, viewport = { width: 1280, height: 720 } } = {}) {
  let browser;
  try {
    const playwright = await import("@playwright/test");
    browser = await playwright[engine].launch({ timeout: timeoutMs });
  } catch {
    return { engine, ok: false, issue: "BROWSER_UNAVAILABLE", rows: [] };
  }

  try {
    const rows = await Promise.all(routeChecks.map(async ({ path, inputs, inputCount, submitEnabled }) => {
      const start = performance.now();
      const row = { path, screenReady: false, pageErrors: 0, failedCriticalRequests: 0 };
      let context;
      try {
        context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport });
        await context.routeWebSocket("**/*", (socket) => socket.close());
        await context.route("**/*", async (route) => {
          const request = route.request();
          if (!allowedBrowserRequest(new URL(request.url()), request.method(), origin)) return route.abort();
          try {
            // Limit the browser to the public allowlist, even when a static endpoint redirects.
            const response = await route.fetch({ maxRedirects: 0, timeout: timeoutMs });
            try {
              if (response.status() >= 300 && response.status() < 400) return await route.abort();
              return await route.fulfill({ response });
            } finally {
              await response.dispose();
            }
          } catch {
            await route.abort().catch(() => {});
          }
        });
        const page = await context.newPage();
        page.on("pageerror", () => { row.pageErrors += 1; });
        function critical(request) {
          return allowedBrowserRequest(new URL(request.url()), request.method(), origin) &&
            ["document", "script", "stylesheet"].includes(request.resourceType());
        }
        page.on("requestfailed", (request) => {
          if (critical(request)) row.failedCriticalRequests += 1;
        });
        page.on("response", (response) => {
          if (response.status() !== 200 && critical(response.request())) row.failedCriticalRequests += 1;
        });
        const navigation = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        row.navigationMs = elapsed(start);
        row.status = navigation?.status() || null;
        if (row.status !== 200) {
          row.issue = "NAVIGATION_STATUS";
          return row;
        }
        const form = page.locator("form", { has: page.locator(inputs) });
        const expectedInputs = form.locator(inputs);
        const submit = form.locator('button[type="submit"]');
        const remaining = () => Math.max(1, timeoutMs - elapsed(start));
        await form.waitFor({ state: "visible", timeout: remaining() });
        await submit.waitFor({ state: "visible", timeout: remaining() });
        row.screenReady = await expectedInputs.count() === inputCount &&
          (await Promise.all((await expectedInputs.all()).map((input) => input.isVisible()))).every(Boolean) &&
          await submit.isEnabled({ timeout: remaining() }) === submitEnabled;
        if (row.screenReady) row.readyMs = elapsed(start);
        if (row.pageErrors) row.issue = "PAGE_ERROR";
        else if (row.failedCriticalRequests) row.issue = "CRITICAL_RESOURCE_FAILED";
        else if (!row.screenReady) row.issue = "ENTRY_FORM_UNAVAILABLE";
      } catch (error) {
        if (row.pageErrors) row.issue = "PAGE_ERROR";
        else if (row.failedCriticalRequests) row.issue = "CRITICAL_RESOURCE_FAILED";
        else if (row.status === 200) row.issue = "ENTRY_FORM_UNAVAILABLE";
        else row.issue = error?.name === "TimeoutError" ? "NAVIGATION_TIMEOUT" : "BROWSER_NAVIGATION_ERROR";
      } finally {
        row.elapsedMs = elapsed(start);
        await context?.close();
      }
      return row;
    }));
    return { engine, ok: rows.every(({ issue }) => !issue), rows };
  } finally {
    await browser.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      host: { type: "string", default: "web.app" },
      browser: { type: "string" },
      "expected-build": { type: "string" },
    },
  });
  if (!hosts.includes(values.host) || (values.browser && !engines.includes(values.browser)) ||
      (values["expected-build"] && !fullSha.test(values["expected-build"]))) {
    throw new Error("Invalid probe arguments.");
  }
  const origin = `https://${projectId}.${values.host}`;
  const startedAt = new Date().toISOString();
  const [http, browser] = await Promise.all([
    probeHttp(origin, { expectedBuild: values["expected-build"] }),
    values.browser ? probeBrowser(origin, values.browser) : { skipped: true },
  ]);
  const ok = http.ok && (browser.skipped || browser.ok);
  console.log(JSON.stringify({ startedAt, origin, ok, http, browser }));
  process.exitCode = browser.issue === "BROWSER_UNAVAILABLE" ? 2 : ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.log(JSON.stringify({ ok: false, issue: "PROBE_CONFIGURATION_OR_RUNNER_ERROR" }));
    process.exitCode = 2;
  });
}
