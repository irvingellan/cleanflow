import { describe, expect, it, vi } from "vitest";
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));
const { cleanerReminderState, jobReminderState } = await import("./cleanerReminderLog.js");

describe("section 12 reminder log", () => {
  const job = (extra = {}) => ({ schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana", "bia"], scheduleRevision: 2, ...extra });
  it("is pending until marked, and pending again after the schedule changes", () => {
    expect(cleanerReminderState(job(), "ana")).toEqual({ state: "pending" });
    const sent = job({ cleanerReminders: { ana: { scheduleRevision: 2, byUid: "m", sentAt: "t" } } });
    expect(cleanerReminderState(sent, "ana")).toEqual({ state: "sent", sentAt: "t", byUid: "m" });
    expect(cleanerReminderState({ ...sent, scheduleRevision: 3 }, "ana")).toEqual({ state: "pending", stale: true });
  });
  it("summarizes a Job only when every assigned cleaner was reminded", () => {
    expect(jobReminderState(job({ operationalStatus: "OFFERED", assignedCleanerIds: [] }))).toBeNull();
    expect(jobReminderState(job({ cleanerReminders: { ana: { scheduleRevision: 2 } } }))).toBe("pending");
    expect(jobReminderState(job({ cleanerReminders: { ana: { scheduleRevision: 2 }, bia: { scheduleRevision: 2 } } }))).toBe("sent");
    expect(jobReminderState({ operationalStatus: "ASSIGNED", assignedCleanerId: "legacy", scheduleRevision: 0, cleanerReminders: { legacy: { scheduleRevision: 0 } } })).toBe("sent");
  });
});
