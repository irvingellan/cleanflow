import { describe, expect, it } from "vitest";
import { alertReadiness, alertSummary, buildAlertRows, isAlertEligible } from "./cleanerAlertsModel.js";

const on = { id: "c1", name: "Ana", pushAlertsEnabled: true };

describe("alertReadiness", () => {
  it("walks the activation steps in order", () => {
    expect(alertReadiness({ cleaner: on, access: { active: false } }).state).toBe("no-app");
    expect(alertReadiness({ cleaner: { ...on, pushAlertsEnabled: false }, access: { active: true } }).state).toBe("alerts-off");
    expect(alertReadiness({ cleaner: on, access: { active: true }, overview: { state: "ready", activeDevices: 0 } }).state).toBe("no-device");
    expect(alertReadiness({ cleaner: on, access: { active: true }, overview: { state: "ready", activeDevices: 2 } })).toEqual({ state: "ready", devices: 2 });
  });

  it("says unknown when the server cannot answer", () => {
    expect(alertReadiness({ cleaner: on, access: { active: true }, overview: { state: "unavailable" } }).state).toBe("unknown");
    expect(alertReadiness({ cleaner: on, access: { active: true }, overview: null }).state).toBe("unknown");
  });
});

describe("rows and summary", () => {
  it("puts cleaners who need action first and counts the ready ones", () => {
    const rows = buildAlertRows([
      { cleaner: { id: "a", name: "Zoe", pushAlertsEnabled: true }, access: { active: true }, overview: { state: "ready", activeDevices: 1 } },
      { cleaner: { id: "b", name: "Bia" }, access: { active: false } },
      { cleaner: { id: "c", name: "Ana", pushAlertsEnabled: true }, access: { active: true }, overview: { state: "ready", activeDevices: 0 } },
    ]);
    expect(rows.map((row) => [row.cleaner.name, row.state])).toEqual([["Bia", "no-app"], ["Ana", "no-device"], ["Zoe", "ready"]]);
    expect(alertSummary(rows)).toEqual({ total: 3, ready: 1 });
  });

  it("skips archived and inactive cleaners", () => {
    expect(isAlertEligible({ active: true })).toBe(true);
    expect(isAlertEligible({ active: false })).toBe(false);
    expect(isAlertEligible({ archivedAt: "2026-01-01" })).toBe(false);
  });
});
