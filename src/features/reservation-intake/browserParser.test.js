import { describe, expect, it } from "vitest";
import "../../../tools/reservation-observer/extension/parser.js";
const parser = globalThis.ReservationBridgeParser;
const location = { protocol: "https:", hostname: "app.guesty.com", pathname: "/reservations" };
const html = `<section data-reservation-bridge-profile="v0-synthetic"><div data-reservation-record data-reservation-id="demo-booking" data-listing-id="demo-listing" data-listing-name="Demo Villa" data-check-in="2026-10-10" data-check-out="2026-10-12"></div></section>`;
const parse = (content, page = location) => {
  const document = new DOMParser().parseFromString(content, "text/html");
  return parser.parse(document, page, "demo-browser", "2026-10-04T12:00:00Z");
};
describe("passive DOM known contract, no page-wide scraping", () => {
  it("extracts known synthetic fixture, guest missing stays null, no full HTML/password/cookie", () => {
    const result = parse(html + '<input type="password" value="never-read"><p>secret unrelated content</p>');
    expect(result.observations).toHaveLength(1); expect(result.observations[0].guestName).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/never-read|secret unrelated|<input/);
    expect(result.complete).toBe(false);
  });
  it.each(["<div>changed layout</div>", '<form><input type="password"></form>', '<main>MFA challenge</main>'])("unknown/logout/MFA layout fails closed", content => {
    const result = parse(content); expect(result.result).toBe("PARSER_NEEDS_REVIEW"); expect(result.observations).toEqual([]);
  });
  it("rejects outside origin and outside exact calendar paths", () => {
    expect(parse(html, { ...location, hostname: "evil.example" }).errorCategory).toBe("PAGE_NOT_ALLOWLISTED");
    expect(parse(html, { ...location, pathname: "/reservations-admin" }).errorCategory).toBe("PAGE_NOT_ALLOWLISTED");
  });
  it("rejects injected sensitive field rather than emit contact data", () => {
    expect(parse(html.replace("Demo Villa", "guest@example.invalid")).errorCategory).toBe("PARSER_UNSAFE_FIELD");
  });
  it("missing required selector fails and parser version is explicit", () => {
    expect(parse(html.replace('data-check-out="2026-10-12"', "")).errorCategory).toBe("PARSER_REQUIRED_FIELD_MISSING");
    expect(parser.version).toContain("synthetic-only");
  });
});
