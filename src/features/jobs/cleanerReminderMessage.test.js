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
    "jobs.reminderInstructions": "Cleaner instructions: {instructions}",
    "jobs.reminderSensitiveAccessHeading": "Sensitive access details:",
    "jobs.reminderParking": "Parking / garage: {details}",
    "jobs.reminderAccessInstructions": "Access instructions: {details}",
    "jobs.reminderKeyCodeInfo": "Key / code info: {details}",
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

  it("includes cleaner instructions but keeps access details opt-in and excludes unrelated Property fields", () => {
    const propertyDetails = {
      cleanerInstructions: "Reset the thermostat.",
      garageParking: "Park in the garage.",
      accessInstructions: "Use code 8877.",
      keyCodeInfo: "Lockbox key 3921.",
      address: "Private street address",
      additionalNotes: "Internal Property note",
      defaultClientPrice: 350,
      defaultCleanerPrice: 200,
    };
    const standardMessage = buildCleanerReminderMessage({
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      propertyDetails,
      language: "en",
      translate,
    });

    expect(standardMessage).toContain("Cleaner instructions: Reset the thermostat.");
    expect(standardMessage).not.toContain("Park in the garage");
    expect(standardMessage).not.toContain("8877");
    expect(standardMessage).not.toContain("3921");
    expect(standardMessage).not.toContain("Private street address");
    expect(standardMessage).not.toContain("Internal Property note");
    expect(standardMessage).not.toContain("350");
    expect(standardMessage).not.toContain("200");

    const confirmedMessage = buildCleanerReminderMessage({
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      propertyDetails,
      includeSensitiveAccess: true,
      language: "en",
      translate,
    });
    expect(confirmedMessage).toContain("Sensitive access details:");
    expect(confirmedMessage).toContain("Park in the garage.");
    expect(confirmedMessage).toContain("Use code 8877.");
    expect(confirmedMessage).toContain("Lockbox key 3921.");
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
