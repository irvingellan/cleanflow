import { describe, it, expect } from "vitest";
import { reviewReservationIntake, assertIntakeReviewEnvironment } from "./reservationIntakeReviewService.js";
import { normalizeReservationObservation } from "./reservationIntake/reservationNormalizer.js";

// Serialized transactions model retries; the separate emulator test proves Firestore atomicity.
function fixture() {
  const records = new Map([["organizations/demo-org/members/manager", { active: true, role: "MANAGER" }],
    ["organizations/demo-org/properties/house", { active: true, name: "Synthetic house" }]]);
  const doc = path => ({ path, id: path.split("/").at(-1), get: async () => snap(path), collection: name => ({ doc: id => doc(`${path}/${name}/${id}`) }) });
  const snap = path => ({ exists: records.has(path), data: () => records.get(path) });
  let tail = Promise.resolve();
  const database = { projectId: "clean-flow-sandbox-irving", doc, runTransaction(operation) {
    const result = tail.then(async () => {
      const writes = [];
      const result = await operation({ get: async ref => snap(ref.path), set: (ref, data) => writes.push([ref.path, data]),
        create: (ref, data) => { if (records.has(ref.path)) throw new Error("duplicate"); writes.push([ref.path, data]); } });
      writes.forEach(([path, data]) => records.set(path, data)); return result;
    }); tail = result.catch(() => {}); return result;
  } };
  const observation = { sourceProvider: "HOSPITABLE", sourceType: "ICAL", sourceId: "synthetic-feed", sourceListingExternalId: "listing",
    sourceEventUid: "event", checkIn: "2026-10-10", checkOut: "2026-10-12", observedAt: "2026-10-05T12:00:00Z" };
  const request = async (operation, extra = {}) => {
    const value = extra.observation || observation;
    const candidate = await normalizeReservationObservation(value, { organizationId: "demo-org" });
    return reviewReservationIntake(database, { auth: { uid: "manager", token: {} }, data: {
      operation, candidateId: candidate.id, observation: value, signal: "NEW", ...extra,
    } }, "demo-org");
  };
  return { database, records, observation, request, reservations: () => [...records].filter(([key]) => key.includes("/reservations/")) };
}
describe("human reservation review gate", () => {
  it("requires explicit property selection and confirmation; unresolved/ambiguous candidates fail closed", async () => {
    const f = fixture();
    await expect(f.request("PROMOTE", { expectedRevision: 0, confirmed: true })).rejects.toMatchObject({ details: { reason: "property-unresolved" } });
    await f.request("RESOLVE", { expectedRevision: 0, propertyId: "house" });
    await expect(f.request("PROMOTE", { expectedRevision: 1 })).rejects.toMatchObject({ details: { reason: "human-confirmation-required" } });
    expect(f.reservations()).toHaveLength(0);
  });
  it("promotes once across concurrent requests/retry/reload and never creates a Job", async () => {
    const f = fixture(); await f.request("RESOLVE", { expectedRevision: 0, propertyId: "house" });
    const results = await Promise.all([1, 2, 3].map(() => f.request("PROMOTE", { expectedRevision: 1, confirmed: true })));
    expect(new Set(results.map(result => result.reservationId)).size).toBe(1);
    expect(f.reservations()).toHaveLength(1);
    expect((await f.request("READ")).state).toBe("PROMOTED");
    expect([...f.records.keys()].some(key => key.includes("/jobs/"))).toBe(false);
    expect(f.reservations()[0][1].intakeProvenance.humanApproved).toBe(true);
    expect([...f.records.keys()].filter(key => key.includes("/history/"))).toHaveLength(2);
  });
  it.each(["DATES_CHANGED", "SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED", "STATUS_CHANGED"])("%s only surfaces discrepancies after promotion", async signal => {
    const f = fixture(); await f.request("RESOLVE", { expectedRevision: 0, propertyId: "house" });
    await f.request("PROMOTE", { expectedRevision: 1, confirmed: true });
    const before = JSON.stringify(f.reservations());
    const observation = { ...f.observation, ...(signal === "DATES_CHANGED" ? { checkOut: "2026-10-13" } : {}),
      ...(signal === "STATUS_CHANGED" ? { sourceReservationStatus: "CANCELLED" } : {}) };
    expect((await f.request("READ", { observation, signal })).discrepancy.reviewRequired).toBe(true);
    expect(JSON.stringify(f.reservations())).toBe(before);
  });
  it("ignored decisions survive reload and cannot promote", async () => {
    const f = fixture(); await f.request("IGNORE", { expectedRevision: 0 });
    expect((await f.request("READ")).state).toBe("IGNORED");
    await expect(f.request("PROMOTE", { expectedRevision: 1, confirmed: true })).rejects.toMatchObject({ details: { reason: "ignored" } });
  });
  it("requires re-review when observation changes before approval", async () => {
    const f = fixture(); await f.request("RESOLVE", { expectedRevision: 0, propertyId: "house" });
    await expect(f.request("PROMOTE", { expectedRevision: 1, confirmed: true, observation: { ...f.observation, timezone: "America/Los_Angeles" } }))
      .rejects.toMatchObject({ details: { reason: "observation-changed-review-again" } });
  });
  it("rejects malformed observations, cancelled sources and unavailable properties", async () => {
    const f = fixture();
    await expect(f.request("READ", { observation: { ...f.observation, secret: "forbidden" } })).rejects.toThrow();
    await expect(f.request("RESOLVE", { expectedRevision: 0, propertyId: "missing" })).rejects.toMatchObject({ details: { reason: "property-unavailable" } });
    await f.request("RESOLVE", { expectedRevision: 0, propertyId: "house" });
    await expect(f.request("PROMOTE", { expectedRevision: 1, confirmed: true, signal: "POSSIBLE_CANCELLED" }))
      .rejects.toMatchObject({ details: { reason: "external-state-needs-review" } });
  });
  it("blocks Production and unknown projects before reads and anonymous/non-manager access", async () => {
    for (const projectId of ["clean-flow-prototipo", "unknown"]) expect(() => assertIntakeReviewEnvironment({ projectId })).toThrow();
    const f = fixture(); f.records.delete("organizations/demo-org/members/manager");
    await expect(f.request("READ")).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("rechecks archived Property and stale decision revisions", async () => {
    const f = fixture(); await f.request("RESOLVE", { expectedRevision: 0, propertyId: "house" });
    await expect(f.request("IGNORE", { expectedRevision: 0 })).rejects.toMatchObject({ details: { reason: "review-changed-reload" } });
    f.records.get("organizations/demo-org/properties/house").archivedAt = "synthetic-archive";
    await expect(f.request("PROMOTE", { expectedRevision: 1, confirmed: true })).rejects.toMatchObject({ details: { reason: "property-unavailable" } });
    expect(f.reservations()).toHaveLength(0);
  });
  it("fallback fingerprints never become operational Reservations", async () => {
    const f = fixture(), observation = { ...f.observation, sourceEventUid: null };
    await f.request("RESOLVE", { observation, expectedRevision: 0, propertyId: "house" });
    await expect(f.request("PROMOTE", { observation, expectedRevision: 1, confirmed: true })).rejects.toMatchObject({ details: { reason: "insufficient-stay-evidence" } });
  });
  it("common source account dedupes alias candidates but conflicting values fail closed", async () => {
    const f = fixture(); f.observation.sourceAccountExternalId = "synthetic-account";
    await f.request("RESOLVE", { expectedRevision: 0, propertyId: "house" });
    await f.request("PROMOTE", { expectedRevision: 1, confirmed: true });
    const alias = { ...f.observation, sourceId: "synthetic-alias" };
    await f.request("RESOLVE", { observation: alias, expectedRevision: 0, propertyId: "house" });
    await f.request("PROMOTE", { observation: alias, expectedRevision: 1, confirmed: true });
    expect(f.reservations()).toHaveLength(1);
    const conflict = { ...alias, sourceId: "synthetic-conflict", checkOut: "2026-10-14" };
    await f.request("RESOLVE", { observation: conflict, expectedRevision: 0, propertyId: "house" });
    await expect(f.request("PROMOTE", { observation: conflict, expectedRevision: 1, confirmed: true })).rejects.toMatchObject({ details: { reason: "identity-observation-conflict" } });
    expect(f.reservations()).toHaveLength(1);
  });
});
