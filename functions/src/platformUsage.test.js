import { describe, expect, it } from "vitest";
import { adoptionFunnel, attentionReasons, offerWaitingTooLong, weeklyWindows } from "./platformUsage.js";

const now = new Date("2026-11-06T16:00:00Z");
const day = 86_400_000;
const window = { now, since30: new Date(now.getTime() - 30 * day) };
const daysAgo = days => new Date(now.getTime() - days * day).toISOString();

describe("platform usage", () => {
  it("uses eight non-overlapping Monday weeks in the operating timezone across DST", () => {
    const weeks = weeklyWindows(now);
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toEqual({ startDate: "2026-11-02", start: new Date("2026-11-02T08:00:00Z"), end: now });
    expect(weeks.at(-2).end - weeks.at(-2).start).toBe(169 * 3_600_000);
    for (let i = 1; i < weeks.length; i++) expect(weeks[i].start).toEqual(weeks[i - 1].end);
  });

  it("counts each stage only among current cleaners who reached the previous stage", () => {
    const cleaners = [
      { id: "one", active: true, hubAccess: true, lastActivityAt: daysAgo(30) },
      { id: "two", active: true, hubAccess: true, lastActivityAt: daysAgo(0) },
      { id: "old", active: true, hubAccess: true, lastActivityAt: daysAgo(31) },
      { id: "future", active: true, hubAccess: true, lastActivityAt: daysAgo(-1) },
      { id: "unlinked", active: true, hubAccess: false, lastActivityAt: daysAgo(2) },
      { id: "archived", active: false, hubAccess: true, lastActivityAt: daysAgo(1) },
    ];
    expect(adoptionFunnel(cleaners, new Set(["one", "old", "unlinked", "archived"]), window))
      .toEqual({ profiles: 5, hubAccess: 4, active30d: 2, submitted30d: 1 });
  });

  it("flags only available offers waiting strictly longer than 24 hours", () => {
    const dayAgo = now.getTime() - day;
    expect(offerWaitingTooLong(dayAgo - 1, now)).toBe(true);
    expect(offerWaitingTooLong(dayAgo, now)).toBe(false);
    expect(offerWaitingTooLong(now.getTime(), now)).toBe(false);
    expect(offerWaitingTooLong(undefined, now)).toBe(false);
  });

  it("requires a full week of known inactivity and a minimum of ten notification outcomes", () => {
    expect(attentionReasons({ lastActivityAt: daysAgo(7), health: "errors", attempts: 10,
      failed: 1, oldOffers: 1, oldIssues: 1 }, now)).toEqual(["inactive", "errors", "notificationFailures", "oldOffers", "oldIssues"]);
    expect(attentionReasons({ lastActivityAt: daysAgo(6.9), createdAt: daysAgo(90), health: "ok",
      attempts: 9, failed: 2 }, now)).toEqual([]);
    expect(attentionReasons({ createdAt: daysAgo(8), health: "slow", attempts: 11, failed: 1 }, now)).toEqual(["inactive", "slow"]);
    expect(attentionReasons({ createdAt: null, lastActivityAt: null, health: "no-data" }, now)).toEqual([]);
  });
});
