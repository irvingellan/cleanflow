import { describe, expect, it } from "vitest";
import {
  cleanerAccountUid,
  formatCleanerAccessCode,
  hashCleanerAccessCode,
  isActiveCleanerMembership,
  isActiveCleanerSession,
  newCleanerAccessCode,
  normalizeCleanerAccessCode,
} from "./cleanerHubAccess.js";

describe("cleaner access codes", () => {
  it("generates 12 unambiguous characters with unbiased rejection sampling", () => {
    const code = newCleanerAccessCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
    // Bytes at or above the rejection limit (248) are skipped, never folded in.
    let call = 0;
    const source = () => (call++ === 0 ? Buffer.from(Array(24).fill(255)) : Buffer.from(Array(24).fill(0)));
    expect(newCleanerAccessCode(source)).toBe("AAAAAAAAAAAA");
  });

  it("accepts what people type or paste and rejects anything else", () => {
    expect(normalizeCleanerAccessCode(" abcd-efgh-jk23 ")).toBe("ABCDEFGHJK23");
    expect(normalizeCleanerAccessCode("ABCD EFGH JK2O")).toBeNull(); // O is not in the alphabet
    expect(normalizeCleanerAccessCode("ABCD")).toBeNull();
    expect(normalizeCleanerAccessCode(42)).toBeNull();
    expect(normalizeCleanerAccessCode("A".repeat(65))).toBeNull();
    expect(formatCleanerAccessCode("ABCDEFGHJK23")).toBe("ABCD-EFGH-JK23");
  });

  it("stores only a hash and derives a stable, non-identifying account per Cleaner", () => {
    expect(hashCleanerAccessCode("ABCDEFGHJK23")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCleanerAccessCode("ABCDEFGHJK23")).not.toContain("ABCD");
    const uid = cleanerAccountUid("org", "cleaner-1");
    expect(uid).toMatch(/^cleaner-[0-9a-f]{28}$/);
    expect(cleanerAccountUid("org", "cleaner-1")).toBe(uid);
    expect(cleanerAccountUid("other", "cleaner-1")).not.toBe(uid);
  });

  it("recognises only an active CLEANER membership linked to a Cleaner", () => {
    expect(isActiveCleanerMembership({ role: "CLEANER", active: true, cleanerId: "c" })).toBe(true);
    expect(isActiveCleanerMembership({ role: "CLEANER", active: false, cleanerId: "c" })).toBe(false);
    expect(isActiveCleanerMembership({ role: "MANAGER", active: true, cleanerId: "c" })).toBe(false);
    expect(isActiveCleanerMembership({ role: "CLEANER", active: true })).toBe(false);
  });

  it("authorizes only the exact current session, cleaner, and organization", () => {
    const claims = { organizationId: "org", cleanerId: "c", sessionId: "current" };
    const member = { ...claims, role: "CLEANER", active: true };
    expect(isActiveCleanerSession(member, claims)).toBe(true);
    expect(isActiveCleanerSession(member, undefined)).toBe(false);
    expect(isActiveCleanerSession(member, { ...claims, sessionId: "retired" })).toBe(false);
    expect(isActiveCleanerSession(member, { ...claims, organizationId: "other" })).toBe(false);
    expect(isActiveCleanerSession(member, { ...claims, cleanerId: "other" })).toBe(false);
  });
});
