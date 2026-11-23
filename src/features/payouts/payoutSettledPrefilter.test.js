import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory Firestore that counts every server request and every document it returns.
const sdk = vi.hoisted(() => {
  const reference = (base, ...parts) => [base, ...parts].filter(Boolean).join("/");
  return { reference, getDocs: vi.fn(), getDoc: vi.fn(), store: new Map(), completed: [], count: { requests: 0, documents: 0 } };
});
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: (base, ...parts) => sdk.reference(base.path, ...parts),
  runTransaction: vi.fn(), serverTimestamp: vi.fn(),
}));
vi.mock("firebase/firestore/lite", () => ({
  doc: sdk.reference, collection: sdk.reference, getDocs: sdk.getDocs, getDoc: sdk.getDoc,
  documentId: () => "__name__", where: (field, op, value) => ({ field, op, value }), limit: count => ({ count }),
  orderBy: () => ({}), query: (path, ...constraints) => ({ path, constraints }),
}));
vi.mock("../../services/firebase/client.js", () => ({ db: { test: true } }));
vi.mock("../../services/firebase/serverReads.js", () => ({ serverFirestore: () => "", withReadDeadline: read => read }));

import { enrichPayoutAgreements } from "./payoutAgreements.js";
import { getUnpaidCompletedJobs } from "./payoutService.js";
import { missingAgreementReview, payoutNeedsHoursReview, payoutSettledOnJobRecord, unpaidPayoutShares } from "./payoutShares.js";

const organizationId = "cleanflow-demo";
const jobsPath = `organizations/${organizationId}/jobs`;
const snap = (id, value) => ({ id, data: () => value });

beforeEach(() => {
  vi.clearAllMocks();
  sdk.store.clear();
  sdk.completed.length = 0;
  sdk.count.requests = 0;
  sdk.count.documents = 0;
  sdk.getDoc.mockImplementation(async path => {
    sdk.count.requests += 1;
    sdk.count.documents += 1;
    return sdk.store.get(path) ?? snap(path.split("/").at(-1), undefined);
  });
  sdk.getDocs.mockImplementation(async ({ path, constraints }) => {
    sdk.count.requests += 1;
    const docs = path === jobsPath ? sdk.completed
      : [...sdk.store].filter(([key]) => key.startsWith(path + "/")).map(([, doc]) => doc)
        .filter(doc => constraints.every(({ field, op, value }) => {
          if (!field) return true;
          const actual = field === "__name__" ? doc.id : doc.data()[field];
          return op === "in" ? value.includes(actual) : actual === value;
        })).slice(0, constraints.find(rule => rule.count)?.count);
    sdk.count.documents += Math.max(docs.length, 1); // Firestore bills an empty query as one read.
    return { docs, empty: docs.length === 0 };
  });
});

/** Adds a completed Job. A team Job gets one active Assignment and one accepted Offer per cleaner. */
function addJob(id, fields, { offers = {} } = {}) {
  const job = { organizationId, operationalStatus: "COMPLETED", scheduledDate: "2026-11-01", ...fields };
  sdk.completed.push(snap(id, job));
  for (const cleanerId of job.assignedCleanerIds ?? []) {
    sdk.store.set(`${jobsPath}/${id}/assignments/as-${cleanerId}`, snap(`as-${cleanerId}`, {
      organizationId, jobId: id, cleanerId, isActive: true, source: "OFFER", sourceOfferId: cleanerId,
    }));
  }
  for (const cleanerId of [...(job.assignedCleanerIds ?? []), job.assignedCleanerId].filter(Boolean)) {
    sdk.store.set(`${jobsPath}/${id}/offers/${cleanerId}`, snap(cleanerId, {
      organizationId, jobId: id, cleanerId, status: "INTERESTED", offeredCompensation: 60, ...offers[cleanerId],
    }));
  }
}

const team = (ids, fields) => ({ schemaVersion: 2, assignedCleanerIds: ids, cleanerPayout: 60 * ids.length, ...fields });
const paid = ids => Object.fromEntries(ids.map(id => [id, `payout-${id}`]));

/** The read as it was on main before this change: every unmarked Job goes through the agreement reads. */
async function readBeforeThisChange() {
  const all = sdk.completed.map(record => ({ ...record.data(), id: record.id }));
  sdk.count.requests += 1;
  sdk.count.documents += all.length;
  const candidates = all.filter(job => !job.archivedAt && !job.payoutId && !job.payoutPaidAt);
  const jobs = await enrichPayoutAgreements(candidates, { organizationId });
  return jobs.filter(job => unpaidPayoutShares(job).length > 0 || payoutNeedsHoursReview(job) || missingAgreementReview(job));
}

function seedMixedHistory() {
  for (let index = 0; index < 60; index += 1) addJob(`legacy-paid-${index}`, { assignedCleanerId: "ana", cleanerPayout: 80, payoutId: "p" });
  for (let index = 0; index < 20; index += 1) addJob(`legacy-open-${index}`, { assignedCleanerId: "ana", cleanerPayout: 80 });
  for (let index = 0; index < 120; index += 1) addJob(`solo-paid-${index}`, team(["ana"], { payoutIdsByCleaner: paid(["ana"]) }));
  for (let index = 0; index < 60; index += 1) addJob(`pair-paid-${index}`, team(["ana", "bia"], { payoutIdsByCleaner: paid(["ana", "bia"]) }));
  for (let index = 0; index < 10; index += 1) addJob(`pair-half-${index}`, team(["ana", "bia"], { payoutIdsByCleaner: paid(["ana"]) }));
  for (let index = 0; index < 20; index += 1) addJob(`solo-open-${index}`, team(["ana"]));
  for (let index = 0; index < 5; index += 1) addJob(`hourly-${index}`, team(["ana"], { pay: { mode: "HOURLY", rateCents: 2200 } }));
  for (let index = 0; index < 5; index += 1) addJob(`archived-${index}`, team(["ana"], { archivedAt: new Date(0) }));
}

