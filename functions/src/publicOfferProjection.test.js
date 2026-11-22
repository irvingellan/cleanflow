import { describe, expect, it } from "vitest";
import { publicOfferResult } from "./handlers/publicOffer.js";

function availableOffer() {
  return {
    status: "PENDING",
    publicOfferExpiresAt: {
      toMillis: () => Date.now() + 60_000,
    },
  };
}

describe("public offer projection", () => {

  it("offers explicit confirmation without exposing operational or access fields, and closes filled links", () => {
    const job = {
      schemaVersion: 2,
      operationalStatus: "OFFERED",
      offerDistributionMode: "FIRST_ACCEPT_WINS",
      assignedCleanerIds: [],
      checklistContextRevision: 1,
      propertyName: "Example property",
      clientPrice: 398, cleanerPayout: 290, accessInstructions: "private marker",
      scheduledDate: "2026-11-05",
    };
    const offer = {
      ...availableOffer(),
      offerDistributionMode: "FIRST_ACCEPT_WINS",
      offeredChecklistContextRevision: 1,
    };

    expect(publicOfferResult(offer, job)).toEqual({
      state: "available", offer: { offerDistributionMode: "FIRST_ACCEPT_WINS", confirmationMode: "FIRST_ACCEPT_WINS",
        propertyName: "Example property", scheduledDate: "2026-11-05", scheduledStart: null, status: "PENDING",
        scheduleRevision: 0, offeredCompensation: null, preferredLanguage: "en" },
    });
    expect(publicOfferResult(offer, { ...job, checklistContextRevision: 2 })).toEqual({ state: "unavailable" });
    expect(publicOfferResult(offer, {
      ...job, operationalStatus: "ASSIGNED", assignedCleanerIds: ["private-cleaner-id"], offerDistributionClosedAt: {},
    })).toEqual({ state: "already-taken" });
    expect(publicOfferResult(availableOffer(), job)).toEqual({ state: "unavailable" });
  });

  it("keeps prior manual interest and allows explicit confirmation for a team, while a singular invitation stays manual", () => {
    const job = { schemaVersion: 2, assignedCleanerIds: [], operationalStatus: "OFFERED", scheduleRevision: 4 };
    const offer = { ...availableOffer(), cleanerId: "own", status: "INTERESTED", offeredCompensation: 81 };
    expect(publicOfferResult(offer, job).offer).not.toHaveProperty("confirmationMode");
    expect(publicOfferResult(offer, { ...job, requiredCleanerCount: 3 }).offer).toMatchObject({
      confirmationMode: "FIRST_ACCEPT_WINS", scheduleRevision: 4, status: "INTERESTED", offeredCompensation: 81,
    });
    expect(publicOfferResult(offer, job, { manualConfirmation: true }).offer.confirmationMode).toBe("FIRST_ACCEPT_WINS");
    expect(publicOfferResult({ ...offer, revokedAt: {} }, job)).toEqual({ state: "unavailable" });
  });

  it.each([
    ["legacy", { operationalStatus: "OFFERED" }],
    ["v2 offered", { schemaVersion: 2, operationalStatus: "OFFERED" }],
    ["v2 assigned", { schemaVersion: 2, operationalStatus: "ASSIGNED" }],
  ])("makes an archived %s Job unavailable without changing its Offer or Job", (_label, activeJob) => {
    const offer = availableOffer();
    const job = { ...activeJob, archivedAt: { seconds: 1 } };
    const beforeOffer = { ...offer };
    const beforeJob = { ...job };

    expect(publicOfferResult(offer, job)).toEqual({ state: "unavailable" });
    expect(offer).toEqual(beforeOffer);
    expect(job).toEqual(beforeJob);
    expect(publicOfferResult(offer, activeJob).state).toBe("available");
  });

  it("preserves expired-link precedence even when its Job is archived", () => {
    expect(publicOfferResult({
      ...availableOffer(),
      publicOfferExpiresAt: { toMillis: () => 0 },
    }, {
      schemaVersion: 2,
      operationalStatus: "OFFERED",
      archivedAt: { seconds: 1 },
    })).toEqual({ state: "expired" });
  });

  it("keeps the legacy singular-Job fallback for Offers created before amount snapshots", () => {
    const result = publicOfferResult(availableOffer(), {
      operationalStatus: "OFFERED",
      cleanerPayout: 150,
    }, { cleanerPreferredLanguage: "pt" });

    expect(result.offer).toMatchObject({
      offeredCompensation: 150,
      cleanerPayout: 150,
      preferredLanguage: "pt",
      status: "PENDING",
    });
  });

  it("projects just the recipient's conditional or assigned cents for a frozen fixed offer", () => {
    const offer = { ...availableOffer(), cleanerId: "b", offeredCompensation: 9.99, offeredFirstSlotExtraCents: 2 };
    const job = { schemaVersion: 2, operationalStatus: "OFFERED", requiredCleanerCount: 3, cleanerPayout: 900, clientPrice: 1200 };
    expect(publicOfferResult(offer, job).offer).toMatchObject({ offeredCompensation: 9.99, offeredFirstSlotExtraCents: 2 });
    const assigned = publicOfferResult({ ...offer, status: "INTERESTED" }, { ...job, operationalStatus: "ASSIGNED", assignedCleanerIds: ["b", "c"] }).offer;
    expect(assigned.offeredCompensation).toBe(10.01);
    for (const field of ["offeredFirstSlotExtraCents", "cleanerPayout", "clientPrice", "assignedCleanerIds"]) expect(assigned).not.toHaveProperty(field);
    expect(publicOfferResult(offer, { ...job, assignedCleanerIds: ["a"] }).offer).not.toHaveProperty("offeredFirstSlotExtraCents");
  });

  it("projects only the recipient's snapshotted hourly rate", () => {
    const job = { schemaVersion: 2, operationalStatus: "OFFERED", pay: { mode: "HOURLY", rateCents: 9999 } };
    const offer = { ...availableOffer(), offeredPay: { mode: "HOURLY", rateCents: 3125, internal: "private" } };
    const result = publicOfferResult(offer, job);
    expect(result.offer.offeredPay).toEqual({ mode: "HOURLY", rateCents: 3125 });
    expect(result.offer).not.toHaveProperty("offeredCompensation");
    expect(result.offer).not.toHaveProperty("pay");
    expect(publicOfferResult({ ...offer, offeredPay: { mode: "HOURLY", rateCents: -1 } }, job).offer)
      .toMatchObject({ offeredCompensation: null });
  });

  it("uses the v2 per-Offer snapshot and excludes Job prices, margin, and team fields", () => {
    const snapshotted = publicOfferResult({
      ...availableOffer(),
      cleanerId: "cleaner-a",
      status: "INTERESTED",
      offeredCompensation: 125,
    }, {
      schemaVersion: 2,
      operationalStatus: "ASSIGNED",
      propertyName: "Safe Property",
      scheduledDate: "2026-09-01",
      cleanerPayout: 500,
      clientPrice: 300,
      notes: "Manager-only note",
      assignedCleanerIds: ["cleaner-a", "cleaner-b"],
    }, {
      assignmentAcknowledgment: "AWAITING_CONFIRMATION",
    });

    expect(snapshotted.offer).toMatchObject({
      propertyName: "Safe Property",
      offeredCompensation: 125,
      status: "INTERESTED",
      assignmentAcknowledgment: "AWAITING_CONFIRMATION",
    });
    expect(snapshotted.offer).not.toHaveProperty("cleanerPayout");
    expect(snapshotted.offer).not.toHaveProperty("clientPrice");
    expect(snapshotted.offer).not.toHaveProperty("grossMargin");
    expect(snapshotted.offer).not.toHaveProperty("assignedCleanerIds");
    expect(snapshotted.offer).not.toHaveProperty("notes");
    expect(Object.keys(snapshotted.offer).sort()).toEqual([
      "assignmentAcknowledgment",
      "offeredCompensation",
      "preferredLanguage",
      "propertyName",
      "scheduledDate",
      "scheduledStart",
      "status",
    ].sort());
  });

  it.each([
    ["en", "en"],
    ["pt", "pt"],
    ["es", "es"],
    [undefined, "en"],
    ["fr", "en"],
  ])("allowlists the public cleaner language and falls back to English for %s", (language, expected) => {
    const result = publicOfferResult(availableOffer(), {
      operationalStatus: "OFFERED",
    }, { cleanerPreferredLanguage: language });

    expect(result.offer.preferredLanguage).toBe(expected);
    expect(result.offer).not.toHaveProperty("cleanerId");
    expect(result.offer).not.toHaveProperty("phone");
    expect(result.offer).not.toHaveProperty("email");
  });

  it("shows an explicit unset amount for v2 Offers instead of treating a Job total as per-cleaner pay", () => {
    const result = publicOfferResult(availableOffer(), {
      schemaVersion: 2,
      operationalStatus: "ASSIGNED",
      cleanerPayout: 500,
      clientPrice: 900,
    });

    expect(result.offer.offeredCompensation).toBeNull();
    expect(result.offer).not.toHaveProperty("cleanerPayout");
    expect(result.offer).not.toHaveProperty("clientPrice");
  });

  it("lets an explicit unset Offer snapshot suppress the legacy fallback", () => {
    const result = publicOfferResult({
      ...availableOffer(),
      offeredCompensation: null,
    }, {
      operationalStatus: "OFFERED",
      cleanerPayout: 150,
    });

    expect(result.offer.offeredCompensation).toBeNull();
    expect(result.offer.cleanerPayout).toBeNull();
  });

  it("keeps a v2 public offer unavailable after work starts", () => {
    expect(
      publicOfferResult(availableOffer(), {
        schemaVersion: 2,
        operationalStatus: "IN_PROGRESS",
      }),
    ).toEqual({ state: "unavailable" });
  });

  it("FB08: a filled manual Job closes other invitations without naming who was chosen", () => {
    const job = { schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["private-chosen-id"], propertyName: "House" };
    expect(publicOfferResult({ ...availableOffer(), cleanerId: "other" }, job)).toEqual({ state: "already-taken" });
    expect(publicOfferResult({ ...availableOffer(), cleanerId: "private-chosen-id" }, job).state).toBe("available");
    expect(publicOfferResult({ ...availableOffer(), cleanerId: "other" }, { ...job, requiredCleanerCount: 2 }).state).toBe("available");
    expect(publicOfferResult({ ...availableOffer(), cleanerId: "other", managerDecision: "WITHDRAWN" },
      { ...job, requiredCleanerCount: 2 })).toEqual({ state: "unavailable" });
    expect(publicOfferResult({ ...availableOffer(), cleanerId: "other" }, { ...job, operationalStatus: "IN_PROGRESS" }))
      .toEqual({ state: "unavailable" });
  });
});
