import {
  test,
  expect,
  step,
  seedScenarioFixture,
  cleanupScenarioFixture,
  loginManager,
  createScenarioJob,
} from "./support.js";

const financialFields = [
  "clientPrice",
  "cleanerPayout",
  "paymentStatus",
  "paymentId",
  "paidAt",
  "payoutStatus",
  "payoutId",
  "payoutPaidAt",
  "invoiceId",
  "invoiceStatus",
];

function financialState(job) {
  return Object.fromEntries(financialFields
    .filter((field) => Object.hasOwn(job, field))
    .map((field) => [field, job[field]]));
}

test("manager-no-checklist", async ({ page }, testInfo) => {
  const fixture = await step(0, "Starting emulator fixtures", () =>
    seedScenarioFixture(testInfo, "manager-no-checklist"));

  try {
  await step(10, "Login manager", () => loginManager(page));

  let created;
  let initialFinancialState;
  await step(20, "Create service and verify Job details", async () => {
    created = await createScenarioJob(page, fixture);
    const [jobSnapshot, propertySnapshot] = await Promise.all([
      created.jobRef.get(),
      fixture.orgRef.collection("properties").doc(fixture.propertyId).get(),
    ]);
    expect(jobSnapshot.exists).toBe(true);
    expect(propertySnapshot.exists).toBe(true);

    const job = jobSnapshot.data();
    const property = propertySnapshot.data();
    expect(job).toMatchObject({
      schemaVersion: 2,
      operationalStatus: "UNASSIGNED",
      propertyId: fixture.propertyId,
      propertyName: fixture.propertyName,
      clientId: property.clientId,
      clientName: property.clientName,
      scheduledDate: created.scheduledDate,
      scheduledStart: created.scheduledStart,
      clientPrice: property.defaultClientPrice,
      cleanerPayout: property.defaultCleanerPrice,
      assignedCleanerIds: [],
    });
    initialFinancialState = financialState(job);
    await expect(page.getByRole("heading", { name: fixture.propertyName })).toBeVisible();
  });

  await step(50, "Assign cleaner directly", async () => {
    const roster = page.locator(".assignment-roster");
    await roster.getByRole("button", { name: "Assign cleaner" }).click();
    await roster.getByRole("searchbox", { name: "Search cleaners by name" })
      .fill(fixture.cleanerAName);
    await roster.getByRole("combobox", { name: "Assigned cleaner" })
      .selectOption(fixture.cleanerAId);
    await roster.getByRole("button", { name: "Confirm assignment" }).click();
    await expect(roster.getByText("Assigned directly")).toBeVisible();

    await expect.poll(async () => (await created.jobRef.get()).data()?.operationalStatus)
      .toBe("ASSIGNED");
    const [jobSnapshot, assignments, offers] = await Promise.all([
      created.jobRef.get(),
      created.jobRef.collection("assignments").get(),
      created.jobRef.collection("offers").get(),
    ]);
    expect(jobSnapshot.data().assignedCleanerIds).toEqual([fixture.cleanerAId]);
    expect(assignments.size).toBe(1);
    expect(assignments.docs[0].data()).toMatchObject({
      jobId: created.jobId,
      cleanerId: fixture.cleanerAId,
      source: "MANAGER_DIRECT",
      isActive: true,
      executionStatus: "ASSIGNED",
    });
    expect(offers.empty).toBe(true);
  });

  await step(65, "Prepare assigned-cleaner reminder", async () => {
    const assignment = page.locator(".assignment-roster__item")
      .filter({ hasText: fixture.cleanerAName });
    await assignment.getByRole("button", { name: "Prepare message" }).click();
    const preview = page.getByRole("region", {
      name: `Review reminder for ${fixture.cleanerAName}`,
    });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("checkbox", { name: "Include checklist link" }))
      .not.toBeChecked();
    const message = preview.locator("pre");
    await expect(message).toContainText(fixture.cleanerAName);
    await expect(message).toContainText(fixture.propertyName);
    await expect(message).toContainText(created.scheduledStart);
    await expect(message).not.toContainText("/checklist?t=");
    expect((await created.jobRef.collection("checklistRuns").get()).empty).toBe(true);
  });

  await step(80, "Complete service without checklist", async () => {
    const completion = page.getByRole("region", { name: "Complete service" });
    await completion.getByRole("button", { name: "Complete service" }).click();
    await expect(completion).toContainText("This service has no checklist. Mark it completed?");
    await completion.getByRole("button", { name: "Complete service" }).click();
    await expect.poll(async () => (await created.jobRef.get()).data()?.operationalStatus)
      .toBe("COMPLETED");
  });

  await step(100, "Verify completed Job and financial isolation", async () => {
    const [jobSnapshot, runs, offers, payouts] = await Promise.all([
      created.jobRef.get(),
      created.jobRef.collection("checklistRuns").get(),
      created.jobRef.collection("offers").get(),
      fixture.orgRef.collection("payouts").where("jobIds", "array-contains", created.jobId).get(),
    ]);
    const job = jobSnapshot.data();
    expect(job.operationalStatus).toBe("COMPLETED");
    expect(job.completedAt?.toMillis()).toEqual(expect.any(Number));
    expect(runs.empty).toBe(true);
    expect(offers.empty).toBe(true);
    expect(financialState(job)).toEqual(initialFinancialState);
    expect(payouts.empty).toBe(true);
  });
  } finally {
    await cleanupScenarioFixture(fixture);
  }
});
