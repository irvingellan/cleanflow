import { describe, it, expect } from "vitest";
import { reviewRequest, reviewCandidate } from "./reservationReviewService.js";
import { buildSyntheticReservationState } from "./syntheticReservationFixtures.js";
import { sanitizeInboxSnapshot } from "./reservationInboxService.js";
describe("review request boundary", () => {
  it("keeps safe source identity, strips shadow extras and preserves unresolved conflict", async () => {
    const state = await buildSyntheticReservationState();
    const row = sanitizeInboxSnapshot({ candidates: Object.values(state.candidates) })[0];
    const request = reviewRequest({ ...row, secret: "forbidden", conflict: { reason: "ORDER_UNPROVEN" } }, "READ");
    expect(request.signal).toBe("CONFLICT");
    expect(request.observation.sourceEventUid).toBeTruthy();
    expect(JSON.stringify(request)).not.toContain("forbidden");
  });
  it("test/Production mode cannot call operational promotion", async () => {
    await expect(reviewCandidate({}, "PROMOTE", {})).rejects.toThrow("REVIEW_ENVIRONMENT_DENIED");
  });
  it("shadow observed/changed audit and first-observed survive newer observations", async () => {
    const state = await buildSyntheticReservationState();
    expect(state.audit.some(event => event.operation === "OBSERVED")).toBe(true);
    expect(state.audit.some(event => event.operation === "CHANGED")).toBe(true);
    const changed = Object.values(state.candidates).find(row => row.changeType === "DATES_CHANGED");
    expect(changed.firstObservedAt).toBe("2026-10-04T12:00:00.000Z");
    expect(changed.observedAt).toBe("2026-10-04T16:00:00.000Z");
  });
});
