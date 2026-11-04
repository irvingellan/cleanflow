import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { cleanerPushBinding } from "../../src/features/notifications/cleanerPushBinding.js";
import { cleanerMessagingWorkerSource } from "../../vite.config.js";

const workerPath = "/cleaner-messaging-sw.js";
const workerScope = "/cleaner-messaging-push/";
const worker = cleanerMessagingWorkerSource({ projectId: "demo-cleanflow" })
  .replaceAll(/https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+/g, "/synthetic-firebase.js");
const captureDisplays = `
self.registration.showNotification = async (title, options) => {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((client) => client.postMessage({ type: "TEST_DISPLAY_REQUEST", title, options }));
};
self.registration.getNotifications = async () => [];
`;

test("real Chromium worker and IndexedDB ignore stale pushes after logout, account replacement and rotation", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === workerPath) {
      response.writeHead(200, { "Content-Type": "application/javascript" });
      return response.end(captureDisplays + worker);
    }
    if (request.url === "/synthetic-firebase.js") {
      response.writeHead(200, { "Content-Type": "application/javascript" });
      return response.end("self.firebase = { initializeApp() {}, messaging() {} };");
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<!doctype html><meta charset=utf-8><title>Synthetic Hub</title>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(`${origin}/agenda`);
  const workerStarted = context.waitForEvent("serviceworker");
  await page.evaluate(async ({ workerPath, workerScope }) => {
    window.fixtureMessages = [];
    navigator.serviceWorker.addEventListener("message", (event) => window.fixtureMessages.push(event.data));
    await navigator.serviceWorker.register(workerPath, { scope: workerScope });
  }, { workerPath, workerScope });
  const actualWorker = await workerStarted;
  await page.waitForFunction(async (scope) => (await navigator.serviceWorker.getRegistration(scope))?.active?.state === "activated", workerScope);

  const mutate = (...args) => page.evaluate(({ source, args }) => (0, eval)(`(${source})`)(...args), {
    source: cleanerPushBinding.toString(), args,
  });
  const dispatch = (binding, id) => actualWorker.evaluate(({ binding, id }) => {
    const event = new PushEvent("push", { data: JSON.stringify({ data: {
      cleanerBindingId: binding, eventId: id.repeat(64), title: "private service", body: "private data", link: "//untrusted.example",
    } }) });
    let complete;
    // Synthetic events cannot extend SW lifetime through native waitUntil.
    // The real listener runs in Chromium and awaits real shared IndexedDB.
    event.waitUntil = (promise) => { complete = promise; };
    self.dispatchEvent(event);
    return complete;
  }, { binding, id });
  const displayed = () => page.evaluate(() => window.fixtureMessages.filter(({ type }) => type === "TEST_DISPLAY_REQUEST"));
  const waitForDisplays = (count) => page.waitForFunction((expected) =>
    window.fixtureMessages.filter(({ type }) => type === "TEST_DISPLAY_REQUEST").length >= expected, count);

  const bindingA = "a".repeat(32);
  const bindingB = "b".repeat(32);
  const rotated = "c".repeat(32);
  await mutate("claim", "session-a");
  await mutate("set", "session-a", bindingA, "pt", 1);
  await dispatch(bindingA, "1");
  await waitForDisplays(1);
  await mutate("clear", "session-a");
  await dispatch(bindingA, "2");
  await mutate("claim", "session-b");
  await mutate("set", "session-b", bindingB, "en", 1);
  await dispatch(bindingA, "3");
  await dispatch(bindingB, "4");
  await waitForDisplays(2);
  await mutate("set", "session-b", rotated, "en", 2);
  assert.equal(await mutate("set", "session-b", bindingB, "en", 1), null);
  await dispatch(bindingB, "5");
  await dispatch(rotated, "6");
  await waitForDisplays(3);

  const captures = await displayed();
  assert.deepEqual(captures.map((capture) => capture.options.tag), ["1", "4", "6"].map((id) => `cleanflow-cleaner-${id.repeat(64)}`));
  assert.equal(captures[0].options.body, "Abra o CleanFlow para ver seus avisos.");
  assert.equal(captures[1].options.body, "Open CleanFlow to see your notifications.");
  assert.doesNotMatch(JSON.stringify(captures), /private service|private data|untrusted\.example/);
});
