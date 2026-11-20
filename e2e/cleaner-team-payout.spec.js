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

test("a completed hourly job pays an approved share exactly once while another is pending", async ({ page }) => {
  const org = getE2eFirestore().collection("organizations").doc(managerOrganizationId);
  const job = org.collection("jobs").doc("sample-hourly-" + randomUUID());
  const approved = "sample-approved";
  const pending = "sample-pending";
  await job.set({
    organizationId: managerOrganizationId, schemaVersion: 2, serviceType: "STANDARD",
    operationalStatus: "COMPLETED", assignedCleanerIds: [approved, pending], requiredCleanerCount: 2,
    pay: { mode: "HOURLY", rateCents: 3200 }, billing: { mode: "HOURLY", hourlyRateCents: 4600 },
    cleanerPayout: 250, scheduledDate: "2026-11-01", dataProvenance: "DEMO",
  });
  for (const cleanerId of [approved, pending]) {
    await job.collection("assignments").doc(cleanerId).set({
      jobId: job.id, cleanerId, organizationId: managerOrganizationId, isActive: true, source: "MANAGER_DIRECT",
      paySnapshot: { offeredPay: { mode: "HOURLY", rateCents: 2835 } },
    });
  }
  await loginManager(page);
  const results = await page.evaluate(async ({ jobId, approved, pending }) => {
    const { approveWorkedTime } = await import("/src/features/pricing/workedTimeService.js");
    const { recordPayout } = await import("/src/features/payouts/payoutService.js");
    const approval = await approveWorkedTime(jobId, approved, 121);
    const pay = id => recordPayout({ cleaner: { id, name: "Sample cleaner" }, jobIds: [jobId], paymentMethod: "CASH", note: "" });
    const settlements = await Promise.allSettled([pay(approved), pay(approved), pay(pending)]);
    return { approval, amounts: settlements.filter(row => row.status === "fulfilled").map(row => row.value.amount),
      errors: settlements.filter(row => row.status === "rejected").map(row => row.reason.code) };
  }, { jobId: job.id, approved, pending });
  expect(results).toEqual({
    approval: { minutes: 120, payoutCents: 5670 }, amounts: [56.7], errors: ["job-not-payable", "job-not-payable"],
  });
  const data = (await job.get()).data();
  expect(Object.keys(data.payoutIdsByCleaner)).toEqual([approved]);
  const receipt = (await org.collection("payouts").doc(data.payoutIdsByCleaner[approved]).get()).data();
  expect(receipt).toMatchObject({ cleanerId: approved, amount: 56.7, jobAmountsCents: { [job.id]: 5670 } });
  expect(data.billing).not.toHaveProperty("hours");
});
