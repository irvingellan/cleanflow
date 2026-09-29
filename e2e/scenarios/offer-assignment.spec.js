import {
  cleanupScenarioFixture,
  createScenarioJob,
  expect,
  loginManager,
  seedScenarioFixture,
  step,
  test,
} from "./support.js";

function offerCard(page, cleanerName) {
  return page.locator(".offer-status-item").filter({ hasText: cleanerName });
}

async function createPublicLink(page, cleanerName, suggestedAmount) {
  const card = offerCard(page, cleanerName);
  await card.getByRole("button", { name: "Create public link" }).click();
  await expect(card.getByLabel("Offered compensation (USD)")).toHaveValue(
    String(suggestedAmount),
  );
  await card.getByRole("button", { name: "Create public link" }).click();

  const link = card.getByRole("link", { name: "Open public cleaner offer" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const url = new URL(href, page.url());
  expect(url.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(url.port).toBe("5002");
  expect(url.pathname).toMatch(/^\/offer\/[^/]+$/);
  return url.toString();
}

test("offer-assignment", async ({ page, browser }, testInfo) => {
  const fixture = await step(0, "Starting emulator fixtures", () =>
    seedScenarioFixture(testInfo, "offer-assignment"));
  let cleanerAContext;
  let cleanerBContext;

  try {
    await step(10, "Login manager", () => loginManager(page));
    const { jobRef } = await step(20, "Create service", () =>
      createScenarioJob(page, fixture));
    const createdJob = await jobRef.get();
    expect(createdJob.exists).toBe(true);
    expect(createdJob.data().propertyId).toBe(fixture.propertyId);
    const suggestedAmount = createdJob.data().cleanerPayout;
    expect(typeof suggestedAmount).toBe("number");

    await step(35, "Offer service to two cleaners", async () => {
      await page.getByRole("button", { name: "Offer cleaning to cleaners" }).click();
      await page.getByLabel(fixture.cleanerAName).check();
      await page.getByLabel(fixture.cleanerBName).check();
      await page.getByRole("button", { name: "Create offers" }).click();
      await expect(page.locator(".offers-section__success")).toContainText("Offers created (2)");

      const [job, offerA, offerB] = await Promise.all([
        jobRef.get(),
        jobRef.collection("offers").doc(fixture.cleanerAId).get(),
        jobRef.collection("offers").doc(fixture.cleanerBId).get(),
      ]);
      expect(job.data().operationalStatus).toBe("OFFERED");
      expect(job.data().assignedCleanerIds).toEqual([]);
      expect(offerA.data()).toMatchObject({
        cleanerId: fixture.cleanerAId,
        status: "PENDING",
      });
      expect(offerB.data()).toMatchObject({
        cleanerId: fixture.cleanerBId,
        status: "PENDING",
      });
      expect((await jobRef.collection("assignments").get()).empty).toBe(true);
    });

    const { cleanerALink, cleanerBLink } = await step(45, "Create public Offer links", async () => {
      // The manager UI displays only its most recently generated link. Retain
      // each local emulator URL immediately, without printing its bearer token.
      const cleanerALink = await createPublicLink(
        page, fixture.cleanerAName, suggestedAmount);
      const cleanerBLink = await createPublicLink(
        page, fixture.cleanerBName, suggestedAmount);
      const [offerA, offerB] = await Promise.all([
        jobRef.collection("offers").doc(fixture.cleanerAId).get(),
        jobRef.collection("offers").doc(fixture.cleanerBId).get(),
      ]);
      for (const offer of [offerA, offerB]) {
        expect(offer.data().offeredCompensation).toBe(suggestedAmount);
        expect(offer.data().publicOfferTokenHash).toMatch(/^[a-f0-9]{64}$/);
        expect(offer.data().publicOfferExpiresAt).toBeTruthy();
      }
      return { cleanerALink, cleanerBLink };
    });

    const publicContextOptions = {
      serviceWorkers: "block",
      ...(process.env.SCENARIO_MOBILE === "1" ? { viewport: { width: 390, height: 844 } } : {}),
      ...(process.env.SCENARIO_RECORD === "1" ? { recordVideo: { dir: testInfo.outputDir } } : {}),
    };
    cleanerAContext = await browser.newContext(publicContextOptions);
    cleanerBContext = await browser.newContext(publicContextOptions);
    const cleanerAPage = await cleanerAContext.newPage();
    const cleanerBPage = await cleanerBContext.newPage();

    await step(55, "Cleaner A expresses interest", async () => {
      await cleanerAPage.goto(cleanerALink);
      await expect(cleanerAPage.getByRole("button", {
        name: /I'm interested|Tenho interesse|Me interesa/,
      })).toBeVisible();
      await expect(cleanerAPage.getByText(fixture.cleanerBName)).toHaveCount(0);
      await cleanerAPage.getByRole("button", {
        name: /I'm interested|Tenho interesse|Me interesa/,
      }).click();
      await expect.poll(async () =>
        (await jobRef.collection("offers").doc(fixture.cleanerAId).get()).data()?.status,
      ).toBe("INTERESTED");
      const offer = await jobRef.collection("offers").doc(fixture.cleanerAId).get();
      expect(offer.data().respondedAt).toBeTruthy();
    });

    await step(65, "Cleaner B declines", async () => {
      await cleanerBPage.goto(cleanerBLink);
      await expect(cleanerBPage.getByRole("button", {
        name: /Not available|Não posso|No puedo/,
      })).toBeVisible();
      await expect(cleanerBPage.getByText(fixture.cleanerAName)).toHaveCount(0);
      await cleanerBPage.getByRole("button", {
        name: /Not available|Não posso|No puedo/,
      }).click();
      await expect.poll(async () =>
        (await jobRef.collection("offers").doc(fixture.cleanerBId).get()).data()?.status,
      ).toBe("DECLINED");
      const offer = await jobRef.collection("offers").doc(fixture.cleanerBId).get();
      expect(offer.data().respondedAt).toBeTruthy();
      const job = await jobRef.get();
      expect(job.data().operationalStatus).toBe("OFFERED");
      expect(job.data().assignedCleanerIds).toEqual([]);
      expect((await jobRef.collection("assignments").get()).empty).toBe(true);
    });

    let assignmentId;
    await step(80, "Manager assigns interested Cleaner A", async () => {
      await page.getByRole("button", { name: "Refresh offers" }).click();
      const cardA = offerCard(page, fixture.cleanerAName);
      const cardB = offerCard(page, fixture.cleanerBName);
      await expect(cardA).toContainText("Interested");
      await expect(cardB).toContainText("Not available");
      await expect(cardB.getByRole("button", { name: "Assign" })).toHaveCount(0);
      await cardA.getByRole("button", { name: "Assign" }).click();
      await expect(page.getByText("1 cleaner assigned")).toBeVisible();

      const [job, assignments, offerA, offerB] = await Promise.all([
        jobRef.get(),
        jobRef.collection("assignments").get(),
        jobRef.collection("offers").doc(fixture.cleanerAId).get(),
        jobRef.collection("offers").doc(fixture.cleanerBId).get(),
      ]);
      expect(job.data()).toMatchObject({
        operationalStatus: "ASSIGNED",
        assignedCleanerIds: [fixture.cleanerAId],
      });
      expect(assignments.size).toBe(1);
      assignmentId = assignments.docs[0].id;
      expect(assignments.docs[0].data()).toMatchObject({
        organizationId: fixture.orgRef.id,
        jobId: jobRef.id,
        cleanerId: fixture.cleanerAId,
        source: "OFFER",
        sourceOfferId: fixture.cleanerAId,
        executionStatus: "ASSIGNED",
        isActive: true,
      });
      expect(offerA.data().status).toBe("INTERESTED");
      expect(offerB.data().status).toBe("DECLINED");
    });

    await step(90, "Cleaner A confirms the Assignment", async () => {
      await cleanerAPage.reload();
      await cleanerAPage.getByRole("button", {
        name: /Confirm I'll be there|Confirmo que estarei presente|Confirmo que asistiré/,
      }).click();
      await expect(cleanerAPage.getByRole("status")).toContainText(
        /Your confirmation was saved|Sua confirmação foi salva|Se guardó tu confirmación/,
      );
      const assignment = await jobRef.collection("assignments").doc(assignmentId).get();
      expect(assignment.data().cleanerAcknowledgedAt).toBeTruthy();
      expect(assignment.data().cleanerAcknowledgedOfferId).toBe(fixture.cleanerAId);
    });

    await step(100, "Verify Offer and Assignment state", async () => {
      // Refresh offers updates only Offer state; reopening Job Detail also
      // reloads the Assignment roster that carries the acknowledgment.
      await page.locator(".back-button").click();
      await page.getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name: "Jobs" }).click();
      await page.getByRole("button", {
        name: `View ${fixture.propertyName}`,
      }).click();
      await expect(page.locator(".assignment-roster__item").filter({
        hasText: fixture.cleanerAName,
      })).toContainText("Confirmed through link");
      const job = await jobRef.get();
      expect(job.data().operationalStatus).toBe("ASSIGNED");
      expect(job.data().assignedCleanerIds).toEqual([fixture.cleanerAId]);
    });
  } finally {
    try {
      await Promise.all([cleanerAContext?.close(), cleanerBContext?.close()]);
    } finally {
      await cleanupScenarioFixture(fixture);
    }
  }
});
