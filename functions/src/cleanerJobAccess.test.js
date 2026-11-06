import { describe, expect, it } from "vitest";
import { accessWindow, operatingDate, projectCleanerJobAccess } from "./cleanerJobAccess.js";

const noonLa = (date) => Date.parse(`${date}T20:00:00Z`);
const job = (extra = {}) => ({ schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana"], scheduledDate: "2026-11-10", ...extra });
const property = (access = {}) => ({
  address: "123 Example St", cleanerInstructions: "Leave towels folded.", keyCodeInfo: "private-internal-code",
  accessInstructions: "private-internal-note", cleanerAccess: { shared: true, door: "4321", parking: "Spot 2", ...access },
});

describe("FB01 cleaner job access", () => {
  it("shows only explicitly shared details to the cleaner on the Job, inside the window", () => {
    const result = projectCleanerJobAccess({ job: job(), property: property(), cleanerId: "ana", nowMs: noonLa("2026-11-10") });
    expect(result).toEqual({
      state: "available", address: "123 Example St", houseInstructions: "Leave towels folded.",
      items: [{ kind: "door", value: "4321" }, { kind: "parking", value: "Spot 2" }],
    });
    expect(JSON.stringify(result)).not.toMatch(/private-internal/);
  });

  it("opens the day before, closes after the service day, and stays open while in progress", () => {
    expect(projectCleanerJobAccess({ job: job(), property: property(), cleanerId: "ana", nowMs: noonLa("2026-11-09") }).state).toBe("available");
    const early = projectCleanerJobAccess({ job: job(), property: property(), cleanerId: "ana", nowMs: noonLa("2026-11-07") });
    // Midnight in Los Angeles (PST, UTC-8) on the day before.
    expect(early).toEqual({ state: "not-yet", availableFromMs: Date.parse("2026-11-09T08:00:00Z") });
    expect(projectCleanerJobAccess({ job: job(), property: property(), cleanerId: "ana", nowMs: noonLa("2026-11-11") }).state).toBe("revoked");
    expect(projectCleanerJobAccess({ job: job({ operationalStatus: "IN_PROGRESS" }), property: property(), cleanerId: "ana", nowMs: noonLa("2026-11-12") }).state).toBe("available");
    expect(accessWindow(job({ scheduledDate: null }), noonLa("2026-11-10"))).toEqual({ open: false });
    expect(operatingDate(Date.parse("2026-11-10T06:00:00Z"))).toBe("2026-11-09");
  });

  it("denies other cleaners, removed cleaners, closed Jobs and unshared properties", () => {
    const now = noonLa("2026-11-10");
    expect(projectCleanerJobAccess({ job: job(), property: property(), cleanerId: "bia", nowMs: now }).state).toBe("revoked");
    expect(projectCleanerJobAccess({ job: job({ assignedCleanerIds: [] }), property: property(), cleanerId: "ana", nowMs: now }).state).toBe("revoked");
    expect(projectCleanerJobAccess({ job: job({ operationalStatus: "COMPLETED" }), property: property(), cleanerId: "ana", nowMs: now }).state).toBe("revoked");
    expect(projectCleanerJobAccess({ job: job({ archivedAt: {} }), property: property(), cleanerId: "ana", nowMs: now }).state).toBe("revoked");
    expect(projectCleanerJobAccess({ job: job(), property: property({ shared: false }), cleanerId: "ana", nowMs: now }).state).toBe("not-provided");
    expect(projectCleanerJobAccess({ job: job(), property: { keyCodeInfo: "private" }, cleanerId: "ana", nowMs: now }).state).toBe("not-provided");
  });
});
