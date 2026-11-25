import { describe, expect, it } from "vitest";
import { canRecordWorkedTime, roundedWorkedMinutes } from "./workedTime.js";
import { hourlyAmountCents } from "./hourlyAmount.js";

describe("worked time", () => {
  it.each([[1,0],[2,0],[3,5],[7,5],[8,10],[1439,1440],[1440,1440]])("rounds %i minutes to %i", (minutes, expected) => {
    expect(roundedWorkedMinutes({ minutes })).toBe(expected);
  });
  it("accepts overnight times, rejects ambiguous and out of range inputs", () => {
    expect(roundedWorkedMinutes({ start: "23:57", end: "00:05" })).toBe(10);
    for (const input of [{ minutes: 0 }, { minutes: 1441 }, { minutes: "5" },
      { start: "09:30", end: "09:30" }, { start: "09:00", end: "10:00", minutes: 60 }]) {
      expect(() => roundedWorkedMinutes(input)).toThrow();
    }
  });
  it("rounds pay in cents and accepts an explicitly approved zero", () => {
    expect(hourlyAmountCents(2201, 125)).toBe(4585);
    expect(hourlyAmountCents(2201, 0)).toBe(0);
    expect(hourlyAmountCents(0, 30)).toBe(0);
    expect(hourlyAmountCents(2201, -5)).toBeNull();
  });
  it("accepts a submitted checklist without waiting for job status to catch up", () => {
    expect(canRecordWorkedTime({ operationalStatus: "ASSIGNED" }, "READY_FOR_REVIEW")).toBe(true);
    expect(canRecordWorkedTime({ operationalStatus: "ASSIGNED" }, "DRAFT")).toBe(false);
    expect(canRecordWorkedTime({ operationalStatus: "CANCELLED" }, "READY_FOR_REVIEW")).toBe(false);
  });
});
