import { expect, it, vi } from "vitest";
import { getServicePeriodJobs } from "../jobs/jobService.js";
import { getServerRecordsById } from "../../services/firebase/serverReads.js";
import { loadCleanerAgenda } from "./cleanerAgendaService.js";

vi.mock("../jobs/jobService.js", () => ({ getServicePeriodJobs: vi.fn() }));
vi.mock("../../services/firebase/serverReads.js", () => ({ getServerRecordsById: vi.fn() }));
vi.mock("../payouts/payoutAgreements.js", () => ({
  enrichPayoutAgreements: vi.fn(async jobs => jobs.map(job => ({
    ...job, payoutAgreementsByCleaner: { first: { offeredCompensation: 69 }, second: { offeredCompensation: 41 } },
  }))),
}));

it("uses the verified receipt for its own cleaner and the frozen agreement for the other cleaner", async () => {
  const job = { id: "team", schemaVersion: 2, dataProvenance: "REAL", operationalStatus: "COMPLETED",
    assignedCleanerIds: ["first", "second"], payoutIdsByCleaner: { first: "receipt" },
    propertyName: "Example", scheduledDate: "2026-11-17", cleanerPayout: 200 };
  const receipt = { organizationId: "cleanflow-demo", cleanerId: "first", status: "PAID", paidAt: new Date(),
    jobIds: ["team", "elsewhere"], jobAmountsCents: { team: 5513, elsewhere: 2700 }, amount: 82.13, note: "private-marker" };
  getServicePeriodJobs.mockResolvedValue({ jobs: [job], coverage: {} });
  getServerRecordsById.mockImplementation(async (_org, collection) =>
    collection === "payouts" ? [{ id: "receipt", data: () => receipt }] : []);
  const load = () => loadCleanerAgenda({ start: "2026-11-16", end: "2026-11-22" });
  const result = await load();
  expect(result.completed.map(group => [group.cleanerId, group.rows[0].payout, group.rows[0].paid]))
    .toEqual([["first", 55.13, true], ["second", 41, false]]);
  expect(getServerRecordsById).toHaveBeenCalledWith("cleanflow-demo", "payouts", ["receipt"]);
  expect(JSON.stringify(result)).not.toContain("private-marker");
  receipt.cleanerId = "another";
  expect((await load()).completed[0].rows[0]).toMatchObject({ payout: null, paid: false });
});
