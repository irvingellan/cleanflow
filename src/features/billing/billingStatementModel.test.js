import { describe, expect, it } from "vitest";
import {
  billableMinutes, buildStatementDraft, centsFromDollars, hourlyAmountCents,
  issueStatement, statementBalance, statementLine, statementMessage,
} from "./billingStatementModel.js";

const client = { id: "client-a", name: "Synthetic Client A" };
const period = { start: "2026-11-09", end: "2026-11-15" };
const house = { id: "property-1", clientId: "client-a", name: "Lake House", address: "100 Example St" };
const cabin = { id: "property-2", clientId: "client-a", name: "Cabin", address: "200 Example Rd", defaultHourlyRate: 45 };
const job = (overrides = {}) => ({
  id: "job-1", clientId: "client-a", propertyId: "property-1", scheduledDate: "2026-11-10",
  operationalStatus: "COMPLETED", clientPrice: 180, ...overrides,
});

describe("money and hours", () => {
  it("converts dollars to cents and refuses fractions of a cent or negatives", () => {
    expect(centsFromDollars(180)).toBe(18000);
    expect(centsFromDollars(19.99)).toBe(1999);
    expect(centsFromDollars(1.005)).toBeNull();
    expect(centsFromDollars(-1)).toBeNull();
    expect(centsFromDollars(undefined)).toBeNull();
    expect(centsFromDollars("180")).toBeNull();
  });

  it("counts only manager-approved hours and never guesses", () => {
    expect(billableMinutes({ start: "11:00", end: "15:30" })).toBeNull();
    expect(billableMinutes({ approved: true, start: "11:00", end: "15:30" })).toBe(270);
    expect(billableMinutes({ approved: true, start: "11:00", end: "15:30", breakMinutes: 30 })).toBe(240);
    expect(billableMinutes({ approved: true, approvedMinutes: 200, start: "11:00", end: "15:30" })).toBe(200);
    expect(billableMinutes({ approved: true, start: "15:00", end: "11:00" })).toBeNull();
    expect(billableMinutes({ approved: true, start: "25:00", end: "26:00" })).toBeNull();
  });

  it("rounds up to a block only when the client policy says so", () => {
    expect(billableMinutes({ approved: true, approvedMinutes: 241 })).toBe(241);
    expect(billableMinutes({ approved: true, approvedMinutes: 241 }, { roundUpToMinutes: 15 })).toBe(255);
  });

  it("multiplies the hourly rate by minutes, half-up to the cent", () => {
    expect(hourlyAmountCents(4500, 270)).toBe(20250);
    expect(hourlyAmountCents(3333, 1)).toBe(56); // 55.55 → 56
    expect(hourlyAmountCents(4500, 0)).toBeNull();
  });
});

describe("statement lines", () => {
  it("bills a fixed-price cleaning with an additional fee and its reason", () => {
    const { line } = statementLine({
      job: job({ billing: { additionalFees: [{ amountCents: 5000, reason: "Excessive dirt" }] } }),
      property: house,
    });
    expect(line).toMatchObject({ address: "100 Example St", mode: "FIXED", baseCents: 18000, feeCents: 5000, totalCents: 23000 });
  });

  it("bills an hourly cleaning from approved hours and the property rate", () => {
    const { line } = statementLine({
      job: job({ propertyId: "property-2", clientPrice: undefined, billing: { mode: "HOURLY", hours: { approved: true, start: "11:00", end: "15:30" } } }),
      property: cabin,
    });
    expect(line).toMatchObject({ mode: "HOURLY", minutes: 270, rateCents: 4500, baseCents: 20250, totalCents: 20250 });
  });

  it("keeps missing data as 'needs review', never as zero", () => {
    expect(statementLine({ job: job({ clientPrice: undefined }), property: house }).pending).toBe("price_missing");
    expect(statementLine({ job: job(), property: { ...house, address: "" } }).pending).toBe("address_missing");
    expect(statementLine({ job: job({ billing: { mode: "HOURLY" } }), property: house }).pending).toBe("hourly_rate_missing");
    expect(statementLine({ job: job({ billing: { mode: "HOURLY", hours: { start: "11:00", end: "12:00" } } }), property: cabin }).pending)
      .toBe("hours_not_approved");
    expect(statementLine({ job: job({ billing: { additionalFees: [{ amountCents: 5000 }] } }), property: house }).pending)
      .toBe("fee_reason_missing");
    expect(statementLine({ job: job({ billing: { additionalFees: [{ amountCents: -5, reason: "x" }] } }), property: house }).pending)
      .toBe("fee_invalid");
  });
});

