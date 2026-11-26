import { describe, expect, it } from "vitest";
import {
  buildWeeklyClose, previousServiceWeek, servicePeriod, serviceWeekForDate, shiftServiceWeek,
} from "./weeklyCloseModel.js";

const weekStart = "2026-09-21";
const job = (overrides = {}) => ({
  id: "job-1", organizationId: "cleanflow-demo", dataProvenance: "REAL",
  operationalStatus: "COMPLETED", scheduledDate: "2026-09-23",
  clientId: "client-1", clientName: "Harbor client", propertyId: "property-1",
  propertyName: "Garden cottage", assignedCleanerId: "cleaner-1",
  assignedCleanerName: "Demo cleaner", clientPrice: 200, cleanerPayout: 100,
  legacyPayoutEligible: true, ...overrides,
});
const paid = (overrides = {}) => ({
  id: "payout-1", organizationId: "cleanflow-demo", cleanerId: "cleaner-1",
  jobIds: ["job-1"], amount: 100, status: "PAID", paidAt: new Date("2026-09-24T12:00:00Z"),
  ...overrides,
});
const close = (jobs, options = {}) => buildWeeklyClose({ weekStart, jobs, ...options });

describe("weekly close service-week semantics", () => {
  it("uses Monday through Sunday, including a month/year boundary", () => {
    expect(serviceWeekForDate("2026-09-27")).toEqual({ start: "2026-09-21", end: "2026-09-27" });
    expect(serviceWeekForDate("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(shiftServiceWeek("2026-09-21", 1)).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });

  it("selects the previous Los Angeles service week, not the UTC week", () => {
    expect(previousServiceWeek(new Date("2026-09-28T02:00:00Z")))
      .toEqual({ start: "2026-09-14", end: "2026-09-20" });
    expect(previousServiceWeek(new Date("2026-09-28T08:00:00Z")))
      .toEqual({ start: "2026-09-21", end: "2026-09-27" });
  });

  it("rejects impossible/ambiguous dates and invalid offsets", () => {
    expect(() => serviceWeekForDate("2026-02-30")).toThrow(RangeError);
    expect(() => serviceWeekForDate("09/21/2026")).toThrow(RangeError);
    expect(() => shiftServiceWeek(weekStart, 0.5)).toThrow(RangeError);
    expect(() => previousServiceWeek(new Date("invalid"))).toThrow(RangeError);
  });

  it("selects scheduledDate inclusive, never substitutes completedAt", () => {
    const result = close([
      job({ id: "monday", scheduledDate: "2026-09-21", completedAt: new Date("2026-10-01") }),
      job({ id: "sunday", scheduledDate: "2026-09-27" }),
      job({ id: "before", scheduledDate: "2026-09-20" }),
      job({ id: "after", scheduledDate: "2026-09-28" }),
      job({ id: "invalid", scheduledDate: "2026-09-31" }),
    ]);
    expect(result.jobs.map((row) => row.id)).toEqual(["monday", "sunday"]);
    expect(result.excluded).toMatchObject({ outsideWeek: 2, invalidDate: 1 });
  });
});

describe("weekly close truthful financial projection", () => {
  it("counts missing margin inputs separately from non-monetary attention", () => {
    const result = close([
      job({ id: "missing-charge", clientPrice: undefined }),
      job({ id: "unknown-payment", schemaVersion: 2 }),
    ]);
    expect(result.overall.attentionCount).toBe(2);
    expect(result.overall.missingGrossMarginCount).toBe(1);
    expect(result.overall.knownGrossOperationalMargin).toBe(100);
    expect(result.overall.grossOperationalMargin).toBeNull();
    expect(result.clients[0].missingGrossMarginCount).toBe(1);
  });
  it("never merges identical client names with different IDs and flags inconsistent linkage", () => {
    const result = close([job(), job({ id: "other", clientId: "client-2" })], {
      clients: [{ id: "client-1", name: "Harbor client" }],
      properties: [{ id: "property-1", clientId: "client-1" }],
    });
    expect(result.clients).toHaveLength(2);
    expect(result.jobs.find(row => row.id === "other").attentionReasons).toEqual(expect.arrayContaining(["client_link_unresolved", "client_property_link_conflict"]));
    expect(result.overall.knownClientCharges).toBe(400);
  });
  it("includes only REAL completed nonarchived Jobs, without excluding archived Properties", () => {
    const result = close([
      job(), job({ id: "archive", archivedAt: new Date() }),
      job({ id: "pending", operationalStatus: "ASSIGNED" }),
      job({ id: "demo", dataProvenance: "DEMO" }), job({ id: "unknown", dataProvenance: undefined }),
      job({ id: "foreign", organizationId: "another-organization" }),
    ], { properties: [{ id: "property-1", archivedAt: new Date(), defaultClientPrice: 999 }] });
    expect(result.overall.completedServiceCount).toBe(1);
    expect(result.overall.clientCharges).toBe(200);
    expect(result.excluded).toMatchObject({ archived: 1, nonCompleted: 1, DEMO: 1, UNKNOWN: 1, foreignOrganization: 1 });
  });

  it("does not invent prices from current Property defaults", () => {
    const result = close([job({ clientPrice: undefined, cleanerPayout: undefined })], {
      properties: [{ id: "property-1", defaultClientPrice: 999, defaultCleanerPrice: 777 }],
    });
    expect(result.jobs[0]).toMatchObject({ clientCharge: null, cleanerPayout: null });
    expect(result.overall).toMatchObject({ clientCharges: null, cleanerPayoutTotal: null, grossOperationalMargin: null });
  });

  it("distinguishes legitimate zero from missing, negative, nonfinite and unsupported precision", () => {
    const result = close([
      job({ id: "zero", clientPrice: 0, cleanerPayout: 0, legacyPayoutEligible: false }),
      job({ id: "missing", clientPrice: "", cleanerPayout: undefined }),
      job({ id: "negative", clientPrice: -5, cleanerPayout: -1 }),
      job({ id: "precision", clientPrice: 1.001, cleanerPayout: Infinity }),
      job({ id: "numeric-string", clientPrice: "200", cleanerPayout: "100" }),
    ]);
    const byId = Object.fromEntries(result.jobs.map((row) => [row.id, row]));
    expect(byId.zero.clientCharge).toBe(0);
    expect(byId.zero.cleanerPayout).toBe(0);
    expect(byId.zero.attentionReasons).not.toContain("missing_client_price");
    expect(byId.missing.attentionReasons).toContain("missing_client_price");
    expect(byId.negative.attentionReasons).toContain("invalid_client_price");
    expect(byId.precision.clientCharge).toBeNull();
    expect(byId["numeric-string"].cleanerPayout).toBeNull();
    expect(result.overall).toMatchObject({ clientCharges: null, knownClientCharges: 0, missingClientPriceCount: 4 });
  });

  it("deduplicates identical relevant Job input without copying private fields", () => {
    const result = close([job({ notes: "Private fixture note" }), job({ notes: "Changed private note" })]);
    expect(result.jobs).toHaveLength(1);
    expect(result.overall.clientCharges).toBe(200);
    expect(result.duplicateInputCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain("Private");
    expect(result.jobs[0]).not.toHaveProperty("notes");
  });

  it("omits contradictory duplicate IDs rather than choosing a financial value", () => {
    const result = close([job(), job({ clientPrice: 999 })]);
    expect(result.jobs).toHaveLength(0);
    expect(result.excluded.conflictingDuplicate).toBe(1);
    expect(result.overall.clientCharges).toBeNull();
    expect(result.overall.knownClientCharges).toBe(0);
  });

  it("keeps ID grouping separate from exact legacy snapshots and prefers historical names", () => {
    const result = close([
      job(), job({ id: "legacy", clientId: undefined, clientName: "Harbor client" }),
      job({ id: "unknown", clientId: undefined, clientName: undefined }),
    ], { clients: [{ id: "client-1", name: "Renamed client" }] });
    expect(result.clients).toHaveLength(3);
    expect(result.jobs.find((row) => row.id === "job-1").clientName).toBe("Harbor client");
    expect(result.clients.find((group) => group.key === "snapshot:Harbor client").legacySnapshot).toBe(true);
    expect(result.jobs.find((row) => row.id === "legacy").attentionReasons).toContain("missing_client_association");
    expect(result.jobs.find((row) => row.id === "unknown").attentionReasons).toContain("missing_client_name");
  });

  it("uses canonical context only as a display fallback and allowlists deeply", () => {
    const result = close([job({ clientName: undefined, propertyName: undefined, keyCodeInfo: "private-code" })], {
      clients: [{ id: "client-1", name: "Harbor client", notes: "client-private" }],
      properties: [{ id: "property-1", name: "Garden cottage", accessInstructions: "property-private" }],
    });
    expect(result.jobs[0]).toMatchObject({ clientName: "Harbor client", propertyName: "Garden cottage" });
    expect(JSON.stringify(result)).not.toMatch(/private-code|client-private|property-private|keyCodeInfo|accessInstructions/);
  });

  it("reconciles all complete totals and partial known subtotals using integer cents", () => {
    const result = close([
      job({ id: "job-1", clientPrice: 0.1, cleanerPayout: 0.05 }),
      job({ id: "job-2", clientPrice: 0.2, cleanerPayout: 0.1, clientId: "client-2", clientName: "Garden client" }),
    ]);
    expect(result.overall).toMatchObject({
      completedServiceCount: 2, clientCharges: 0.3, cleanerPayoutTotal: 0.15,
      cleanerPaidTotal: 0, cleanerOutstandingTotal: 0.15, grossOperationalMargin: 0.15,
      knownClientCharges: 0.3, knownCleanerPayoutTotal: 0.15, attentionCount: 0,
    });
    expect(result.clients.reduce((sum, group) => sum + Math.round(group.clientCharges * 100), 0)).toBe(30);
    expect(result.jobs.reduce((sum, row) => sum + Math.round(row.cleanerPayout * 100), 0)).toBe(15);
    const partial = close([job(), job({ id: "missing", clientPrice: undefined })]);
    expect(partial.overall).toMatchObject({ clientCharges: null, knownClientCharges: 200, knownGrossOperationalMargin: 100 });
  });

  it("has truthful zero totals for an empty week", () => {
    const result = close([]);
    expect(result.clients).toEqual([]);
    expect(result.overall).toMatchObject({
      completedServiceCount: 0, clientCharges: 0, cleanerPayoutTotal: 0,
      cleanerPaidTotal: 0, cleanerOutstandingTotal: 0, grossOperationalMargin: 0, attentionCount: 0,
    });
  });

  it("does not certify a complete total from a record with no stable ID or unsafe aggregate", () => {
    const missingId = close([job({ id: undefined })]);
    expect(missingId.overall.clientCharges).toBeNull();
    expect(missingId.excluded.missingId).toBe(1);
    const large = 50_000_000_000_000;
    const overflow = close([job({ clientPrice: large }), job({ id: "job-2", clientPrice: large })]);
    expect(overflow.overall.clientCharges).toBeNull();
    expect(overflow.overall.knownClientCharges).toBeNull();
  });
});

describe("weekly close payout evidence", () => {
  it("proves a reciprocal single-Job paid record and preserves outstanding legacy eligibility", () => {
    const result = close([
      job({ payoutId: "payout-1", legacyPayoutEligible: false }), job({ id: "outstanding" }),
    ], { payouts: [paid()] });
    expect(result.jobs[0]).toMatchObject({ payoutStatus: "PAID", paidAmount: 100, outstandingAmount: 0 });
    expect(result.jobs[1]).toMatchObject({ payoutStatus: "OUTSTANDING", paidAmount: 0, outstandingAmount: 100 });
    expect(result.overall).toMatchObject({ cleanerPaidTotal: 100, cleanerOutstandingTotal: 100, unknownPayoutCount: 0 });
  });

  it("does not infer unpaid from absent eligibility or incomplete lookup", () => {
    expect(close([job({ legacyPayoutEligible: undefined })]).jobs[0].payoutStatus).toBe("UNKNOWN");
    expect(close([job()], { payoutLookupComplete: false }).jobs[0].attentionReasons).toContain("payout_lookup_incomplete");
    expect(close([job({ payoutPaidAt: new Date() })]).jobs[0].attentionReasons).toContain("payout_link_missing");
  });

  it("leaves v2 Job totals explicitly UNKNOWN and never splits them among cleaners", () => {
    const result = close([job({ schemaVersion: 2, assignedCleanerIds: ["cleaner-1", "cleaner-2"], cleanerPayout: 300 })], {
      cleanerNamesById: { "cleaner-1": "Demo cleaner one", "cleaner-2": "Demo cleaner two" },
    });
    expect(result.jobs[0]).toMatchObject({ cleanerPayout: 300, payoutStatus: "UNKNOWN", cleanerNames: ["Demo cleaner one", "Demo cleaner two"] });
    expect(result.jobs[0].attentionReasons).toContain("v2_payout_untracked");
    expect(result.overall).toMatchObject({ cleanerPaidTotal: null, cleanerOutstandingTotal: null, knownCleanerPayoutTotal: 300 });
  });

  it("does not allocate a grouped payout or double-count its amount", () => {
    const result = close([
      job({ payoutId: "batch", legacyPayoutEligible: false }),
      job({ id: "job-2", payoutId: "batch", legacyPayoutEligible: false }),
    ], { payouts: [paid({ id: "batch", jobIds: ["job-1", "job-2"], amount: 200 })] });
    expect(result.jobs.every((row) => row.payoutStatus === "UNKNOWN")).toBe(true);
    expect(result.jobs[0].attentionReasons).toContain("payout_batch_allocation_unknown");
    expect(result.overall).toMatchObject({ knownCleanerPaidTotal: 0, cleanerPaidTotal: null, unknownPayoutCount: 2 });
  });

  it.each([
    ["duplicate Job reference", [paid({ jobIds: ["job-1", "job-1"] })], "payout_link_conflict"],
    ["multiple payout records", [paid(), paid({ id: "payout-2" })], "payout_link_conflict"],
    ["contradictory payout ID", [paid(), paid({ amount: 999 })], "payout_link_conflict"],
    ["wrong organization", [paid({ organizationId: "other" })], "payout_evidence_invalid"],
    ["missing organization", [paid({ organizationId: undefined })], "payout_evidence_invalid"],
    ["wrong cleaner", [paid({ cleanerId: "other" })], "payout_evidence_invalid"],
    ["missing paid timestamp", [paid({ paidAt: undefined })], "payout_evidence_invalid"],
    ["unconfirmed payout", [paid({ status: "PENDING" })], "payout_evidence_invalid"],
    ["edited after payout", [paid({ amount: 90 })], "payout_amount_mismatch"],
    ["no linked record", [], "payout_link_missing"],
    ["wrong reciprocal Job", [paid({ jobIds: ["job-other"] })], "payout_link_conflict"],
  ])("fails closed for %s", (_description, payouts, expectedReason) => {
    const result = close([job({ payoutId: "payout-1", legacyPayoutEligible: false })], { payouts });
    expect(result.jobs[0].payoutStatus).toBe("UNKNOWN");
    expect(result.jobs[0].attentionReasons).toContain(expectedReason);
    expect(result.overall.cleanerPaidTotal).toBeNull();
  });

  it("ignores identical duplicate payout inputs but flags orphaned reciprocal evidence", () => {
    expect(close([job({ payoutId: "payout-1" })], { payouts: [paid(), paid()] }).jobs[0].payoutStatus).toBe("PAID");
    const result = close([job()], { payouts: [paid()] });
    expect(result.jobs[0].attentionReasons).toContain("payout_link_conflict");
  });

  it("does not mutate any Job, payout or context input", () => {
    const sourceJob = Object.freeze(job({ payoutId: "payout-1" }));
    const sourcePayout = Object.freeze(paid({ jobIds: Object.freeze(["job-1"]) }));
    expect(() => close(Object.freeze([sourceJob]), { payouts: Object.freeze([sourcePayout]) })).not.toThrow();
    expect(sourceJob.payoutId).toBe("payout-1");
  });
});

describe("explicit period bounds", () => {
  it("accepts inclusive 31-day ranges and leap days", () => {
    expect(servicePeriod({ start: "2028-02-28", end: "2028-03-29" })).toEqual({ start: "2028-02-28", end: "2028-03-29" });
    expect(servicePeriod({ start: "2028-02-29", end: "2028-02-29" })).toMatchObject({ end: "2028-02-29" });
  });
  it.each([
    { start: "2026-02-30", end: "2026-03-01" },
    { start: "2026-10-03", end: "2026-10-02" },
    { start: "2026-10-01", end: "2026-11-01" },
    { start: "2026-10-01", end: "" },
  ])("rejects invalid or wider ranges: %j", (period) => {
    expect(() => servicePeriod(period)).toThrow(RangeError);
  });
});

describe("hourly services in the weekly close", () => {
  it.each([
    { billing: { mode: "HOURLY", hourlyRateCents: 4000, hours: { start: "08:00", end: "12:00" } } },
    { pay: { mode: "HOURLY", rateCents: 2500 } },
    { pay: { mode: "HOURLY", rateCents: 2500 }, billing: { mode: "HOURLY", hourlyRateCents: 4000, hours: { approved: true, approvedMinutes: 90 } } },
  ])("excludes both sides and any stale fixed amounts while hours need review", (pricing) => {
    const hourly = job({ id: "hourly", ...pricing });
    const fixed = job({ payoutId: "payout-1" });
    const historical = close([fixed], { payouts: [paid()] });
    const result = close([fixed, hourly], { payouts: [paid()] });
    expect(result.jobs.find(({ id }) => id === "hourly")).toMatchObject({
      clientCharge: null, cleanerPayout: null, paidAmount: null, outstandingAmount: null,
      grossOperationalMargin: null, attentionReasons: ["hours_review"],
    });
    for (const field of ["knownClientCharges", "knownCleanerPayoutTotal", "knownCleanerPaidTotal",
      "knownCleanerOutstandingTotal", "knownGrossOperationalMargin"]) {
      expect(result.overall[field]).toBe(historical.overall[field]);
      expect(result.clients[0][field]).toBe(historical.clients[0][field]);
      expect(close([hourly]).overall[field]).toBeNull();
    }
  });

  it("uses an existing approved client time and never treats a rate as a flat fee", () => {
    expect(close([job({ billing: { mode: "HOURLY", hourlyRateCents: 3500,
      hours: { approved: true, approvedMinutes: 90 } } })]).overall.clientCharges).toBe(52.5);
  });

  it("flags conflicting duplicate hourly records", () => {
    expect(close([job(), job({ pay: { mode: "HOURLY", rateCents: 2500 } })]).excluded.conflictingDuplicate).toBe(1);
  });
});

describe("fixed team payout evidence", () => {
  const team = job({ schemaVersion: 2, assignedCleanerId: null, assignedCleanerIds: ["z", "a", "b"] });
  const names = { z: "Example Z", a: "Example A", b: "Example B" };
  const line = (id, cleanerId, cents) => paid({ id, cleanerId, jobIds: ["job-1", "another-job"],
    jobAmountsCents: { "job-1": cents, "another-job": 2500 }, amount: (cents + 2500) / 100 });

  it("keeps the house and client totals and reports the actual cents for every cleaner in roster order", () => {
    const result = close([team], { cleanerNamesById: names });
    expect(result.jobs[0]).toMatchObject({ cleanerPayout: 100, clientCharge: 200, payoutStatus: "UNKNOWN", cleanerShares: [
      { name: "Example Z", amount: 33.34, paidAmount: null }, { name: "Example A", amount: 33.33, paidAmount: null },
      { name: "Example B", amount: 33.33, paidAmount: null },
    ] });
    const overridden = close([{ ...team, pay: { mode: "FIXED", perCleanerCents: 5000 } }]);
    expect(overridden.jobs[0].cleanerShares.map(share => share.amount)).toEqual([50, 50, 50]);
    expect(overridden.overall).toMatchObject({ cleanerPayoutTotal: 150, clientCharges: 200, grossOperationalMargin: 50 });
    expect(close([team, { ...team, assignedCleanerIds: ["a", "z", "b"] }]).excluded.conflictingDuplicate).toBe(1);
  });

  it("honors an agreed personal fixed amount despite later Job edits, preserving zero and missing terms", () => {
    const incompleteTeam = { ...team, requiredCleanerCount: 4, assignedCleanerIds: ["z", "a"], cleanerPayout: 175,
      payoutAgreementsByCleaner: { z: { offeredCompensation: 42.01 }, a: { offeredCompensation: 0 } } };
    const result = close([incompleteTeam]).jobs[0];
    expect(result.cleanerPayout).toBe(42.01);
    expect(result.cleanerShares.map(share => share.amount)).toEqual([42.01, 0]);
    const stale = close([{ ...incompleteTeam, payoutAgreementsByCleaner: { z: null } }]).jobs[0];
    expect(stale.cleanerPayout).toBeNull();
    expect(stale.cleanerShares.map(share => share.amount)).toEqual([null, 87.5]);
    const hourly = close([{ ...incompleteTeam,
      payoutAgreementsByCleaner: { z: { offeredPay: { mode: "HOURLY", rateCents: 2900 } } } }]).jobs[0];
    expect(hourly.cleanerPayout).toBeNull();
    expect(hourly.attentionReasons).toContain("hours_review");
  });

  it("counts a verified fixed receipt while a teammate's hourly balance awaits review", () => {
    const mixedJob = { ...team, assignedCleanerIds: ["z", "a"], cleanerPayout: 104,
      payoutIdsByCleaner: { z: "receipt" },
      payoutAgreementsByCleaner: { a: { offeredPay: { mode: "HOURLY", rateCents: 2900 } } },
    };
    const options = { cleanerNamesById: names, payouts: [line("receipt", "z", 5200)] };
    for (const housePayout of [104, 160]) {
      const result = close([{ ...mixedJob, cleanerPayout: housePayout }], options);
      expect(result.jobs[0]).toMatchObject({
        paidAmount: 52, cleanerPayout: null, outstandingAmount: null, payoutStatus: "UNKNOWN",
        cleanerShares: [{ name: "Example Z", paidAmount: 52 }, { name: "Example A", amount: null, paidAmount: null }],
      });
      expect(result.jobs[0].attentionReasons).toContain("hours_review");
      expect(result.jobs[0].attentionReasons.includes("payout_amount_mismatch")).toBe(housePayout === 160);
      for (const summary of [result.overall, result.clients[0]]) {
        expect(summary).toMatchObject({ knownCleanerPaidTotal: 52, cleanerPaidTotal: null,
          knownCleanerOutstandingTotal: null, cleanerOutstandingTotal: null, cleanerPayoutTotal: null });
      }
    }
    const unverified = close([mixedJob], { ...options, payouts: [line("receipt", "a", 5200)] });
    expect(unverified.overall.knownCleanerPaidTotal).toBeNull();
    expect(unverified.jobs[0].attentionReasons).toContain("payout_evidence_invalid");
  });

  it("reconciles one or all individual receipts, including grouped payments, with explicit reciprocal links", () => {
    const first = line("one", "z", 3334);
    const afterFirst = { ...team, payoutIdsByCleaner: { z: "one" } };
    const partial = close([afterFirst], { payouts: [first] });
    expect(partial.jobs[0]).toMatchObject({ paidAmount: 33.34, outstandingAmount: 66.66, payoutStatus: "OUTSTANDING" });
    expect(partial.jobs[0].cleanerShares.map(share => share.paidAmount)).toEqual([33.34, null, null]);
    const full = close([{ ...team, payoutIdsByCleaner: { z: "one", a: "two", b: "three" } }],
      { payouts: [first, line("two", "a", 3333), line("three", "b", 3333)] });
    expect(full.overall).toMatchObject({ cleanerPaidTotal: 100, cleanerOutstandingTotal: 0, unknownPayoutCount: 0 });
    const changed = close([{ ...afterFirst, cleanerPayout: 120 }], { payouts: [first] }).jobs[0];
    expect(changed).toMatchObject({ payoutStatus: "UNKNOWN", paidAmount: 33.34, outstandingAmount: 80 });
    expect(changed.attentionReasons).toContain("payout_amount_mismatch");
    for (const receipt of [
      { ...first, amount: 9 }, { ...first, cleanerId: "b" }, { ...first, organizationId: "other" },
      { ...first, jobAmountsCents: undefined }, { ...first, jobIds: ["another-job"] },
    ]) {
      expect(close([afterFirst], { payouts: [receipt] }).jobs[0].paidAmount).toBeNull();
    }
    expect(close([team], { payouts: [first] }).jobs[0].paidAmount).toBeNull();
  });
});

describe("approved hourly team in the weekly close", () => {
  const roster = ["cleaner-a", "cleaner-b"];
  const team = job({ schemaVersion: 2, assignedCleanerId: null, assignedCleanerIds: roster,
    pay: { mode: "HOURLY", rateCents: 2400 },
    billing: { mode: "HOURLY", hourlyRateCents: 3600, hours: {
      approved: true, source: "APPROVED_ASSIGNMENTS", roster, approvedMinutes: 360,
    } },
    payoutApprovedWorkByCleaner: {
      "cleaner-a": { minutes: 180, payoutCents: 7200 },
      "cleaner-b": { minutes: 180, payoutCents: 8100 },
    },
  });
  it("charges the sum of minutes once and uses the separately approved cleaner amounts", () => {
    const result = close([team]);
    expect(result.overall).toMatchObject({ clientCharges: 216, cleanerPayoutTotal: 153, cleanerOutstandingTotal: 153,
      grossOperationalMargin: 63 });
    expect(result.jobs[0].cleanerShares.map(share => share.amount)).toEqual([72, 81]);
  });
  it("preserves every legacy paid subtotal when the additional job still needs hours", () => {
    const historical = close([job({ payoutId: "payout-1" })], { payouts: [paid()] });
    const pending = close([job({ payoutId: "payout-1" }), { ...team, id: "pending", payoutApprovedWorkByCleaner: {} }],
      { payouts: [paid()] });
    for (const field of ["knownClientCharges", "knownCleanerPayoutTotal", "knownCleanerPaidTotal",
      "knownCleanerOutstandingTotal", "knownGrossOperationalMargin"]) {
      expect(pending.overall[field]).toBe(historical.overall[field]);
    }
    expect(pending.jobs.find(row => row.id === "pending").attentionReasons).toContain("hours_review");
  });
});
