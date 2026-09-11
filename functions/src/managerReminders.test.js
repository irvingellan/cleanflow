import { describe, expect, it, vi } from "vitest";
import {
  buildManagerReminder,
  calculateManagerReminder,
  claimReminderDelivery,
  localDateKey,
  managerReminderPayload,
  managerReminderTypes,
  reminderDeliveryId,
  summarizeManagerReminderDelivery,
  targetDateForReminder,
} from "./managerReminders.js";

const eveningBeforeDst = new Date("2026-03-08T06:30:00.000Z");
const exampleJobs = [
  { id: "assigned", scheduledDate: "2026-03-08", operationalStatus: "ASSIGNED", assignedCleanerId: "cleaner-a" },
  { id: "unassigned", scheduledDate: "2026-03-08", operationalStatus: "UNASSIGNED" },
  { id: "archived", scheduledDate: "2026-03-08", operationalStatus: "UNASSIGNED", archivedAt: {} },
  { id: "completed", scheduledDate: "2026-03-08", operationalStatus: "COMPLETED" },
];

describe("manager reminders", () => {
  it("uses America/Los_Angeles calendar dates across DST", () => {
    expect(localDateKey(eveningBeforeDst)).toBe("2026-03-07");
    expect(targetDateForReminder(managerReminderTypes.TOMORROW_19, eveningBeforeDst)).toBe("2026-03-08");
    expect(targetDateForReminder(managerReminderTypes.TODAY_07, eveningBeforeDst)).toBe("2026-03-07");
  });

  it("counts only current-schedule active Jobs and flags no-cleaner attention", () => {
    const reminder = buildManagerReminder({
      type: managerReminderTypes.TODAY_07,
      now: new Date("2026-03-08T15:00:00.000Z"),
      jobs: exampleJobs,
    });
    expect(reminder).toMatchObject({ targetDate: "2026-03-08", jobCount: 2, attentionCount: 1 });
  });

  it("uses the same read-only calculation for preview and scheduled reminder windows", async () => {
    const loadJobsForScheduledDate = vi.fn().mockResolvedValue(exampleJobs);
    const now = new Date("2026-03-08T15:00:00.000Z");

    const reminder = await calculateManagerReminder({
      type: managerReminderTypes.TODAY_07,
      now,
      loadJobsForScheduledDate,
    });

    expect(loadJobsForScheduledDate).toHaveBeenCalledOnce();
    expect(loadJobsForScheduledDate).toHaveBeenCalledWith("2026-03-08");
    expect(reminder).toMatchObject({ targetDate: "2026-03-08", jobCount: 2, attentionCount: 1 });
  });

  it("uses the current rescheduled date and excludes cancelled Jobs", () => {
    const reminder = buildManagerReminder({
      type: managerReminderTypes.TODAY_07,
      now: new Date("2026-03-08T15:00:00.000Z"),
      jobs: [
        { scheduledDate: "2026-03-09", operationalStatus: "UNASSIGNED" },
        { scheduledDate: "2026-03-08", operationalStatus: "CANCELLED" },
      ],
    });

    expect(reminder).toMatchObject({ targetDate: "2026-03-08", jobCount: 0, attentionCount: 0 });
  });

  it("keeps zero-job windows silent and uses separate durable keys", () => {
    const now = new Date("2026-03-08T15:00:00.000Z");
    const today = buildManagerReminder({ type: managerReminderTypes.TODAY_07, jobs: [], now });
    const tomorrow = buildManagerReminder({ type: managerReminderTypes.TOMORROW_19, jobs: [], now });
    expect(today.jobCount).toBe(0);
    expect(reminderDeliveryId("cleanflow-demo", today)).not.toBe(reminderDeliveryId("cleanflow-demo", tomorrow));
  });

  it("allows only one concurrent claim for the same logical delivery across transports", async () => {
    let exists = false;
    let transactionQueue = Promise.resolve();
    const database = {
      runTransaction(work) {
        const result = transactionQueue.then(() => work({
          get: async () => ({ exists }),
          create: () => {
            exists = true;
          },
        }));
        transactionQueue = result.catch(() => undefined);
        return result;
      },
    };
    const input = { database, deliveryReference: { id: "same-window" }, deliveryData: { deliveryProvider: "fcm" } };

    const claims = await Promise.all([
      claimReminderDelivery(input),
      claimReminderDelivery({ ...input, deliveryData: { deliveryProvider: "onesignal" } }),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("retains distinct confirmed and ambiguous delivery outcomes for audit history", () => {
    expect(summarizeManagerReminderDelivery({ attempted: 2, delivered: 2, failed: 0 }))
      .toMatchObject({ deliveryStatus: "SENT", hasConfirmedDelivery: true });
    expect(summarizeManagerReminderDelivery({ attempted: 2, delivered: 1, failed: 1 }))
      .toMatchObject({ deliveryStatus: "PARTIAL", hasConfirmedDelivery: true });
    expect(summarizeManagerReminderDelivery({ attempted: 2, delivered: 0, failed: 2 }))
      .toMatchObject({ deliveryStatus: "FAILED", hasConfirmedDelivery: false });
    expect(summarizeManagerReminderDelivery({ attempted: 0, delivered: 0, failed: 0 }))
      .toMatchObject({ deliveryStatus: "NO_ACTIVE_DEVICES", hasConfirmedDelivery: false });
  });

  it("builds localized, privacy-safe payloads with no Job details", () => {
    const reminder = { type: managerReminderTypes.TODAY_07, jobCount: 2, attentionCount: 1 };
    expect(managerReminderPayload(reminder, "pt")).toEqual({
      title: "☀️ Hoje: 2 limpezas",
      body: "1 precisa de atenção. Toque para revisar no CleanFlow.",
      eventType: "MANAGER_REMINDER",
      link: "/",
    });
    expect(managerReminderPayload(reminder, "es").title).toBe("☀️ Hoy: 2 limpiezas");
    expect(managerReminderPayload(reminder, "en").title).toBe("☀️ Today: 2 cleanings");
  });
});
