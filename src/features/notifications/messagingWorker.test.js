// @vitest-environment node
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { messagingWorkerSource } from "../../../vite.config.js";
import { managerOperationalFcmMessages, managerOperationalNotificationTypes } from "../../../functions/src/managerOperationalNotifications.js";
import { checklistReviewFcmMessages } from "../../../functions/src/checklistReviewNotifications.js";

function workerFixture() {
  let backgroundMessage;
  const showNotification = vi.fn();
  vm.runInNewContext(messagingWorkerSource({ projectId: "demo-cleanflow" }), {
    self: { addEventListener: vi.fn(), registration: { showNotification } },
    importScripts: vi.fn(),
    firebase: { initializeApp: vi.fn(), messaging: () => ({
      onBackgroundMessage: handler => { backgroundMessage = handler; },
    }) },
  });
  return { showNotification, receive: payload => backgroundMessage(payload) };
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

  it("preserves the normal data-only operational display unchanged", () => {
    const fixture = workerFixture();
    fixture.receive({ data: { title: "Operational reminder", body: "Safe summary", eventId: "fixture-window", link: "/" } });
    expect(fixture.showNotification).toHaveBeenCalledExactlyOnceWith("Operational reminder", {
      body: "Safe summary", icon: "/icon-192.png", badge: "/icon-192.png",
      tag: "fixture-window", data: { link: "/" },
    });
  });
});
