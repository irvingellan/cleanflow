import { describe, expect, it, vi } from "vitest";
import {
  buildCleanerReminderMessage,
  copyCleanerReminderMessage,
} from "./cleanerReminderMessage.js";

function translate(key, replacements = {}) {
  const messages = {
    "jobs.reminderGreeting": "Hi {cleaner}! 😊",
    "jobs.reminderIntro": "Just a reminder about your cleaning:",
    "jobs.reminderDate": "Date: {date}",
    "jobs.reminderTime": "Time: {time}",
    "jobs.reminderProperty": "Property: {property}",
    "jobs.reminderConfirmation": "Please confirm when you receive this. Thank you!",
    "common.notProvided": "Not provided",
  };

  return Object.entries(replacements).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement),
    messages[key],
  );
}

describe("cleaner reminder message", () => {
  it("builds a one-cleaner reminder with the scheduled date, time, and property", () => {
    const message = buildCleanerReminderMessage({
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      scheduledStart: "10:30",
      language: "en",
      translate,
    });

    expect(message).toContain("Hi Ana! 😊");
    expect(message).toContain("Date: Sep 8, 2026");
    expect(message).toContain("Time: 10:30");
    expect(message).toContain("Property: Harbor View Condo");
  });

  it("omits the time line when a Job has no scheduled start", () => {
    const message = buildCleanerReminderMessage({
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      scheduledStart: "",
      language: "en",
      translate,
    });

    expect(message).not.toContain("Time:");
  });

  it("does not expose financial or internal Job data because it accepts only safe fields", () => {
    const message = buildCleanerReminderMessage({
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      language: "en",
      translate,
      clientPrice: 350,
      cleanerPayout: 200,
      notes: "Internal manager note",
      accessCode: "1234",
    });

    expect(message).not.toContain("350");
    expect(message).not.toContain("200");
    expect(message).not.toContain("Internal manager note");
    expect(message).not.toContain("1234");
  });

  it("copies the prepared message through the browser clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await copyCleanerReminderMessage("Reminder text");

    expect(writeText).toHaveBeenCalledWith("Reminder text");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });
});
