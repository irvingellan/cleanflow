import { describe, expect, it } from "vitest";
import { buildDemoState } from "../model/demoData.js";
import { domainReducer } from "../model/store.js";
import { unreadCount } from "../model/selectors.js";
import { deviceReadiness, emptyMessageKey, evidenceLines, inboxFor, scheduleFor } from "./hubModel.js";
import { awayItems } from "./AwayCenter.jsx";

const base = { platform: "ios", supported: true, displayMode: "standalone", permission: "granted", registration: "active", appVersion: "current", lastTest: null };
const state = ev => deviceReadiness({ ...base, ...ev }).state;

describe("device readiness is evidence-based", () => {
  it("iPhone in a Safari tab needs the Home Screen app, and says install elsewhere can't be seen", () => {
    const r = deviceReadiness({ ...base, displayMode: "browser" });
    expect(r.state).toBe("install");
    expect(r.reasons).toContain("cantSeeInstall");
    expect(evidenceLines({ ...base, displayMode: "browser" }).find(l => l.key === "installElsewhere").verified).toBe(false);
  });
  it("permission granted without registration is not ready", () => expect(state({ registration: "none" })).toBe("reconnect"));
  it("registered but never tested is unknown, not ready", () => expect(state({})).toBe("unknown"));
  it("provider accepted is not proof of display", () => expect(state({ lastTest: { result: "accepted" } })).toBe("unknown"));
  it("only a confirmed test is ready", () => expect(state({ lastTest: { result: "confirmed" } })).toBe("ready"));
  it("a stale registration (worked for days, then stopped) asks to reconnect", () => expect(state({ registration: "stale", lastTest: { result: "confirmed" } })).toBe("reconnect"));
  it("blocked, not asked, unsupported and outdated are distinct", () => {
    expect(deviceReadiness({ ...base, permission: "denied" }).action).toBe("unblock");
    expect(deviceReadiness({ ...base, permission: "default" }).action).toBe("allow");
    expect(state({ supported: false })).toBe("unsupported");
    expect(deviceReadiness({ ...base, appVersion: "outdated" }).action).toBe("update");
    expect(state({ checking: true })).toBe("checking");
  });
  it("Android in a browser tab can still be ready (no Home Screen requirement)", () => expect(state({ platform: "android", displayMode: "browser", lastTest: { result: "confirmed" } })).toBe("ready"));
});

describe("cleaner schedule", () => {
  const data = buildDemoState("2026-11-03");
  it("shows only her own assigned work, offers apart, completed separately", () => {
    const s = scheduleFor(data, "renata");
    const mine = [...s.today, ...s.upcoming, ...s.completed];
    expect(mine.length).toBeGreaterThanOrEqual(4);
    expect(mine.every(j => j.cleanerIds.includes("renata"))).toBe(true);
    expect(s.offers.every(j => !j.cleanerIds.includes("renata"))).toBe(true);
    expect(s.offers.length).toBe(1);
    expect(s.completed.every(j => j.status === "COMPLETED")).toBe(true);
  });
  it("a date change moves the job and records a change + an event for the cleaner only", () => {
    const job = scheduleFor(data, "renata").upcoming[0];
    const next = domainReducer(data, { type: "HUB_MOVE_JOB", jobId: job.id, date: "2026-11-09", start: "13:00" });
    expect(next.jobs.find(j => j.id === job.id).date).toBe("2026-11-09");
    expect(scheduleFor(next, "renata").changes[0]).toMatchObject({ kind: "moved", jobId: job.id });
    const ev = next.notifications.find(n => n.category === "cleanerMoved");
    expect(ev.audience).toEqual({ cleanerId: "renata" });
    expect(inboxFor(next.notifications, "manager").some(n => n.category === "cleanerMoved")).toBe(false);
  });
  it("a revoked assignment leaves her active schedule and the event names no one else", () => {
    const job = scheduleFor(data, "renata").upcoming.at(-1);
    const next = domainReducer(data, { type: "HUB_REVOKE", jobId: job.id, cleanerId: "renata" });
    const s = scheduleFor(next, "renata");
    expect([...s.today, ...s.upcoming].some(j => j.id === job.id)).toBe(false);
    const ev = next.notifications.find(n => n.category === "cleanerRemoved");
    expect(ev.jobId).toBeNull();
    expect(JSON.stringify(ev)).not.toMatch(/paula|marta|nora|lucia/i);
  });
  it("an empty list is definitive only when coverage is verified", () => {
    expect(emptyMessageKey("verified")).toBe("hb.empty.verified");
    for (const c of ["partial", "pending", "unknown"]) expect(emptyMessageKey(c)).toBe("hb.empty.notDefinitive");
  });
});

describe("role-specific inbox", () => {
  const data = buildDemoState("2026-11-03");
  it("cleaner events are not in the manager inbox or unread count, and other cleaners see none", () => {
    expect(inboxFor(data.notifications, "manager").every(n => !n.audience)).toBe(true);
    expect(inboxFor(data.notifications, "cleaner", "renata").length).toBe(3);
    expect(inboxFor(data.notifications, "cleaner", "marta").length).toBe(0);
    expect(unreadCount(data)).toBe(data.notifications.filter(n => !n.read && !n.audience).length);
  });
  it("an event for a cleaner with no ready device is still stored, with no target", () => {
    const d = domainReducer({ ...data, deviceHealth: data.deviceHealth.map(x => (x.owner === "renata" ? { ...x, registration: "none" } : x)) },
      { type: "HUB_EVENT", cleanerId: "renata", jobId: scheduleFor(data, "renata").upcoming[0].id, category: "cleanerReminder", titleKey: "cn.reminder", bodyKey: "cnb.reminder" });
    expect(d.notifications[0].delivery.targets).toBe(0);
    expect(inboxFor(d.notifications, "cleaner", "renata").length).toBe(4);
  });
});

describe("manager away center", () => {
  it("lists decisions without deciding anything", () => {
    const data = buildDemoState("2026-11-03");
    const a = awayItems(data);
    expect(a.urgent.some(i => i.kind === "swap")).toBe(true);
    expect(a.devices.map(d => d.id)).toContain("m1");
    expect(a.devices.map(d => d.id)).not.toContain("m2"); // other manager's device: not hers to fix
    const after = domainReducer(data, { type: "REQUEST_DECIDE", id: "r1", status: "approved" });
    expect(after.requests.find(r => r.id === "r1").status).toBe("approved");
    expect(after.jobs).toEqual(data.jobs.map(j => j)); // no job was changed by the decision
  });
});
