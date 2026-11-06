import { describe, expect, it } from "vitest";
import * as client from "./offerSlots.js";
import * as server from "../../../functions/src/offerSlots.js";

const job = (extra = {}) => ({ schemaVersion: 2, operationalStatus: "OFFERED", assignedCleanerIds: [], ...extra });

describe.each([["client", client], ["server", server]])("offer spots (%s copy)", (_, slots) => {
  it("defaults to one spot and closes other invitations once it is filled", () => {
    expect(slots.requiredCleanerCount(job())).toBe(1);
    expect(slots.manualOfferAvailability(job(), { cleanerId: "b" })).toBe("open");
    const filled = job({ operationalStatus: "ASSIGNED", assignedCleanerIds: ["a"] });
    expect(slots.isJobFilled(filled)).toBe(true);
    expect(slots.manualOfferAvailability(filled, { cleanerId: "a" })).toBe("assigned");
    expect(slots.manualOfferAvailability(filled, { cleanerId: "b" })).toBe("filled");
  });

  it("keeps remaining spots open on a team Job and ignores invalid counts", () => {
    const team = job({ requiredCleanerCount: 2, assignedCleanerIds: ["a"] });
    expect(slots.openSpots(team)).toBe(1);
    expect(slots.manualOfferAvailability(team, { cleanerId: "b" })).toBe("open");
    for (const value of [0, -1, 1.5, "2", 11, null]) expect(slots.requiredCleanerCount(job({ requiredCleanerCount: value }))).toBe(1);
    expect(slots.isJobFilled(job({ requiredCleanerCount: 2, assignedCleanerIds: ["a", "a"] }))).toBe(false);
  });

  it("treats a manager decision as closed until reopened, and legacy single-cleaner Jobs by their field", () => {
    expect(slots.manualOfferAvailability(job(), { cleanerId: "b", managerDecision: "NOT_SELECTED" })).toBe("closed");
    expect(slots.manualOfferAvailability(job(), { cleanerId: "b", managerDecision: "WITHDRAWN" })).toBe("closed");
    expect(slots.manualOfferAvailability(job(), { cleanerId: "b", managerDecision: null })).toBe("open");
    expect(slots.manualOfferAvailability(job(), { cleanerId: "b", managerDecision: "OTHER" })).toBe("open");
    expect(slots.rosterCleanerIds({ assignedCleanerId: "legacy" })).toEqual(["legacy"]);
  });
});
