import { buildWhatsAppChatUrl } from "./whatsappHandoff.js";
import { describe, expect, it } from "vitest";
import {
  buildCleanerOfferMessage,
  getOfferCompensationSuggestion,
  parseOfferCompensationInput,
} from "./offerCompensation.js";

describe("per-cleaner Offer compensation", () => {
  it.each([
    ["legacy", { cleanerPayout: 150 }],
    ["assignment-aware", { schemaVersion: 2, cleanerPayout: 150 }],
  ])("uses a %s Job payout only as a manager suggestion", (_schema, job) => {
    expect(getOfferCompensationSuggestion(
      job,
      { status: "PENDING" },
    )).toEqual({ value: "150", source: "job" });
  });

  it("leaves missing Job payout blank and preserves an explicit zero", () => {
    expect(getOfferCompensationSuggestion(
      { schemaVersion: 2 },
      { status: "PENDING" },
    )).toEqual({ value: "", source: "unset" });
    expect(getOfferCompensationSuggestion(
      { schemaVersion: 2, cleanerPayout: 0 },
      { status: "PENDING" },
    )).toEqual({ value: "0", source: "job" });
  });

  it("prefers the saved Offer snapshot over changed Job pricing", () => {
    expect(getOfferCompensationSuggestion(
      { schemaVersion: 2, cleanerPayout: 500 },
      { status: "PENDING", offeredCompensation: 125 },
    )).toEqual({ value: "125", source: "offer" });
  });

  it("preserves an explicitly unset Offer amount instead of falling back", () => {
    expect(getOfferCompensationSuggestion(
      { schemaVersion: 2, cleanerPayout: 150 },
      { status: "PENDING", offeredCompensation: null },
    )).toEqual({ value: "", source: "offer" });
  });

  it("keeps a blank amount unset and rejects invalid amounts", () => {
    expect(parseOfferCompensationInput("   ")).toBeNull();
    expect(parseOfferCompensationInput("0")).toBe(0);
    expect(() => parseOfferCompensationInput("-1")).toThrow();
    expect(() => parseOfferCompensationInput("not money")).toThrow();
  });

  it("copies the hourly rate and instructions and keeps the chat URL free of message contents", () => {
    const translate = (key, values = {}) => ({
      "offers.messageCompensation": values.amount,
      "offers.messageLink": values.url,
    })[key] || key;
    const pay = { mode: "HOURLY", rateCents: 3125 };
    const message = buildCleanerOfferMessage({ offeredPay: pay, offeredCompensation: 90,
      language: "en", translate, publicUrl: "https://example.test/offer/synthetic" });
    expect(message).toContain("$31.25 per hour\nYou report your hours at the end.");
    expect(message).not.toContain("90.00");
    expect(getOfferCompensationSuggestion({ cleanerPayout: 90 }, { offeredPay: pay }))
      .toEqual({ value: "31.25", source: "offer", mode: "HOURLY" });
    expect(buildWhatsAppChatUrl("+12025550110")).toBe("https://wa.me/12025550110");
    expect(buildWhatsAppChatUrl("")).toBeNull();
  });

  it("builds the copied message from the snapshotted amount and uses explicit missing copy", () => {
    const translate = (key, values = {}) => ({
      "offers.messageGreeting": `Hi ${values.cleaner},`,
      "offers.messageIntro": `Cleaning offer at ${values.property} on ${values.date}.`,
      "offers.messageTime": `Start time: ${values.time}`,
      "offers.messageCompensation": `Offered compensation: ${values.amount}`,
      "offers.messageLink": `Review and respond: ${values.url}`,
      "publicOffer.amountNotSet": "Amount not set / To be agreed",
      "common.notProvided": "Not provided",
    })[key];
    const message = buildCleanerOfferMessage({
      cleanerName: "Ana",
      propertyName: "Demo Property",
      scheduledDate: "2026-09-25",
      scheduledStart: "10:30",
      offeredCompensation: 125,
      publicUrl: "https://cleanflow.example/offer/synthetic",
      language: "en",
      translate,
    });

    expect(message).toContain("Offered compensation: $125.00");
    expect(message).toContain("Review and respond: https://cleanflow.example/offer/synthetic");
    expect(message).not.toContain("clientPrice");
    expect(message).not.toContain("margin");

    const missingMessage = buildCleanerOfferMessage({
      cleanerName: "Ana",
      propertyName: "Demo Property",
      scheduledDate: "2026-09-25",
      offeredCompensation: null,
      publicUrl: "https://cleanflow.example/offer/synthetic",
      language: "en",
      translate,
    });
    expect(missingMessage).toContain("Offered compensation: Amount not set / To be agreed");
  });
});
