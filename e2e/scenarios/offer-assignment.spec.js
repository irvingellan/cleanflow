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
  expect(url.origin).toBe(new URL(page.url()).origin);
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
      await page.locator("details.job-detail-section > summary", { hasText: "Offers" }).click();
      await page.locator(".offers-section").getByRole("button", { name: "Offer cleaning to cleaners" }).click();
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

    await step(55, "Both recipients open their own invitation", async () => {
      await Promise.all([cleanerAPage.goto(cleanerALink), cleanerBPage.goto(cleanerBLink)]);
      await expect(cleanerAPage.getByRole("button", { name: "Confirmar serviço" })).toBeEnabled();
      await expect(cleanerBPage.getByRole("button", { name: /confirm (job|service)/i })).toBeEnabled();
      await expect(cleanerAPage.getByText(fixture.cleanerBName)).toHaveCount(0);
      await expect(cleanerBPage.getByText(fixture.cleanerAName)).toHaveCount(0);
    });

    await step(65, "Cleaner A takes the open spot through her own link", async () => {
      await cleanerAPage.getByRole("button", { name: "Confirmar serviço" }).click();
      await expect(cleanerAPage.getByText("Serviço confirmado para você ✅")).toBeVisible();
      const assignments = await jobRef.collection("assignments").get();
      expect(assignments.size).toBe(1);
      expect(assignments.docs[0].data()).toMatchObject({
        jobId: jobRef.id, cleanerId: fixture.cleanerAId, sourceOfferId: fixture.cleanerAId,
        assignmentMethod: "FIRST_ACCEPT_WINS", confirmationChannel: "WHATSAPP_LINK", isActive: true,
      });
      expect(assignments.docs[0].data().cleanerAcknowledgedAt).toBeTruthy();
      const offer = await jobRef.collection("offers").doc(fixture.cleanerAId).get();
      expect(offer.data().status).toBe("ACCEPTED");
      expect(offer.data().respondedAt).toBeTruthy();
    });

    await step(80, "The other open tab cannot take the same spot", async () => {
      await cleanerBPage.getByRole("button", { name: /confirm (job|service)/i }).click();
      await expect(cleanerBPage.getByText(/another cleaner already took this (job|service)/i)).toBeVisible();
      await expect(cleanerBPage.getByText(fixture.cleanerAName)).toHaveCount(0);
      const job = await jobRef.get();
      expect(job.data().operationalStatus).toBe("ASSIGNED");
      expect(job.data().assignedCleanerIds).toEqual([fixture.cleanerAId]);
      expect((await jobRef.collection("assignments").get()).size).toBe(1);
    });

    await step(100, "The winner's receipt survives reload and reaches the manager inbox", async () => {
      await cleanerAPage.reload();
      await expect(cleanerAPage.getByText("Serviço confirmado para você ✅")).toBeVisible();
      await expect(cleanerAPage.getByRole("button", { name: "Confirmar serviço" })).toHaveCount(0);
      await page.getByRole("button", { name: /\bInbox\b/ }).click();
      const receipt = page.getByRole("listitem").filter({ hasText: fixture.propertyName }).filter({ hasText: /WhatsApp/i });
      await expect(receipt).toHaveCount(1);
      await expect(receipt).toContainText(fixture.cleanerAName);
    });
  } finally {
    try {
      await Promise.all([cleanerAContext?.close(), cleanerBContext?.close()]);
    } finally {
      await cleanupScenarioFixture(fixture);
    }
  }
});

test("a single manual invitation still waits for the manager and supports a separate acknowledgment", async ({ page, browser }, testInfo) => {
  const fixture = await seedScenarioFixture(testInfo, "single-manual-invitation");
  const guest = await browser.newContext({ serviceWorkers: "block", locale: "pt-BR" });
  try {
    await loginManager(page);
    const { jobRef } = await createScenarioJob(page, fixture);
    await page.locator("details.job-detail-section > summary", { hasText: "Offers" }).click();
    await page.locator(".offers-section").getByRole("button", { name: "Offer cleaning to cleaners" }).click();
    await page.getByLabel(fixture.cleanerAName).check();
    await page.getByRole("button", { name: "Create offers" }).click();
    await expect(page.locator(".offers-section__success")).toContainText("Offers created (1)");
    const link = await createPublicLink(page, fixture.cleanerAName, (await jobRef.get()).get("cleanerPayout"));
    const invitation = await guest.newPage();
    await invitation.goto(link);
    await expect(invitation.getByRole("button", { name: "Confirmar serviço" })).toHaveCount(0);
    await invitation.getByRole("button", { name: "Tenho interesse" }).click();
    const offer = jobRef.collection("offers").doc(fixture.cleanerAId);
    await expect.poll(async () => (await offer.get()).get("status")).toBe("INTERESTED");
    expect((await jobRef.get()).get("assignedCleanerIds")).toEqual([]);
    expect((await jobRef.collection("assignments").get()).empty).toBe(true);
    await page.getByRole("button", { name: "Refresh offers" }).click();
    await offerCard(page, fixture.cleanerAName).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect.poll(async () => (await jobRef.get()).get("assignedCleanerIds")).toEqual([fixture.cleanerAId]);
    await invitation.reload();
    await invitation.getByRole("button", { name: /Confirmo que estarei presente|Confirm I.ll be there/ }).click({ timeout: 15_000 });
    await expect(invitation.getByRole("status")).toContainText(/Sua confirmação foi salva|Your confirmation was saved/);
    const assignments = await jobRef.collection("assignments").get();
    expect(assignments.size).toBe(1);
    expect(assignments.docs[0].get("cleanerAcknowledgedOfferId")).toBe(fixture.cleanerAId);
    expect(assignments.docs[0].get("cleanerAcknowledgedAt")).toBeTruthy();
    expect((await offer.get()).get("status")).toBe("INTERESTED");
  } finally {
    await guest.close();
    await cleanupScenarioFixture(fixture);
  }
});
