import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { clientPortalAccessState, projectClientPortal } from "./clientPortalService.js";

const today = "2026-11-11";
const property = (id, name, extra = {}) => ({
  id, name, clientId: "client-a", address: "1 Private Road", accessInstructions: "gate code 4821", keyCodeInfo: "lockbox 77", ...extra,
});
const job = (id, scheduledDate, extra = {}) => ({
  id, propertyId: "p1", clientId: "client-a", scheduledDate, scheduledStart: "09:00", operationalStatus: "ASSIGNED",
  assignedCleanerName: "Private Cleaner", assignedCleanerId: "cleaner-1", clientPrice: 400, cleanerPay: 150,
  managerNotes: "internal note", ...extra,
});

function project(overrides = {}) {
  return projectClientPortal({
    client: { name: "  Owner Example  ", email: "owner@example.test", phone: "+15555550100", notes: "private client note" },
    properties: [property("p1", "Seaside House"), property("p2", "Archived Flat", { archivedAt: {} })],
    jobs: [
      job("coming-late", "2026-11-20"), job("coming-soon", "2026-11-12", { scheduledStart: "14:30" }),
      job("today-done", today, { operationalStatus: "COMPLETED" }), job("past-released", "2026-11-03", { operationalStatus: "COMPLETED" }),
      job("past-private", "2026-11-01", { operationalStatus: "COMPLETED" }), job("cancelled", "2026-11-15", { archivedAt: {} }),
      job("other-property", "2026-11-16", { propertyId: "p2" }), job("bad-date", "soon"),
    ],
    releasedJobIds: new Set(["past-released", "today-done", "cancelled"]),
    today,
    ...overrides,
  });
}

describe("client portal projection", () => {
  it("lists the client's own properties, coming cleanings in order and released reports only", () => {
    const portal = project();
    expect(portal.clientName).toBe("Owner Example");
    expect(portal.properties).toEqual([{ id: "p1", name: "Seaside House" }]);
    expect(portal.coming).toEqual([
      { propertyId: "p1", propertyName: "Seaside House", date: "2026-11-12", start: "14:30" },
      { propertyId: "p1", propertyName: "Seaside House", date: "2026-11-20", start: "09:00" },
    ]);
    expect(portal.reports.map((report) => report.jobId)).toEqual(["today-done", "past-released"]);
  });

  it("never carries cleaner names, access instructions, prices, contact details or internal notes", () => {
    const serialized = JSON.stringify(project());
    for (const secret of ["Private Cleaner", "cleaner-1", "4821", "lockbox", "Private Road", "400", "150", "internal note",
      "owner@example.test", "5555550100", "private client note"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(Object.keys(project().reports[0]).sort()).toEqual(["date", "jobId", "propertyId", "propertyName", "start"]);
  });

  it("shows nothing as released unless the manager released it", () => {
    expect(project({ releasedJobIds: new Set() }).reports).toEqual([]);
  });
});

describe("client portal link state", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const at = (iso) => Timestamp.fromDate(new Date(iso));
  it("distinguishes on, expired, turned off and missing links", () => {
    expect(clientPortalAccessState(undefined, now)).toBe("NONE");
    expect(clientPortalAccessState({ status: "ACTIVE", expiresAt: at("2026-12-01T00:00:00Z") }, now)).toBe("ACTIVE");
    expect(clientPortalAccessState({ status: "ACTIVE", expiresAt: at("2026-11-01T00:00:00Z") }, now)).toBe("EXPIRED");
    expect(clientPortalAccessState({ status: "REVOKED", expiresAt: at("2026-12-01T00:00:00Z") }, now)).toBe("REVOKED");
    expect(clientPortalAccessState({ status: "ACTIVE" }, now)).toBe("UNAVAILABLE");
  });
});
