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
