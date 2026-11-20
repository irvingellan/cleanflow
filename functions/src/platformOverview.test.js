import { describe, expect, it, vi } from "vitest";
import {
  directoryPerson, displayLabel, isoDate, operationKinds, organizationKey, reportingWindow, summarizeHealth,
} from "./platformOverview.js";
import {
  backgroundDurationCapMs, managerOperationNames, summarizeManagerPageLoadEvents,
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

  it("applies minimum samples and error-rate boundaries per kind", () => {
    expect(operationKinds).toEqual(managerOperationNames);
    expect(summarizeHealth(19, [], { offers: 9 }, 19, { offers: 9 }).status).toBe("no-data");
    expect(summarizeHealth(20, [], {}, 1).status).toBe("errors");
    expect(summarizeHealth(220, [], {}, 1)).toMatchObject({ status: "ok", pageFailureRate: 1 / 220 });
    expect(summarizeHealth(0, [], { offers: 1 }, 0, { offers: 10, issues: 100 })).toMatchObject({
      status: "errors", operationFailureRates: { offers: 0.1, issues: 0 },
    });
    expect(summarizeHealth(0, [], { offers: 1 }, 0, { offers: 21 }).status).toBe("ok");
    expect(summarizeHealth(0, [], { offers: 1 }, 0, { offers: 20 }).status).toBe("errors");
    expect(summarizeHealth(0, [], {}, 0, { "private-canary": 20 })).toMatchObject({
      status: "no-data", operationAttempts: {}, pageFailureRate: null,
    });
  });

  it("only marks slow after 20 usable foreground timings and strictly above three seconds", () => {
    const timings = new Array(19).fill(3001);
    expect(summarizeHealth(20, [...timings, 600_000], {}).status).toBe("ok");
    expect(summarizeHealth(20, new Array(20).fill(3000), {}).status).toBe("ok");
    expect(summarizeHealth(20, [...timings, 3001], {}).status).toBe("slow");
    expect(summarizeHealth(20, [...timings, 3001], {}, 1).status).toBe("errors");
  });

  it("prefers safe membership names, then Auth display names and finally a masked manager hint", () => {
    const email = ["private-canary", "invalid.test"].join("@");
    const privateData = { email, phone: "private-canary", notes: "private-canary", accessCode: "private-canary" };
    const account = { ...privateData, displayName: "Auth manager", metadata: { lastSignInTime: "2026-01-01T00:00:00Z" } };
    expect(directoryPerson("MANAGER", { displayName: "Member", name: "Second" }, account).displayName).toBe("Member");
    expect(directoryPerson("MANAGER", { displayName: email, name: "Second" }, account).displayName).toBe("Second");
    expect(directoryPerson("MANAGER", {}, account).displayName).toBe("Auth manager");
    expect(directoryPerson("MANAGER", {}, { ...account, displayName: email })).toMatchObject({
      displayName: "pr•••@", activitySource: "signIn", lastActivityAt: "2026-01-01T00:00:00.000Z",
    });
    expect(directoryPerson("MANAGER", {}, { email: "malformed" }).displayName).toBeNull();
    const cleaner = directoryPerson("CLEANER", { ...privateData, name: "Synthetic Cleaner", archivedAt: new Date() }, account);
    expect(cleaner).toEqual({ role: "CLEANER", displayName: "Synthetic Cleaner", active: false, lastSignInAt: null,
      lastActivityAt: null, activitySource: null });
    checkProjection(cleaner);
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
