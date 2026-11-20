import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { managerOrganizationId } from "../src/services/firebase/config.js";
import { getE2eFirestore } from "./globalSetup.js";
import { loginManager } from "./scenarios/support.js";

test("two manager payment transactions settle only the selected cleaner's share", async ({ page }) => {
  const org = getE2eFirestore().collection("organizations").doc(managerOrganizationId);
  const job = org.collection("jobs").doc("sample-share-" + randomUUID());
  const first = "sample-first", second = "sample-second", third = "sample-third";
  await job.set({
    organizationId: managerOrganizationId, schemaVersion: 2, serviceType: "STANDARD",
    operationalStatus: "COMPLETED", assignedCleanerIds: [first, second, third],
    requiredCleanerCount: 3, cleanerPayout: 100, clientPrice: 142.17,
    scheduledDate: "2026-11-01", dataProvenance: "DEMO",
  });
  await loginManager(page);
  const results = await page.evaluate(async ({ jobId, first, second }) => {
    const { recordPayout } = await import("/src/features/payouts/payoutService.js");
    const pay = id => recordPayout({ cleaner: { id, name: "Sample cleaner" }, jobIds: [jobId], paymentMethod: "CASH", note: "" });
    return Promise.allSettled([pay(first), pay(first), pay(second)]).then(rows => rows.map(row =>
      row.status === "fulfilled" ? { status: row.status, amount: row.value.amount } : { status: row.status, code: row.reason.code }));
  }, { jobId: job.id, first, second });
  expect(results.filter(x => x.status === "fulfilled").map(x => x.amount).sort()).toEqual([33.33, 33.34]);
  expect(results.filter(x => x.status === "rejected")).toEqual([{ status: "rejected", code: "job-not-payable" }]);
  const storedJob = (await job.get()).data();
  expect(storedJob.cleanerPayout).toBe(100);
  expect(storedJob.clientPrice).toBe(142.17);
  expect(storedJob).not.toHaveProperty("payoutId");
  expect(Object.keys(storedJob.payoutIdsByCleaner).sort()).toEqual([first, second].sort());
  for (const [id, amount] of [[first, 3334], [second, 3333]]) {
    const receipt = await org.collection("payouts").doc(storedJob.payoutIdsByCleaner[id]).get();
    expect(receipt.data()).toMatchObject({ cleanerId: id, jobAmountsCents: { [job.id]: amount }, amount: amount / 100, jobIds: [job.id] });
  }
  expect((await org.collection("payouts").where("jobIds", "array-contains", job.id).get()).size).toBe(2);
});
