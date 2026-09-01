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
  it("keeps legacy cleaner payout disclosure for the existing singular Job contract", () => {
    const result = publicOfferResult(availableOffer(), {
      operationalStatus: "OFFERED",
      cleanerPayout: 150,
    });

    expect(result.offer).toMatchObject({ cleanerPayout: 150, status: "PENDING" });
  });

  it("omits v2 financial and team fields from the public offer projection", () => {
    const result = publicOfferResult(availableOffer(), {
      schemaVersion: 2,
      operationalStatus: "ASSIGNED",
      propertyName: "Safe Property",
      scheduledDate: "2026-09-01",
      cleanerPayout: 150,
      clientPrice: 300,
      notes: "Manager-only note",
      assignedCleanerIds: ["cleaner-a", "cleaner-b"],
    });

    expect(result).toEqual({
      state: "available",
      offer: {
        propertyName: "Safe Property",
        scheduledDate: "2026-09-01",
        scheduledStart: null,
        status: "PENDING",
      },
    });
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
