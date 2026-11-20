import { describe, expect, it } from "vitest";
import {
  buildWhatsAppChatUrl,
  buildWhatsAppHandoffUrl,
  normalizeWhatsAppPhone,
} from "./whatsappHandoff.js";

describe("WhatsApp handoff URL", () => {
  it.each([
    ["+1 (949) 555-1234", "19495551234"],
    ["+19495551234", "19495551234"],
    ["19495551234", "19495551234"],
    ["+44 20-7946-0123", "442079460123"],
  ])("normalizes %s to international digits only", (phone, expected) => {
    expect(normalizeWhatsAppPhone(phone)).toBe(expected);
  });

  it.each(["", "   ", "9495551234", "(949) 555-1234", "+1+9495551234", "+12abc345678", "+0123456789", null])(
    "rejects an empty, malformed, or ambiguous target: %s",
    (phone) => expect(normalizeWhatsAppPhone(phone)).toBeNull(),
  );

  it("opens offer chats without private text or capability tokens", () => {
    expect(buildWhatsAppChatUrl("+1 (949) 555-1234")).toBe("https://wa.me/19495551234");
    expect(buildWhatsAppChatUrl("")).toBeNull();
  });

  it("encodes an operational reminder into the standard wa.me click-to-chat URL", () => {
    const message = "Hi!\nStart time: 9:00 & details ✓";
    const url = buildWhatsAppHandoffUrl("+1 (949) 555-1234", message);
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://wa.me");
    expect(parsed.pathname).toBe("/19495551234");
    expect(parsed.pathname).not.toContain("+");
    expect(parsed.searchParams.get("text")).toBe(message);
  });

  it("returns no target for invalid phones or blank messages", () => {
    expect(buildWhatsAppHandoffUrl("9495551234", "Hi")).toBeNull();
    expect(buildWhatsAppHandoffUrl("+19495551234", "  ")).toBeNull();
  });
});