describe("payoutSettledOnJobRecord", () => {
  it("is true only for a fixed-pay team Job whose whole roster has a recorded payout", () => {
    expect(payoutSettledOnJobRecord(team(["ana", "bia"], { payoutIdsByCleaner: paid(["ana", "bia"]) }))).toBe(true);
    expect(payoutSettledOnJobRecord(team(["ana"], { payoutIdsByCleaner: paid(["ana"]) }))).toBe(true);
  });

  it.each([
    ["one cleaner is still unpaid", team(["ana", "bia"], { payoutIdsByCleaner: paid(["ana"]) })],
    ["nobody is paid", team(["ana"])],
    ["the payout link is empty", team(["ana"], { payoutIdsByCleaner: { ana: " " } })],
    ["the payout link is not a string", team(["ana"], { payoutIdsByCleaner: { ana: true } })],
    ["a link names someone outside the roster", team(["ana"], { payoutIdsByCleaner: paid(["ana", "eva"]) })],
    ["the links are not a map", team(["ana"], { payoutIdsByCleaner: ["payout-ana"] })],
    ["the roster is empty", team([], { payoutIdsByCleaner: {} })],
    ["the roster is malformed", team(["ana", "ana"], { payoutIdsByCleaner: paid(["ana"]) })],
    ["the cleaner is paid by the hour", team(["ana"], { payoutIdsByCleaner: paid(["ana"]), pay: { mode: "HOURLY", rateCents: 2200 } })],
    ["the client is billed by the hour", team(["ana"], { payoutIdsByCleaner: paid(["ana"]), billing: { mode: "HOURLY" } })],
    ["the Job is a legacy record", { assignedCleanerId: "ana", cleanerPayout: 80, payoutIdsByCleaner: paid(["ana"]) }],
  ])("is false when %s", (_reason, job) => {
    expect(payoutSettledOnJobRecord(job)).toBe(false);
  });
});

describe("unpaid completed Jobs skip agreement reads for settled team Jobs", () => {
  it("returns the same Jobs, amounts and review flags as the full agreement check", async () => {
    seedMixedHistory();
    // Agreements that differ from the Job fallback, on Jobs that must still be read.
    addJob("zero-agreement", team(["ana"]), { offers: { ana: { offeredCompensation: 0 } } });
    addJob("unknown-agreement", team(["ana"]), { offers: { ana: { offeredCompensation: null } } });
    addJob("revoked-offer", team(["ana", "bia"], { payoutIdsByCleaner: paid(["ana"]) }), { offers: { bia: { revokedAt: "then" } } });
    addJob("hourly-agreement", team(["ana"]), { offers: { ana: { offeredCompensation: undefined, offeredPay: { mode: "HOURLY", rateCents: 2500 } } } });
    addJob("stray-link", team(["ana"], { payoutIdsByCleaner: paid(["ana", "eva"]) }));
    addJob("hourly-billing-paid", team(["ana"], { payoutIdsByCleaner: paid(["ana"]), billing: { mode: "HOURLY" } }));

    const describeJob = job => ({
      id: job.id, unpaid: unpaidPayoutShares(job), hours: payoutNeedsHoursReview(job), agreement: missingAgreementReview(job),
    });
    const expected = (await readBeforeThisChange()).map(describeJob).sort((a, b) => a.id.localeCompare(b.id));
    const actual = (await getUnpaidCompletedJobs({ includePendingHours: true })).map(describeJob)
      .sort((a, b) => a.id.localeCompare(b.id));

    expect(actual).toEqual(expected);
    expect(actual.some(job => job.id.includes("-paid-"))).toBe(false);
    expect(actual.filter(job => job.id.startsWith("pair-half-"))).toHaveLength(10);
    expect(actual.find(job => job.id === "hourly-billing-paid")?.hours).toBe(true);
  });

  it("never reads Assignments or Offers of a settled team Job", async () => {
    addJob("settled", team(["ana", "bia"], { payoutIdsByCleaner: paid(["ana", "bia"]) }));
    addJob("open", team(["ana"]));
    await getUnpaidCompletedJobs({ includePendingHours: true });
    const paths = [...sdk.getDocs.mock.calls.map(([target]) => target.path), ...sdk.getDoc.mock.calls.map(([path]) => path)];
    expect(paths.some(path => path.includes("/jobs/settled/"))).toBe(false);
    expect(paths.some(path => path.includes("/jobs/open/"))).toBe(true);
  });

  it("measures the requests of one Payments load on a mixed synthetic history", async () => {
    seedMixedHistory();
    await readBeforeThisChange();
    const before = { ...sdk.count };
    sdk.count.requests = 0;
    sdk.count.documents = 0;
    await getUnpaidCompletedJobs({ includePendingHours: true });
    const after = { ...sdk.count };

    // 300 completed Jobs: 180 settled team Jobs (120 solo, 60 pairs) plus 120 others.
    expect(before).toEqual({ requests: 521, documents: 890 });
    expect(after).toEqual({ requests: 101, documents: 410 });
  });
});
