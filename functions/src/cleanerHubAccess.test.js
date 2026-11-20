import { describe, expect, it, vi } from "vitest";
import {
  cleanerAccountUid,
  formatCleanerAccessCode,
  hashCleanerAccessCode,
  isActiveCleanerMembership,
  isActiveCleanerSession,
  newCleanerAccessCode,
  normalizeCleanerAccessCode,
  openChecklistForCleaner,
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

describe("opening a Hub checklist with unusable grant state", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const identity = { organizationId: "sample", cleanerId: "worker", uid: "account", sessionId: "current" };
  const root = "organizations/sample";

  function attempt({ grants, active = true }) {
    const records = {
      [root + "/jobs/job"]: { operationalStatus: "ASSIGNED", assignedCleanerIds: ["worker"], propertyId: "property" },
      [root + "/properties/property"]: { organizationId: "sample", name: "Sample property" },
      [root + "/members/account"]: { ...identity, role: "CLEANER", active },
      [root + "/cleaners/worker"]: { active: true },
      [root + "/cleanerHubChecklistGrants/worker"]: { grants },
    };
    function reference(path) {
      return {
        path, id: path.split("/").at(-1),
        get parent() { return reference(path.slice(0, path.lastIndexOf("/"))); },
        collection: name => reference(path + "/" + name),
        doc: id => reference(path + "/" + id),
      };
    }
    const write = vi.fn();
    const transaction = {
      get: async ref => ({ id: ref.id, exists: Object.hasOwn(records, ref.path), data: () => records[ref.path] }),
      set: write, create: write, update: write,
    };
    const database = { doc: reference, runTransaction: async body => body(transaction) };
    const opened = openChecklistForCleaner(database, {
      ...identity, jobId: "job", runId: "initial", newToken: () => "sample", hashToken: () => "sample-hash", now,
    });
    return { opened, write };
  }

  it("returns unavailable for a malformed grants record before staging any writes", async () => {
    const { opened, write } = attempt({ grants: {} });
    await expect(opened).resolves.toEqual({ state: "unavailable" });
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps the error for a full grant list", async () => {
    const grants = Array.from({ length: 32 }, (_, index) => ({ jobId: String(index), expiresAtMs: now.getTime() + 1000 }));
    const { opened, write } = attempt({ grants });
    await expect(opened).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps the error for an inactive session", async () => {
    const { opened, write } = attempt({ grants: {}, active: false });
    await expect(opened).rejects.toMatchObject({ code: "permission-denied" });
    expect(write).not.toHaveBeenCalled();
  });
});
