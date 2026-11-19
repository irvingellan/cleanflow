import { describe, expect, it, vi } from "vitest";
import {
  directoryPerson, displayLabel, isoDate, operationKinds, organizationKey, reportingWindow, summarizeHealth,
} from "./platformOverview.js";
import {
  backgroundDurationCapMs, durationSeverity, managerOperationNames, summarizeManagerPageLoadEvents,
} from "../../src/features/telemetry/managerPageLoadDiagnosticsService.js";

vi.mock("../../src/services/firebase/serverReads.js", () => ({}));

const privateField = /address|accessCode|doorCode|lockCode|garage|alarm|phone|email|token|url|photo|price|notes|answers/i;
function checkProjection(value) {
  if (typeof value === "string") expect(value).not.toMatch(/@|:\/\/|private-canary/i);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(privateField);
      checkProjection(child);
    }
  }
}

describe("platform overview projections", () => {
  it.each([
    [[], null, null],
    [[200, 100], 150, 200],
    [[2, 3, 1], 2, 3],
    [Array.from({ length: 100 }, (_, i) => (100 - i) * 10), 505, 950],
    [[NaN, Infinity, undefined, 600_000], null, null],
  ])("matches the established foreground median and nearest-rank p95", (values, medianMs, p95Ms) => {
    const sample = [...values, backgroundDurationCapMs];
    const health = summarizeHealth(sample.length, sample, {});
    const existing = summarizeManagerPageLoadEvents(sample.map((durationMs) => ({ page: "jobs", durationMs })));
    expect(health).toMatchObject({ pageLoads: sample.length, medianMs, p95Ms });
    expect([health.medianMs, health.p95Ms]).toEqual([existing.medianMs, existing.p95Ms]);
  });

  it("reports failures ahead of latency and keeps missing timing distinct from healthy", () => {
    expect(operationKinds).toEqual(managerOperationNames);
    expect(summarizeHealth(0, [], {})).toMatchObject({ status: "unknown" });
    for (const value of [0, 3000, 3001]) {
      expect(summarizeHealth(1, [value], {}).status).toBe(durationSeverity(value) === "slow" ? "slow" : "ok");
    }
    expect(summarizeHealth(1, [3500], { offers: 2, "private-canary": 7 })).toMatchObject({
      status: "errors", failedOperations: { offers: 2 },
    });
    expect(summarizeHealth(1, [-1], {}).medianMs).toBeNull();
    expect(summarizeHealth(1, [100], {}, 1)).toEqual({
      pageLoads: 1, failedPageLoads: 1, medianMs: 100, p95Ms: 100, failedOperations: {}, status: "errors",
    });
  });

  it("returns only approved person fields and never substitutes a contact or account identifier", () => {
    const email = ["private-canary", "invalid.test"].join("@");
    const privateData = { email, phone: "private-canary", notes: "private-canary", accessCode: "private-canary" };
    const profile = { ...privateData, name: "Synthetic Cleaner", active: true, archivedAt: new Date() };
    const account = { ...privateData, displayName: email, metadata: { lastSignInTime: "2026-01-01T00:00:00Z" } };
    const detail = { people: [directoryPerson("CLEANER", profile, account), directoryPerson("MANAGER", { active: true }, account)] };
    expect(detail.people).toEqual([
      { role: "CLEANER", displayName: "Synthetic Cleaner", active: false, lastSignInAt: "2026-01-01T00:00:00.000Z" },
      { role: "MANAGER", displayName: null, active: true, lastSignInAt: "2026-01-01T00:00:00.000Z" },
    ]);
    checkProjection(detail);
    expect(organizationKey(email)).toMatch(/^org-ref-[a-f0-9]{64}$/);
    expect(organizationKey(organizationKey(email))).not.toBe(organizationKey(email));
    expect(organizationKey("synthetic-a")).toBe("synthetic-a");
    expect(directoryPerson("CLEANER", { name: "Synthetic Cleaner" }).lastSignInAt).toBeNull();
    for (const label of [email, "https:" + "//invalid.test", "invalid.test", "123 456 789", "Bearer private-canary", "Door code private-canary", "x".repeat(40), ["private-canary"]]) {
      expect(displayLabel(label)).toBeNull();
    }
    expect(isoDate("unavailable")).toBeNull();
    expect(isoDate({ toDate: () => new Date(0) })).toBe("1970-01-01T00:00:00.000Z");
  });

  it("uses the operating calendar and shifts by calendar days over DST", () => {
    const now = new Date("2026-03-08T07:45:00Z");
    expect(reportingWindow(now)).toEqual({
      now, since30: new Date("2026-02-06T07:45:00Z"), since7: new Date("2026-03-01T07:45:00Z"),
      today: "2026-03-07", endDate: "2026-03-14",
    });
  });
});
