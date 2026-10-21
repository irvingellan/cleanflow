import { describe, expect, it } from "vitest";
import { workspaceV3Enabled, laDateKey, rangeFor, shiftRange, inRange } from "./workspaceV3Model.js";

describe("workspace is presentation opt-in, never authorization", () => {
  it.each(["production", "unknown", "test"])("cannot activate in %s even with an authorized query", mode => {
    expect(workspaceV3Enabled({ mode, authorized: true, search: "?workspace=v3" })).toBe(false);
  });
  it.each(["sandbox", "emulator"])("requires explicit authorized opt-in in %s", mode => {
    expect(workspaceV3Enabled({ mode, authorized: true, search: "?workspace=v3" })).toBe(true);
    expect(workspaceV3Enabled({ mode, authorized: false, search: "?workspace=v3" })).toBe(false);
    expect(workspaceV3Enabled({ mode, authorized: true, search: "?experience=v2" })).toBe(false);
  });
});
describe("Los Angeles calendar-day navigation", () => {
  it.each([
    ["2026-03-08T07:59:59Z", "2026-03-07"], ["2026-03-08T10:01:00Z", "2026-03-08"],
    ["2026-11-01T08:30:00Z", "2026-11-01"], ["2026-11-01T09:30:00Z", "2026-11-01"],
    ["2026-10-22T06:59:59Z", "2026-10-21"], ["2026-10-22T07:00:00Z", "2026-10-22"],
  ])("resolves %s independently of browser timezone", (instant, key) => expect(laDateKey(new Date(instant))).toBe(key));
  it("uses Monday–Sunday including a Sunday anchor", () => {
    expect(rangeFor("week", "2026-11-01", "2026-11-01")).toMatchObject({ start: "2026-10-26", end: "2026-11-01" });
    expect(rangeFor("week", "2026-11-02", "2026-11-01")).toMatchObject({ start: "2026-11-02", end: "2026-11-08" });
  });
  it.each(["2026-03-08", "2026-11-01", "2026-12-31"])("moves calendar days across %s", day => {
    const wants = { "2026-03-08": "2026-03-09", "2026-11-01": "2026-11-02", "2026-12-31": "2027-01-01" };
    expect(shiftRange(rangeFor("today", day, day), 1, day).start).toBe(wants[day]);
  });
  it("moves a full calendar week", () => {
    const range = rangeFor("week", "2026-10-21", "2026-10-21");
    expect(shiftRange(range, -1, "2026-10-21")).toMatchObject({ start: "2026-10-12", end: "2026-10-18" });
  });
  it("includes both date boundaries and rejects missing/malformed dates", () => {
    const r = rangeFor("week", "2026-10-21", "2026-10-21");
    expect(inRange("2026-10-19", r)).toBe(true); expect(inRange("2026-10-25", r)).toBe(true);
    for (const date of ["2026-10-18", "2026-10-26", "2026-02-30", "", null, undefined]) expect(inRange(date, r)).toBe(false);
  });
});