describe("statement draft", () => {
  const jobs = [
    job({ id: "job-2", scheduledDate: "2026-11-12" }),
    job({ id: "job-1", billing: { additionalFees: [{ amountCents: 4000, reason: "Excessive dirt" }] } }),
    job({ id: "job-3", operationalStatus: "ASSIGNED" }),
    job({ id: "job-4", archivedAt: "2026-11-11" }),
    job({ id: "job-5", scheduledDate: "2026-11-16" }),
    job({ id: "job-6", clientId: "client-b" }),
    job({ id: "job-7", propertyId: "property-9" }),
    job({ id: "job-8", scheduledDate: "2026-11-14", clientPrice: undefined }),
    job({ id: "job-9", scheduledDate: "2026-11-13" }),
  ];

  it("includes only this client's completed cleanings in the period, in date order", () => {
    const draft = buildStatementDraft({ client, period, jobs, properties: [house, cabin], billedJobIds: new Set(["job-9"]) });
    expect(draft.lines.map((line) => line.jobId)).toEqual(["job-1", "job-2"]);
    expect(draft.pending).toEqual([expect.objectContaining({ jobId: "job-8", pending: "price_missing" })]);
    expect(draft.excluded).toEqual(expect.arrayContaining([
      { jobId: "job-3", reason: "not_completed" },
      { jobId: "job-4", reason: "archived" },
      { jobId: "job-7", reason: "property_not_client" },
      { jobId: "job-9", reason: "already_billed" },
    ]));
    expect(draft).toMatchObject({ subtotalCents: 36000, feeCents: 4000, totalCents: 40000, readyToIssue: false });
  });

  it("is ready to issue only when nothing needs review", () => {
    const draft = buildStatementDraft({ client, period, jobs: jobs.slice(0, 2), properties: [house] });
    expect(draft.readyToIssue).toBe(true);
    expect(buildStatementDraft({ client, period, jobs: [], properties: [house] }).readyToIssue).toBe(false);
  });

  it("rejects an invalid period", () => {
    expect(() => buildStatementDraft({ client, period: { start: "2026-11-15", end: "2026-11-09" }, jobs })).toThrow(RangeError);
    expect(() => buildStatementDraft({ client, period: { start: "2026-02-30", end: "2026-03-01" }, jobs })).toThrow(RangeError);
  });
});

describe("issued statement and payments", () => {
  const draft = buildStatementDraft({ client, period, jobs: [job(), job({ id: "job-2", scheduledDate: "2026-11-12" })], properties: [house] });
  const issued = issueStatement(draft, { number: "CF-2026-0001", issuedAt: new Date("2026-11-16T18:00:00Z"), issuedByUid: "manager-1" });

  it("freezes the issued snapshot", () => {
    expect(Object.isFrozen(issued)).toBe(true);
    expect(issued).toMatchObject({ status: "ISSUED", totalCents: 36000, jobIds: ["job-1", "job-2"] });
    draft.lines[0].totalCents = 1;
    expect(issued.lines[0].totalCents).toBe(18000);
  });

  it("refuses to issue a draft that still needs review", () => {
    const pendingDraft = buildStatementDraft({ client, period, jobs: [job({ clientPrice: undefined })], properties: [house] });
    expect(() => issueStatement(pendingDraft, { number: "CF-1", issuedAt: new Date(), issuedByUid: "m" })).toThrow(RangeError);
  });

  it("tracks unpaid, partial, paid and overpaid from recorded payments only", () => {
    const pay = (id, amountCents, extra = {}) => ({ id, amountCents, statementNumber: "CF-2026-0001", ...extra });
    expect(statementBalance(issued, [])).toEqual({ paidCents: 0, balanceCents: 36000, status: "UNPAID" });
    expect(statementBalance(issued, [pay("p1", 20000)]).status).toBe("PARTIALLY_PAID");
    expect(statementBalance(issued, [pay("p1", 20000), pay("p1", 20000), pay("p2", 16000)]))
      .toEqual({ paidCents: 36000, balanceCents: 0, status: "PAID" });
    expect(statementBalance(issued, [pay("p1", 40000)]).status).toBe("OVERPAID");
    expect(statementBalance(issued, [pay("p1", 36000, { voided: true }), pay("p2", 36000, { statementNumber: "CF-X" })]).status).toBe("UNPAID");
  });

  it("writes a short message without addresses", () => {
    const message = statementMessage(issued, { formatMoney: (cents) => `$${(cents / 100).toFixed(2)}`, formatDate: (date) => date });
    expect(message).toContain("CF-2026-0001");
    expect(message).toContain("2 cleanings · Total $360.00");
    expect(message).not.toContain("Example St");
  });
});
