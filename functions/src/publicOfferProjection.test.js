import { describe, expect, it } from "vitest";
import { publicOfferResult } from "./index.js";

function availableOffer() {
  return {
    status: "PENDING",
    publicOfferExpiresAt: {
      toMillis: () => Date.now() + 60_000,
    },
  };
}

describe("public offer projection", () => {
  it("keeps the legacy singular-Job fallback for Offers created before amount snapshots", () => {
    const result = publicOfferResult(availableOffer(), {
      operationalStatus: "OFFERED",
      cleanerPayout: 150,
    });

    expect(result.offer).toMatchObject({
      offeredCompensation: 150,
      cleanerPayout: 150,
      status: "PENDING",
    });
  });

  it("uses the v2 per-Offer snapshot and excludes Job prices, margin, and team fields", () => {
    const snapshotted = publicOfferResult({
      ...availableOffer(),
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
    });

    expect(snapshotted.offer).toMatchObject({
      propertyName: "Safe Property",
      offeredCompensation: 125,
      status: "PENDING",
    });
    expect(snapshotted.offer).not.toHaveProperty("cleanerPayout");
    expect(snapshotted.offer).not.toHaveProperty("clientPrice");
    expect(snapshotted.offer).not.toHaveProperty("grossMargin");
    expect(snapshotted.offer).not.toHaveProperty("assignedCleanerIds");
    expect(snapshotted.offer).not.toHaveProperty("notes");
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
});
