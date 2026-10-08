import { describe, expect, it } from "vitest";
import { jobDisclosureSummaries } from "./jobDisclosureSummaries.js";
import { translateInLanguage } from "../../i18n/translations.js";

const loaded = { isLoadingOffers: false, hasOffersError: false, isLoadingIssues: false, hasIssuesError: false, isLoadingChecklistRun: false, hasChecklistRunError: false, isLoadingAssignments: false, hasAssignmentsError: false };
const input = { ...loaded, job: { schemaVersion: 2, assignedCleanerIds: [], scheduledDate: "2026-10-07", scheduledStart: "11:00", clientPrice: 999, cleanerPayout: 777 }, offers: [], issues: [], checklistRun: null };
const summarize = (props = {}, lang = "en") => jobDisclosureSummaries({ ...input, ...props }, key => translateInLanguage(lang, key), lang);
describe("F2 disclosure summaries use loaded evidence, not visual state", () => {
  it("shows a saved schedule and no financial amounts or payment inference", () => {
    const result = summarize();
    expect(result.details).toContain("Oct 7, 2026");
    expect(result.details).toContain("11:00");
    expect(result.financial).toBe("Client price and cleaner payout");
    expect(Object.values(result).join(" ")).not.toMatch(/999|777|paid|profit/i);
  });
  it("distinguishes verified empty collections from absent loading metadata", () => {
    expect(summarize().offers).toBe("No offers recorded");
    expect(summarize().issues).toBe("No open issues");
    expect(summarize().checklist).toBe("No checklist recorded");
    const unknown = summarize({ isLoadingOffers: undefined, isLoadingIssues: undefined, isLoadingChecklistRun: undefined });
    expect([unknown.offers, unknown.issues, unknown.checklist]).toEqual(["Not provided", "Not provided", "Not provided"]);
  });
  it.each(["isLoadingOffers", "hasOffersError", "isLoadingIssues", "hasIssuesError", "isLoadingChecklistRun", "hasChecklistRunError"])("%s cannot turn unverified data into empty", flag => {
    const result = summarize({ [flag]: true });
    const group = flag.includes("Offers") ? "offers" : flag.includes("Issues") ? "issues" : "checklist";
    expect(result[group]).not.toMatch(/No offers|No open|No checklist/);
  });
  it("counts known pending and interested responses without assigning", () => {
    expect(summarize({ offers: [{ status: "PENDING" }, { status: "INTERESTED" }, { status: "DECLINED" }] }).offers).toBe("1 awaiting reply · 1 interested");
    expect(summarize({ offers: [{ status: "UNKNOWN" }] }).offers).toBe("Not provided");
  });
  it("does not turn an unknown issue into proof that none are open", () => {
    expect(summarize({ issues: [{ status: "ALIEN" }] }).issues).toBe("Not provided");
    expect(summarize({ issues: [{ status: "OPEN" }, { status: "RESOLVED" }] }).issues).toBe("1 open issue(s)");
  });
  it.each([["DRAFT", "Draft"], ["READY_FOR_REVIEW", "Ready for review"], ["ABANDONED", "Abandoned"], ["ALIEN", "Not provided"]])("Run %s is not reinterpreted as completion", (status, text) => {
    expect(summarize({ checklistRun: { status }, job: { ...input.job, operationalStatus: "COMPLETED" } }).checklist).toBe(text);
  });
  it("uses saved roster/name evidence without implying acknowledgment", () => {
    const props = { job: { ...input.job, assignedCleanerIds: ["demo"] }, knownCleaners: [{ id: "demo", name: "Demo Cleaner" }] };
    expect(summarize(props).cleaner).toBe("Demo Cleaner");
    expect(summarize({ ...props, knownCleaners: [] }).cleaner).toBe("1 cleaner(s) assigned");
    expect(summarize({ job: { schemaVersion: 2, operationalStatus: "ASSIGNED" } }).cleaner).toBe("Not provided");
    expect(summarize().cleaner).toBe("No cleaner assigned");
  });
  it("does not expose stale data during loading or errors", () => {
    expect(summarize({ isLoadingOffers: true, offers: [{ status: "PENDING" }] }).offers).toBe("Loading…");
    expect(summarize({ hasChecklistRunError: true, checklistRun: { status: "DRAFT" } }).checklist).toBe("Not provided");
  });
  it("never invents timestamps or complete history", () => {
    expect(summarize().history).toBe("Not provided");
    expect(summarize({ job: { archivedAt: "2026-10-07" } }).history).toBe("Archived");
    expect(summarize({ job: { createdAt: { toDate: () => new Date("2026-10-07T18:00:00Z") } } }).history).toContain("Created Oct 7, 2026");
    expect(summarize({ job: { createdAt: { toDate: () => new Date("invalid") } } }).history).toBe("Not provided");
  });
  it("malformed Run status cannot use inherited object properties", () => {
    expect(summarize({ checklistRun: { status: "constructor" } }).checklist).toBe("Not provided");
  });
  it("invalid calendar date or time is never repaired into a fabricated schedule", () => {
    expect(summarize({ job: { ...input.job, scheduledDate: "2026-02-31" } }).details).toBe("Not provided");
    expect(summarize({ job: { ...input.job, scheduledStart: "25:00" } }).details).toBe("Oct 7, 2026");
  });
  it.each([["en", "Client price and cleaner payout"], ["pt", "Preço do cliente e pagamento da cleaner"], ["es", "Precio del cliente y pago de la cleaner"]])("%s has localized summaries without untranslated keys", (lang, financial) => {
    const result = summarize({}, lang);
    expect(result.financial).toBe(financial);
    expect(Object.values(result).join(" ")).not.toContain("jobV2.summary");
  });
});
