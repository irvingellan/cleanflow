import { describe, expect, it, vi } from "vitest";
import {
  buildCleanerReminderMessage,
  copyCleanerReminderMessage,
  reusableAssignmentOfferUrl,
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
    "jobs.reminderCleanFlowConfirmation": "Please confirm you'll be there through your CleanFlow link: {url}",
    "jobs.reminderChecklistLink": "Cleaning checklist: {url}",
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

  it("includes the CleanFlow confirmation instruction only when the caller supplies a current link", () => {
    const message = buildCleanerReminderMessage({
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      assignmentOfferUrl: "https://cleanflow.example/offer/current-token",
      language: "en",
      translate,
    });
    expect(message).toContain("confirm you'll be there through your CleanFlow link: https://cleanflow.example/offer/current-token");

    const withoutLink = buildCleanerReminderMessage({
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      language: "en",
      translate,
    });
    expect(withoutLink).toContain("Please confirm when you receive this. Thank you!");
  });

  it("adds the selected Cleaner's checklist link only when one is supplied", () => {
    const details = {
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      language: "en",
      translate,
    };
    const checklistUrl = "https://cleanflow.example/checklist?t=ana-token";
    const withChecklist = buildCleanerReminderMessage({ ...details, checklistUrl });
    const withoutChecklist = buildCleanerReminderMessage(details);

    expect(withChecklist).toContain(`Cleaning checklist: ${checklistUrl}`);
    expect(withChecklist).toContain("Please confirm when you receive this. Thank you!");
    expect(withoutChecklist).toBe([
      "Hi Ana! 😊",
      "",
      "Just a reminder about your cleaning:",
      "",
      "📅 Date: Sep 8, 2026",
      "📍 Property: Harbor View Condo",
      "",
      "Please confirm when you receive this. Thank you!",
    ].join("\n"));
    expect(withoutChecklist).not.toContain(checklistUrl);
  });

  it("uses the supplied Cleaner-language translator for each separate reminder", () => {
    const checklistLabels = { en: "Cleaning checklist", pt: "Checklist da limpeza", es: "Lista de limpieza" };
    const makeReminder = (cleanerName, language, checklistUrl) => buildCleanerReminderMessage({
      cleanerName,
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      checklistUrl,
      language,
      translate: (key, replacements) => key === "jobs.reminderChecklistLink"
        ? `${checklistLabels[language]}: ${replacements.url}`
        : translate(key, replacements),
    });

    const anaUrl = "https://cleanflow.example/checklist?t=ana-token";
    const benUrl = "https://cleanflow.example/checklist?t=ben-token";
    const ana = makeReminder("Ana", "pt", anaUrl);
    const ben = makeReminder("Ben", "es", benUrl);

    expect(ana).toContain(`Checklist da limpeza: ${anaUrl}`);
    expect(ana).not.toContain(benUrl);
    expect(ben).toContain(`Lista de limpieza: ${benUrl}`);
    expect(ben).not.toContain(anaUrl);
  });

  it("reuses only a current unexpired link for the active Assignment's exact source Offer", () => {
    const now = 1_800_000_000_000;
    const job = { schemaVersion: 2, operationalStatus: "ASSIGNED" };
    const assignment = {
      id: "assignment-a",
      cleanerId: "cleaner-a",
      sourceOfferId: "offer-a",
      isActive: true,
    };
    const offer = {
      id: "offer-a",
      cleanerId: "cleaner-a",
      status: "INTERESTED",
      publicOfferTokenHash: "current-hash",
      publicOfferExpiresAt: { toMillis: () => now + 5_000 },
    };
    const link = {
      offerId: "offer-a",
      tokenHash: "current-hash",
      expiresAtMs: now + 5_000,
      url: "https://cleanflow.example/offer/opaque-token",
    };

    expect(reusableAssignmentOfferUrl({ job, assignment, offer, link, now, origin: "https://cleanflow.example" }))
      .toBe(link.url);
    expect(reusableAssignmentOfferUrl({ job, assignment, offer, link: { ...link, tokenHash: "rotated" }, now }))
      .toBeNull();
    expect(reusableAssignmentOfferUrl({ job, assignment, offer, link: { ...link, expiresAtMs: now }, now }))
      .toBeNull();
    expect(reusableAssignmentOfferUrl({ job, assignment: { ...assignment, isActive: false }, offer, link, now }))
      .toBeNull();
    expect(reusableAssignmentOfferUrl({ job: { ...job, archivedAt: {} }, assignment, offer, link, now }))
      .toBeNull();
    expect(reusableAssignmentOfferUrl({ job, assignment, offer, link: { ...link, url: "https://attacker.example/offer/token" }, now, origin: "https://cleanflow.example" }))
      .toBeNull();
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

  it("does not translate or rewrite Property free text", () => {
    const originalInstructions = "  RESET thermostat exactly as shown.  ";
    const originalParking = "  Gate note: leave the placard visible.  ";
    const message = buildCleanerReminderMessage({
      cleanerName: "Ana",
      propertyName: "Harbor View Condo",
      scheduledDate: "2026-09-08",
      propertyDetails: {
        cleanerInstructions: originalInstructions,
        garageParking: originalParking,
      },
      includeSensitiveAccess: true,
      language: "pt",
      translate,
    });

    expect(message).toContain(`Cleaner instructions: ${originalInstructions}`);
    expect(message).toContain(`Parking / garage: ${originalParking}`);
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
