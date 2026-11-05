// @vitest-environment node
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { cleanerMessagingWorkerSource } from "../../../vite.config.js";
import { cleanerMessagingConfig, cleanerPushDisplay, isCleanerVapidKey } from "./cleanerPushBinding.js";

const base = { projectId: "demo-cleanflow", messagingSenderId: "1234", appId: "1:1234:web:manager" };
const cleanerAppId = "1:1234:web:cleaner";
const bindingId = "11111111111111111111111111111111";

function storageFixture(initial) {
  let current = initial;
  const db = {
    close() {},
    transaction() {
      const request = {};
      const tx = {
        objectStore: () => ({
          get: () => request,
          put: (value) => { current = value; },
        }),
      };
      queueMicrotask(() => {
        request.result = current;
        request.onsuccess();
        tx.oncomplete();
      });
      return tx;
    },
  };
  return {
    set: (value) => { current = value; },
    open: () => {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
}

function workerFixture() {
  const indexedDB = storageFixture({ sessionId: "a", bindingId, language: "pt" });
  const handlers = new Map();
  const showNotification = vi.fn();
  const openWindow = vi.fn();
  const postMessage = vi.fn();
  const managerNavigate = vi.fn();
  const agendaNavigate = vi.fn(async () => {});
  const focus = vi.fn();

  vm.runInNewContext(cleanerMessagingWorkerSource(cleanerMessagingConfig(base, cleanerAppId)), {
    self: {
      addEventListener: (type, handler) => handlers.set(type, handler),
      registration: { showNotification, getNotifications: async () => [] },
      location: { origin: "https://example.test" },
      clients: {
        openWindow,
        matchAll: async () => [
          { url: "https://example.test/", navigate: managerNavigate },
          { url: "https://example.test.evil/agenda", navigate: managerNavigate },
          { url: "https://example.test/agenda", navigate: agendaNavigate, focus, postMessage },
        ],
      },
    },
    importScripts: vi.fn(),
    firebase: { initializeApp: vi.fn(), messaging: vi.fn() },
    indexedDB, URL,
  });
  const receive = (payload) => new Promise((resolve) => handlers.get("push")({
    data: { json: () => payload }, stopImmediatePropagation: vi.fn(), waitUntil: resolve,
  }));
  return { indexedDB, handlers, showNotification, openWindow, managerNavigate, agendaNavigate, focus, postMessage, receive };
}

describe("Isolated Cleaner Hub push worker", () => {
  it("accepts only canonical uncompressed public VAPID key encoding", () => {
    const publicPoint = Buffer.alloc(65);
    publicPoint[0] = 4;
    const fixtureKey = publicPoint.toString("base64url");
    expect(isCleanerVapidKey(fixtureKey)).toBe(true);
    expect(isCleanerVapidKey(fixtureKey + "=")).toBe(false);
    expect(isCleanerVapidKey(fixtureKey.slice(0, -1) + "B")).toBe(false);
    publicPoint[0] = 3;
    expect(isCleanerVapidKey(publicPoint.toString("base64url"))).toBe(false);
  });

  it("requires a separate app ID from the same Firebase sender", () => {
    expect(cleanerMessagingConfig(base, base.appId)).toBeNull();
    expect(cleanerMessagingConfig(base, "1:6543:web:cleaner")).toBeNull();
    expect(cleanerMessagingConfig(base, cleanerAppId)).toEqual({ ...base, appId: cleanerAppId });
    expect(cleanerMessagingWorkerSource(null)).not.toMatch(/importScripts|showNotification/);
  });

  it("uses neutral copy and no service destination even with injected provider details", async () => {
    const fixture = workerFixture();
    await fixture.receive({ data: { cleanerBindingId: bindingId, eventId: "evt-1", title: "Private job", body: "Private body", link: "//evil.test" } });
    expect(fixture.showNotification).toHaveBeenCalledExactlyOnceWith("CleanFlow", {
      body: "Abra o CleanFlow para ver seus avisos.", tag: "cleanflow-cleaner-evt-1",
      icon: "/icon-192.png", badge: "/icon-192.png", data: { cleanerBindingId: bindingId },
    });
    expect(fixture.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "cleanflow-cleaner-push-received" });
  });

  it("suppresses SDK notification payloads and drops data from an old account", async () => {
    const fixture = workerFixture();
    await fixture.receive({ notification: { title: "Private" }, data: { cleanerBindingId: bindingId } });
    fixture.indexedDB.set({ sessionId: "b", bindingId: "22222222222222222222222222222222" });
    await fixture.receive({ data: { cleanerBindingId: bindingId, eventId: "old" } });
    await fixture.receive({ data: { eventId: "manager" } });
    expect(fixture.showNotification).not.toHaveBeenCalled();
    expect(cleanerPushDisplay({ data: { cleanerBindingId: bindingId, eventId: "bad/id" } }, { bindingId })).toBeNull();
  });

  it("opens only the Hub Inbox for a current binding and ignores a stale notification tap", async () => {
    const fixture = workerFixture();
    const tap = () => new Promise((resolve) => fixture.handlers.get("notificationclick")({
      notification: { close: vi.fn(), data: { cleanerBindingId: bindingId, link: "//evil.test" } },
      stopImmediatePropagation: vi.fn(),
      waitUntil: resolve,
    }));
    await tap();
    expect(fixture.agendaNavigate).toHaveBeenCalledExactlyOnceWith("https://example.test/agenda?inbox=1");
    expect(fixture.focus).toHaveBeenCalledOnce();
    // iOS ignores navigate() on an open standalone app; the Hub switches on this message.
    expect(fixture.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "cleanflow-cleaner-open-inbox" });
    expect(fixture.managerNavigate).not.toHaveBeenCalled();
    expect(fixture.openWindow).not.toHaveBeenCalled();
    fixture.indexedDB.set({ blockedSessionId: "a" });
    await tap();
    expect(fixture.agendaNavigate).toHaveBeenCalledOnce();
    expect(fixture.postMessage).toHaveBeenCalledOnce();
  });
});
