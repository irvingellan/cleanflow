import { describe, expect, it } from "vitest";
import { groupUnpaidJobsByCleaner } from "./payoutGrouping.js";

describe("groupUnpaidJobsByCleaner", () => {
  it("groups multiple Jobs and totals them by Cleaner", () => {
    const groups = groupUnpaidJobsByCleaner(
      [
        { id: "job-1", assignedCleanerId: "carla", cleanerPayout: 120 },
        { id: "job-2", assignedCleanerId: "carla", cleanerPayout: 80 },
      ],
      [{ id: "carla", name: "Carla Perez" }],
    );

    expect(groups).toEqual([
      {
        cleaner: { id: "carla", name: "Carla Perez" },
        jobs: [
          { id: "job-1", assignedCleanerId: "carla", cleanerPayout: 120 },
          { id: "job-2", assignedCleanerId: "carla", cleanerPayout: 80 },
        ],
        total: 200,
      },
    ]);
  });

  it("sorts groups by Cleaner name and safely falls back to the Job snapshot", () => {
    const groups = groupUnpaidJobsByCleaner(
      [
        {
          id: "job-legacy",
          assignedCleanerId: "missing-cleaner",
          assignedCleanerName: "Agnes",
          cleanerPayout: 50,
        },
        { id: "job-2", assignedCleanerId: "carla", cleanerPayout: 75 },
      ],
      [{ id: "carla", name: "Carla Perez" }],
    );

    expect(groups.map((group) => group.cleaner.name)).toEqual(["Agnes", "Carla Perez"]);
    expect(groups[0]).toMatchObject({
      cleaner: {
        id: "missing-cleaner",
        name: "Agnes",
        preferredPaymentMethod: "",
      },
      total: 50,
    });
  });
});

it("keeps the entire hourly job out of payable groups and totals", () => {
  const fixed = { id: "fixed", assignedCleanerId: "one", cleanerPayout: 72 };
  const hourly = { ...fixed, id: "hourly", pay: { mode: "HOURLY", rateCents: 2500 } };
  expect(groupUnpaidJobsByCleaner([hourly], [])).toEqual([]);
  expect(groupUnpaidJobsByCleaner([fixed, hourly], [])).toEqual(groupUnpaidJobsByCleaner([fixed], []));
});

it("uses roster order for the residual cent and omits only the cleaner whose payment was recorded", () => {
  const job = { id: "team", schemaVersion: 2, assignedCleanerIds: ["z", "b", "a"], cleanerPayout: 100 };
  const groups = input => groupUnpaidJobsByCleaner([input], []).map(group => [group.cleaner.id, group.jobs[0].payoutShareCents, group.total]);
  expect(groups(job)).toEqual([["z", 3334, 33.34], ["b", 3333, 33.33], ["a", 3333, 33.33]]);
  expect(groups({ ...job, payoutIdsByCleaner: { z: "already-paid" } })).toEqual([["b", 3333, 33.33], ["a", 3333, 33.33]]);
  expect(groups({ ...job, pay: { mode: "FIXED", perCleanerCents: 2000 } }))
    .toEqual([["z", 2000, 20], ["b", 2000, 20], ["a", 2000, 20]]);
  expect(groups({ ...job, payoutId: "historical-payment" })).toEqual([]);
});

it("does not substitute the current house total for a frozen, unknown or hourly individual agreement", () => {
  const job = { id: "team", schemaVersion: 2, assignedCleanerIds: ["first", "second"], cleanerPayout: 500,
    payoutAgreementsByCleaner: { first: { offeredCompensation: 63.45 }, second: { offeredCompensation: null } } };
  const groups = groupUnpaidJobsByCleaner([job], []);
  expect(groups.map(group => [group.cleaner.id, group.total])).toEqual([["first", 63.45]]);
  expect(groupUnpaidJobsByCleaner([{ ...job, payoutAgreementsByCleaner: {
    first: null, second: { offeredPay: { mode: "HOURLY", rateCents: 2000 } },
  } }], [])).toEqual([]);
});
