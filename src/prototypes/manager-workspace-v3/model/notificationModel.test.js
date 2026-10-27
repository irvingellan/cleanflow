import { describe, expect, it } from "vitest";
import { buildDemoState } from "./demoData.js";
import { CATEGORIES, categoryOf, deliverySteps, filterNotifications } from "./notificationModel.js";
import { domainReducer } from "./store.js";

const data = buildDemoState("2026-10-20");

describe("notification center model", () => {
  it("marks the three production pushes as implemented and the rest as proposals", () => {
    expect(CATEGORIES.filter(c => c.status === "implemented").map(c => c.id).sort()).toEqual(["assignmentConfirmed", "checklistReceived", "cleanerInterested"]);
  });

  it("every synthetic notification has a known category", () => {
    data.notifications.forEach(n => expect(categoryOf(n).id).toBe(n.category));
  });

  it("sorts newest first and filters by group, unread and text", () => {
    const all = filterNotifications(data.notifications);
    for (let i = 1; i < all.length; i++) {
      const [a, b] = [all[i - 1].at, all[i].at];
      expect(a.date > b.date || (a.date === b.date && a.min >= b.min)).toBe(true);
    }
    expect(filterNotifications(data.notifications, { filter: "checklists" }).every(n => n.category === "checklistReceived")).toBe(true);
    expect(filterNotifications(data.notifications, { filter: "unread" }).every(n => !n.read)).toBe(true);
    expect(filterNotifications(data.notifications, { query: "juniper", text: n => n.params.property || "" })).toHaveLength(1);
  });

  it("never reports displayed/opened without confirmation", () => {
    const steps = deliverySteps({ at: { date: "x", min: 1 }, delivery: { targets: 2, accepted: true, displayed: "unknown", openedAt: null, openTracked: false } });
    expect(steps.map(s => s.state)).toEqual(["done", "done", "done", "unknown", "notTracked"]);
    expect(deliverySteps({ at: {}, delivery: { targets: 0, accepted: false, displayed: "generic" } }).map(s => s.state)).toEqual(["done", "failed", "failed", "failed", "unknown"]);
  });

  it("opening from a push records the open but keeps it unread", () => {
    const pushed = domainReducer(data, { type: "NOTIF_PUSH_SIM", id: "p1", sample: { category: "cleanerInterested", jobId: "j17", titleKey: "n.offerInterest", params: { name: "Lucia" } } });
    const opened = domainReducer(pushed, { type: "NOTIF_OPENED", id: "p1" });
    const n = opened.notifications.find(x => x.id === "p1");
    expect(n.read).toBe(false);
    expect(n.tappedBeforeRead).toBe(true);
    expect(n.delivery.openedAt).toBeTruthy();
    expect(n.params.property).toBe("Willow Row 12");
  });

  it("preferences and permission are explicit actions", () => {
    const off = domainReducer(data, { type: "NOTIF_PREF", category: "missingCleaner", value: false });
    expect(off.notificationSettings.prefs.missingCleaner).toBe(false);
    expect(domainReducer(data, { type: "NOTIF_PERMISSION", permission: "denied" }).notificationSettings.permission).toBe("denied");
  });
});
