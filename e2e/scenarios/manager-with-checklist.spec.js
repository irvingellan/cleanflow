import {
  expect,
  test,
  step,
  seedScenarioFixture,
  cleanupScenarioFixture,
  loginManager,
  createScenarioJob,
  syntheticPng,
} from "./support.js";

const localOrigin = (value) => {
  const url = new URL(value);
  expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
  expect(url.protocol).toBe("http:");
  return url;
};

test("manager service with checklist reaches saved review, report, and completion", async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  const fixture = await seedScenarioFixture(testInfo, "manager-with-checklist");
  let cleanerContext;
  let reportContext;
  const publicContextOptions = {
    serviceWorkers: "block",
    ...(process.env.SCENARIO_MOBILE === "1" ? { viewport: { width: 390, height: 844 } } : {}),
    ...(process.env.SCENARIO_RECORD === "1" ? { recordVideo: { dir: testInfo.outputDir } } : {}),
  };

  try {
    await step(0, "Login manager", () => loginManager(page));

    const created = await step(10, "Create service", () => createScenarioJob(page, fixture));
    const { jobId, jobRef } = created;
    const createdJob = (await jobRef.get()).data();
    expect(createdJob).toMatchObject({
      propertyId: fixture.propertyId,
      operationalStatus: "UNASSIGNED",
      scheduledDate: created.scheduledDate,
      scheduledStart: created.scheduledStart,
    });

    await step(20, "Assign cleaner directly", async () => {
      await page.getByRole("button", { name: "Assign cleaner" }).click();
      const roster = page.locator(".assignment-roster");
      await roster.getByRole("combobox", { name: "Assigned cleaner" }).selectOption(fixture.cleanerAId);
      await roster.getByRole("button", { name: "Confirm assignment" }).click();
      await expect(roster.locator(".assignment-roster__item").filter({ hasText: fixture.cleanerAName }))
        .toBeVisible();

      await expect.poll(async () => (await jobRef.get()).data()?.operationalStatus).toBe("ASSIGNED");
      const assignments = await jobRef.collection("assignments").get();
      expect(assignments.docs.filter((doc) => doc.data().isActive)).toHaveLength(1);
      expect(assignments.docs.find((doc) => doc.data().isActive)?.data()).toMatchObject({
        cleanerId: fixture.cleanerAId,
        source: "MANAGER_DIRECT",
        executionStatus: "ASSIGNED",
      });
      expect((await jobRef.collection("offers").get()).empty).toBe(true);
    });

    let checklistUrl;
    const runRef = jobRef.collection("checklistRuns").doc("initial");
    await step(35, "Prepare reminder with checklist", async () => {
      const rosterItem = page.locator(".assignment-roster__item")
        .filter({ hasText: fixture.cleanerAName });
      await rosterItem.getByRole("button", { name: "Prepare message" }).click();
      const preview = page.locator(".job-reminder-preview");
      await expect(preview.locator("pre")).toContainText(fixture.propertyName);
      await preview.getByRole("checkbox", { name: "Include checklist link" }).check();
      await preview.getByRole("button", { name: "Prepare checklist link" }).click();
      await expect(preview.getByText("Checklist link added to this message. Review before sending."))
        .toBeVisible();

      const message = await preview.locator("pre").textContent();
      checklistUrl = message?.match(/https?:\/\/[^\s]+\/checklist\?t=[^\s]+/)?.[0];
      expect(checklistUrl).toBeTruthy();
      expect(localOrigin(checklistUrl).origin).toBe(localOrigin(page.url()).origin);
      expect(localOrigin(checklistUrl).pathname).toBe("/checklist");

      const run = (await runRef.get()).data();
      expect(run).toMatchObject({ jobId, status: "DRAFT" });
      const capability = (await runRef.collection("checklistCapabilities").doc("active").get()).data();
      expect(capability).toMatchObject({
        jobId,
        cleanerId: fixture.cleanerAId,
        status: "ACTIVE",
      });
      expect(capability.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    cleanerContext = await browser.newContext(publicContextOptions);
    const cleanerPage = await cleanerContext.newPage();
    await step(50, "Open cleaner checklist in Portuguese", async () => {
      await cleanerPage.goto(checklistUrl);
      await expect(cleanerPage.getByRole("heading", { name: "Checklist de limpeza" })).toBeVisible();
      await expect(cleanerPage.locator(".public-checklist__language select")).toHaveValue("pt");
      await expect(cleanerPage.locator(".public-checklist__context").first())
        .toContainText(fixture.propertyName);
    });

    await step(65, "Save required checklist and inventory answers", async () => {
      const doneRadios = cleanerPage.locator('.public-checklist__item input[type="radio"][value="DONE"]');
      const checklistItemCount = await doneRadios.count();
      expect(checklistItemCount).toBeGreaterThan(0);
      for (let index = 0; index < checklistItemCount; index += 1) {
        await doneRadios.nth(index).check();
      }

      const inventory = cleanerPage.locator(".public-checklist__inventory-item select");
      const inventoryItemCount = await inventory.count();
      expect(inventoryItemCount).toBeGreaterThan(0);
      for (let index = 0; index < inventoryItemCount; index += 1) {
        await inventory.nth(index).selectOption("HIGH");
      }
      await expect(cleanerPage.locator(".public-checklist__save-status"))
        .toHaveClass(/public-checklist__save-status--saved/);
    });

    await step(75, "Upload synthetic required photo", async () => {
      const photo = cleanerPage.locator(".public-checklist__photo");
      await photo.locator('input[type="file"]').nth(1).setInputFiles({
        name: "synthetic-cleaning.png",
        mimeType: "image/png",
        buffer: syntheticPng,
      });
      await expect(photo.getByText("Foto salva")).toBeVisible();
      const evidence = (await runRef.collection("evidence").doc("living-belongings").get()).data();
      expect(evidence).toMatchObject({
        requirementId: "living-belongings",
        status: "SAVED",
        contentType: "image/png",
      });
      expect(evidence.storagePath).toContain(`/jobs/${jobId}/checklistRuns/initial/evidence/`);
    });

    await step(82, "Send checklist for manager review", async () => {
      await cleanerPage.getByRole("button", { name: "Enviar checklist para revisão" }).click();
      const confirmation = cleanerPage.getByRole("dialog", { name: "Enviar checklist para revisão?" });
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole("button", { name: "Enviar checklist para revisão" }).click();
      await expect(cleanerPage.getByRole("heading", { name: "Pronto para revisão da gerente" }))
        .toBeVisible();
      await expect.poll(async () => (await runRef.get()).data()?.status).toBe("READY_FOR_REVIEW");
      const run = (await runRef.get()).data();
      expect(run.readyForReviewCleanerId).toBe(fixture.cleanerAId);
      expect(run.readyForReviewAt).toBeTruthy();
      const draft = (await runRef.collection("drafts").doc("current").get()).data();
      expect(Object.values(draft.checklistAnswers).every((answer) => answer === "DONE")).toBe(true);
      expect(Object.values(draft.inventoryAnswers).every((answer) => answer === "HIGH")).toBe(true);
    });

    await step(88, "Review saved answers and evidence", async () => {
      await page.locator(".job-checklist").getByRole("button", { name: "Open checklist" }).click();
      await page.getByRole("button", { name: "Refresh saved progress" }).click();
      await expect(page.getByText("The cleaner sent this saved checklist for manager review."))
        .toBeVisible();
      await expect(page.locator(".checklist-run__answers").first()).toContainText("Done");
      await expect(page.locator(".checklist-run__evidence-photo")).toBeVisible();
    });

    let reportUrl;
    await step(93, "Create and open client report", async () => {
      const reportControls = page.locator(".client-report-controls");
      await reportControls.getByRole("button", { name: "Create client report" }).click();
      const reportLink = reportControls.getByRole("link", { name: "Open report" });
      await expect(reportLink).toBeVisible();
      reportUrl = await reportLink.getAttribute("href");
      expect(reportUrl).toBeTruthy();
      expect(localOrigin(reportUrl).origin).toBe(localOrigin(page.url()).origin);
      expect(localOrigin(reportUrl).pathname).toBe("/client-report");

      reportContext = await browser.newContext(publicContextOptions);
      const reportPage = await reportContext.newPage();
      await reportPage.goto(reportUrl);
      await expect(reportPage.getByRole("heading", { name: "Cleaning report" })).toBeVisible();
      await expect(reportPage.locator(".client-report__photo")).toBeVisible();
      await expect.poll(() => reportPage.locator(".client-report__photo")
        .evaluate((photo) => photo.naturalWidth)).toBeGreaterThan(0);
      expect((await runRef.collection("clientReportCapabilities").doc("active").get()).data())
        .toMatchObject({ status: "ACTIVE" });
    });

    await step(100, "Approve and complete service", async () => {
      await page.getByRole("button", { name: "Approve and complete service" }).click();
      const confirmation = page.locator(".completion-confirmation");
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole("button", { name: "Approve and complete service" }).click();
      await expect.poll(async () => (await jobRef.get()).data()?.operationalStatus).toBe("COMPLETED");
      const completed = (await jobRef.get()).data();
      expect(completed.completedAt).toBeTruthy();
      expect(completed.clientPrice).toBe(createdJob.clientPrice);
      expect(completed.cleanerPayout).toBe(createdJob.cleanerPayout);
      expect(completed.paymentStatus).toBe(createdJob.paymentStatus);
      expect(completed.payoutStatus).toBe(createdJob.payoutStatus);
      expect((await runRef.get()).data()?.status).toBe("READY_FOR_REVIEW");
    });
  } finally {
    await reportContext?.close();
    await cleanerContext?.close();
    await cleanupScenarioFixture(fixture);
  }
});
