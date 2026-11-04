// @vitest-environment node
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { messagingWorkerSource } from "../../../vite.config.js";
import { managerOperationalFcmMessages, managerOperationalNotificationTypes } from "../../../functions/src/managerOperationalNotifications.js";
import { checklistReviewFcmMessages } from "../../../functions/src/checklistReviewNotifications.js";

function workerFixture() {
  let backgroundMessage;
  const showNotification = vi.fn();
  const handlers = new Map();
  const openWindow = vi.fn();
  const unrelatedNavigate = vi.fn();
  vm.runInNewContext(messagingWorkerSource({ projectId: "demo-cleanflow" }), {
    URL,
    self: {
      addEventListener: (type, handler) => handlers.set(type, handler),
      registration: { showNotification },
      location: { origin: "https://app.test" },
      clients: {
        matchAll: async () => [
          { url: "https://app.test.evil/", navigate: unrelatedNavigate },
          { url: "https://app.test/agenda", navigate: unrelatedNavigate },
          { url: "https://app.test/offer/private", navigate: unrelatedNavigate },
        ],
        openWindow,
      },
    },
    importScripts: vi.fn(),
    firebase: { initializeApp: vi.fn(), messaging: () => ({
      onBackgroundMessage: handler => { backgroundMessage = handler; },
    }) },
  });
  const click = (link) => new Promise((resolve) => handlers.get("notificationclick")({
    notification: { close: vi.fn(), data: { link } }, stopImmediatePropagation: vi.fn(), waitUntil: resolve,
  }));
  return { showNotification, openWindow, unrelatedNavigate, click, receive: payload => backgroundMessage(payload) };
}

describe("FCM worker display compatibility", () => {
  it("displays each actual operational-event payload once with its stable event tag and manager link", () => {
    const fixture = workerFixture();
    const devices = [{ data: () => ({ language: "en", token: "synthetic-token" }) }];
    const messages = [
      ...managerOperationalFcmMessages(devices, "interest-event", managerOperationalNotificationTypes.interest,
        { cleanerName: "Synthetic cleaner", propertyName: "Synthetic property" }),
      ...managerOperationalFcmMessages(devices, "confirmation-event", managerOperationalNotificationTypes.acknowledgment,
        { cleanerName: "Synthetic cleaner", propertyName: "Synthetic property" }),
      ...checklistReviewFcmMessages(devices, "review-event"),
    ];
    for (const message of messages) {
      fixture.receive({ data: message.data });
      expect(fixture.showNotification).toHaveBeenLastCalledWith(message.data.title,
        expect.objectContaining({ body: message.data.body, tag: message.data.eventId, data: { link: "/" } }));
    }
    expect(fixture.showNotification).toHaveBeenCalledTimes(3);
  });
  it("does not double-display notification payloads already shown by the SDK", () => {
    const fixture = workerFixture();
    fixture.receive({ notification: { title: "CleanFlow Test" }, data: { eventType: "CURRENT_DEVICE_TEST" } });
    expect(fixture.showNotification).not.toHaveBeenCalled();
  });

  it("ignores provider deep links and does not hijack Hub or public-link tabs", async () => {
    const fixture = workerFixture();
    fixture.receive({ data: { title: "Safe update", body: "Safe text", link: "//app.test.evil" } });
    expect(fixture.showNotification).toHaveBeenCalledWith("Safe update", expect.objectContaining({ data: { link: "/" } }));
    await fixture.click("//app.test.evil");
    expect(fixture.unrelatedNavigate).not.toHaveBeenCalled();
    expect(fixture.openWindow).toHaveBeenCalledExactlyOnceWith("https://app.test/");
  });

  it("never renders a cleaner-scope payload in the manager worker", () => {
    const fixture = workerFixture();
    fixture.receive({ data: { cleanerBindingId: "a".repeat(32), eventId: "event" } });
    expect(fixture.showNotification).not.toHaveBeenCalled();
  });

  it("preserves the normal data-only operational display unchanged", () => {
    const fixture = workerFixture();
    fixture.receive({ data: { title: "Operational reminder", body: "Safe summary", eventId: "fixture-window", link: "/" } });
    expect(fixture.showNotification).toHaveBeenCalledExactlyOnceWith("Operational reminder", {
      body: "Safe summary", icon: "/icon-192.png", badge: "/icon-192.png",
      tag: "fixture-window", data: { link: "/" },
    });
  });
});
