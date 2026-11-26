import { describe, expect, it } from "vitest";
import { cleanerPushReceiptText } from "./cleanerPushReceiptText.js";

describe("Cleaner push receipt copy", () => {
  const attemptedAt = new Date(2026, 10, 25, 10, 50, 53).toISOString();
  const receivedAt = new Date(2026, 10, 25, 10, 53, 40).toISOString();
  const receipt = { receivedAt, clientVisible: false, outcome: "shown" };

  it("shows the send and phone times and the Agenda's visibility", () => {
    expect(cleanerPushReceiptText({ attemptedAt, receipt }, "en", { lastTest: true }))
      .toBe("Last test: sent 10:50:53 · reached the phone 10:53:40 (app closed)");
    expect(cleanerPushReceiptText({ attemptedAt, receipt }, "pt", { lastTest: true }))
      .toBe("Último teste: enviado 10:50:53 · chegou no celular 10:53:40 (app fechado)");
    expect(cleanerPushReceiptText({ attemptedAt, receipt: { ...receipt, clientVisible: true } }, "es"))
      .toBe("enviada 10:50:53 · llegó al celular 10:53:40 (app abierta)");
  });

  it("shows missing confirmation and reports failed display distinctly", () => {
    expect(cleanerPushReceiptText({ attemptedAt }, "en"))
      .toBe("sent 10:50:53 · not confirmed by the phone yet");
    expect(cleanerPushReceiptText({ receipt: { ...receipt, outcome: "error" } }, "en"))
      .toBe("reached the phone 10:53:40 (app closed) · the alert could not be displayed");
  });
});
