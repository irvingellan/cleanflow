// @vitest-environment node
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { cleanerMessagingWorkerSource } from "../../../vite.config.js";
import { cleanerMessagingConfig, cleanerMessagingWorkerScope, cleanerPushBinding, cleanerPushDisplay, cleanerPushReceipts, isCleanerVapidKey } from "./cleanerPushBinding.js";

const base = { projectId: "demo-cleanflow", messagingSenderId: "1234", appId: "1:1234:web:manager" };
const cleanerAppId = "1:1234:web:cleaner";
const bindingId = "11111111111111111111111111111111";

function storageFixture(initial) {
  let current = initial;
  const receipts = new Map();
  let sequence = 0;
  const db = {
    close() {},
    transaction() {
      const operations = [];
      const request = (read) => {
        const pending = {};
        operations.push(() => {
          pending.result = read();
          pending.onsuccess?.();
        });
        return pending;
      };
      const tx = {
        objectStore: (name) => name === "installation" ? {
          get: () => request(() => current),
          put: (value) => { current = value; },
        } : {
          add: (value) => { receipts.set(++sequence, value); },
          getAllKeys: (_, limit) => request(() => [...receipts.keys()].slice(0, limit ?? receipts.size)),
          getAll: (_, limit) => request(() => [...receipts.values()].slice(0, limit ?? receipts.size)),
          delete: (key) => receipts.delete(key),
          clear: () => receipts.clear(),
        },
      };
      queueMicrotask(() => {
        for (const operation of operations) operation();
        tx.oncomplete();
      });
      return tx;
    },
  };
  return {
    set: (value) => { current = value; },
    receipts,
    open: () => {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
}

function workerFixture(visibilityState = "visible", agendaPath = "/agenda") {
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
          { url: `https://example.test${agendaPath}`, visibilityState, navigate: agendaNavigate, focus, postMessage },
        ],
      },
    },
    console: { warn: vi.fn() }, indexedDB, URL, DOMException,
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

  it("runs without Firebase imports and keeps its registration inside the Agenda installation", () => {
    expect(cleanerMessagingWorkerSource(cleanerMessagingConfig(base, cleanerAppId))).not.toMatch(/importScripts|firebase\.messaging|gstatic/);
    expect(cleanerMessagingWorkerScope).toMatch(/^\/agenda\//);
  });

  it("keeps the last 30 private receipts and records display failures by name only", async () => {
    const fixture = workerFixture("hidden");
    for (let index = 0; index < 31; index += 1) {
      await fixture.receive({ data: { cleanerBindingId: bindingId, eventId: `event-${index}`, jobId: "private" } });
    }
    fixture.showNotification.mockRejectedValueOnce(new DOMException("private message", "NotAllowedError"));
    await fixture.receive({ data: { cleanerBindingId: bindingId, eventId: "failed", body: "private" } });
    fixture.showNotification.mockRejectedValueOnce(new TypeError("private"));
    await fixture.receive({ data: { cleanerBindingId: bindingId, eventId: "other-failure" } });
    await fixture.receive({ data: { cleanerBindingId: "stale", eventId: "suppressed" } });
    const records = [...fixture.indexedDB.receipts.values()];
    expect(records).toHaveLength(30);
    expect(records[0].eventId).toBe("event-4");
    expect(records.slice(-3)).toEqual([
      { eventId: "failed", receivedAtMs: expect.any(Number), clientVisible: false, outcome: "error", errorName: "NotAllowedError" },
      { eventId: "other-failure", receivedAtMs: expect.any(Number), clientVisible: false, outcome: "error", errorName: "Error" },
      { eventId: "suppressed", receivedAtMs: expect.any(Number), clientVisible: false, outcome: "suppressed", errorName: null },
    ]);
    expect(JSON.stringify(records)).not.toContain("private");
    vi.stubGlobal("indexedDB", fixture.indexedDB);
    try {
      expect(await cleanerPushReceipts("read", "a")).toHaveLength(20);
      expect(await cleanerPushReceipts("read", "b")).toEqual([]);
      await cleanerPushBinding("clear", "a");
      expect(fixture.indexedDB.receipts.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses neutral copy and no service destination even with injected provider details", async () => {
    const fixture = workerFixture("visible", "/agenda.html");
    await fixture.receive({ data: { cleanerBindingId: bindingId, eventId: "evt-1", title: "Private job", body: "Private body", link: "//evil.test" } });
    expect(fixture.showNotification).toHaveBeenCalledExactlyOnceWith("CleanFlow", {
      body: "Abra o CleanFlow para ver seus avisos.", tag: "cleanflow-cleaner-evt-1",
      icon: "/icon-192.png", badge: "/icon-192.png", data: { cleanerBindingId: bindingId },
    });
    expect(fixture.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "cleanflow-cleaner-push-received" });
    expect([...fixture.indexedDB.receipts.values()]).toEqual([expect.objectContaining({ clientVisible: true, outcome: "shown" })]);
  });

  it("displays the valid rescheduled date from structured fields and ignores provider message and links", async () => {
    const fixture = workerFixture();
    await fixture.receive({ data: {
      cleanerBindingId: bindingId, eventId: "schedule", rescheduleDate: "2026-11-19", rescheduleStart: "14:15",
      body: "private input", link: "//example.test",
    } });
    expect(fixture.showNotification).toHaveBeenCalledExactlyOnceWith("CleanFlow", expect.objectContaining({
      body: expect.stringMatching(/^A data mudou para .+ · 14:15\. Você pode\?$/),
      data: { cleanerBindingId: bindingId },
    }));
    await fixture.receive({ data: {
      cleanerBindingId: bindingId, eventId: "invalid", rescheduleDate: "2026-02-31", rescheduleStart: "14:15",
    } });
    expect(fixture.showNotification).toHaveBeenLastCalledWith("CleanFlow", expect.objectContaining({
      body: "Abra o CleanFlow para ver seus avisos.",
    }));
  });

  it("upgrades the current installation on Hub open without re-enrolling or adopting another session", async () => {
    const stored = { sessionId: "a", bindingId, registrationRevision: 3, language: "es" };
    vi.stubGlobal("indexedDB", storageFixture(stored));
    try {
      expect(await cleanerPushBinding("claim", "b")).toBeNull();
      expect(await cleanerPushBinding("read")).toEqual(stored);
      expect(await cleanerPushBinding("claim", "a")).toEqual({ ...stored, noticeVersion: 2 });
      expect(await cleanerPushBinding("read")).toEqual({ ...stored, noticeVersion: 2 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["en", "A service changed. Open My Schedule to confirm."],
    ["pt", "Um serviço mudou de horário. Abra Minha agenda para confirmar."],
    ["es", "Cambió el horario de un servicio. Abre Mi agenda para confirmar."],
  ])("uses only fixed schedule copy for a current %s Hub binding", async (language, body) => {
    const fixture = workerFixture();
    fixture.indexedDB.set({ sessionId: "a", bindingId, language, noticeVersion: 2 });
    await fixture.receive({ data: {
      cleanerBindingId: bindingId, eventId: "schedule", noticeType: "RESCHEDULED",
      rescheduleDate: "2027-01-01", rescheduleStart: "14:15", body: "ignored private input",
      link: "/unexpected", propertyName: "ignored", notes: "ignored", amount: "ignored",
    } });
    expect(fixture.showNotification).toHaveBeenCalledExactlyOnceWith("CleanFlow", expect.objectContaining({
      body, data: { cleanerBindingId: bindingId },
    }));
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
