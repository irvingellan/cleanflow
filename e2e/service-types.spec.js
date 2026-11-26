import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { e2eManager, getE2eFirestore, managerE2ePorts } from "./globalSetup.js";

test("a manager creates a post-construction service and opens its frozen checklist", async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const ports = managerE2ePorts();
  const org = getE2eFirestore().collection("organizations").doc("cleanflow-demo");
  const propertyId = "e2e-client-property";
  const propertyName = "E2E Client Property";
  const cleanerId = "e2e-team-cleaner-a";
  const fixtureNote = `Synthetic service type ${randomUUID()}`;
  const serviceDate = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/");
  await page.getByLabel("Email").fill(e2eManager.email);
  await page.getByLabel("Password").fill(e2eManager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();

  const jobsNav = page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Jobs" });
  await jobsNav.click();
  await page.locator(".cf-services").getByRole("button", { name: "New service", exact: true }).click();
  const form = page.locator(".cleaning-form");
  await form.getByRole("searchbox").fill(propertyName);
  await form.getByRole("combobox", { name: "Property" }).selectOption(propertyId);
  const serviceType = form.getByRole("combobox", { name: "Service type" });
  await expect(serviceType).toHaveValue("STANDARD");
  await serviceType.selectOption("POST_CONSTRUCTION");
  await form.getByLabel("Date", { exact: true }).fill(serviceDate);
  await form.getByRole("textbox", { name: "Notes" }).fill(fixtureNote);
  await form.getByRole("button", { name: "Create cleaning" }).click();

  const context = page.locator(".job-detail__context");
  await expect(context.getByText("Post-construction", { exact: true })).toBeVisible();
  const created = await org.collection("jobs").where("notes", "==", fixtureNote).get();
  expect(created.size).toBe(1);
  const job = created.docs[0].ref;
  const run = job.collection("checklistRuns").doc("initial");
  expect(created.docs[0].data().serviceType).toBe("POST_CONSTRUCTION");
  await jobsNav.click();
  const row = page.locator(`.job-card[data-job-id="${job.id}"]`);
  await expect(row.getByText("Post-construction")).toBeVisible();
  await row.click();

  await page.locator(".job-detail-section > summary").filter({ hasText: /^Cleaner & assignment$/ }).click();
  const roster = page.locator(".assignment-roster");
  await roster.getByRole("button", { name: "Assign cleaner", exact: true }).click();
  await roster.getByRole("radio", { name: "E2E Team Cleaner A", exact: true }).check();
  await roster.getByRole("button", { name: "Confirm assignment" }).click();
  await roster.locator(".assignment-roster__item").getByRole("button", { name: "Prepare message" }).click();
  const agenda = org.collection("cleanerAgenda").doc(`${cleanerId}__${job.id}`);
  await expect.poll(async () => (await agenda.get()).data()?.serviceType, { timeout: 20_000 }).toBe("POST_CONSTRUCTION");

  const reminder = page.locator(".job-reminder-preview");
  await reminder.getByRole("checkbox", { name: "Include checklist link" }).check();
  await reminder.getByRole("button", { name: "Prepare checklist link" }).click();
  await expect(reminder.getByText("Checklist link added to this message. Review before sending.")).toBeVisible({ timeout: 15_000 });
  const message = await reminder.locator("pre").textContent();
  const checklistUrl = message?.match(/https?:\/\/[^\s]+\/checklist\?t=[^\s]+/)?.[0];
  expect(Boolean(checklistUrl)).toBe(true);
  expect(new URL(checklistUrl).origin).toBe(new URL(page.url()).origin);
  const frozen = (await run.get()).data();
  expect(frozen.jobSnapshot.serviceType).toBe("POST_CONSTRUCTION");

  await page.locator(".job-detail-section > summary").filter({ hasText: /^Service details$/ }).click();
  await page.getByRole("button", { name: "Edit service details" }).click();
  await page.getByRole("combobox", { name: "Service type" }).selectOption("DEEP_CLEANING");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(context.getByText("Deep cleaning", { exact: true })).toBeVisible();
  expect((await job.get()).data().serviceType).toBe("DEEP_CLEANING");
  await expect.poll(async () => (await agenda.get()).data()?.serviceType, { timeout: 20_000 }).toBe("DEEP_CLEANING");
  expect((await run.get()).data().resolvedDefinition).toEqual(frozen.resolvedDefinition);

  const cleaner = await browser.newContext({ serviceWorkers: "block" });
  try {
    // Vite has no Hosting rewrites. Forward the public API to the real local Function.
    await cleaner.route("**/api/public-checklist**", async (route) => {
      const endpoint = new URL(`http://127.0.0.1:${ports.functions}/demo-cleanflow/us-central1/publicChecklist`);
      endpoint.search = new URL(route.request().url()).search;
      await route.fulfill({ response: await route.fetch({ url: endpoint.href }) });
    });
    const checklist = await cleaner.newPage();
    await checklist.goto(checklistUrl);
    const checklistLanguage = checklist.locator(".public-checklist__header select");
    await expect(checklistLanguage).toBeVisible({ timeout: 15_000 });
    await checklistLanguage.selectOption("pt");
    const section = checklist.getByRole("region", { name: /^Pós-obra/ });
    await expect(checklist.getByRole("heading", { name: "Checklist de limpeza" })).toBeVisible();
    const fineDust = section.getByRole("group", { name: "Remova a poeira fina de superfícies e cantos" });
    await expect(fineDust).toBeVisible();
    await expect(checklist.locator(".public-checklist__header").getByText("Pós-obra", { exact: true })).toBeVisible();
    await fineDust.locator('label[data-answer="DONE"]').click();
    await expect.poll(async () => {
      const snapshot = await run.collection("drafts").doc("current").get();
      return snapshot.data()?.checklistAnswers?.["service-type-post-construction-fine-dust"];
    }).toBe("DONE");
    await checklist.reload();
    await checklistLanguage.selectOption("pt");
    await expect(fineDust.getByRole("radio", { name: "Concluído" })).toBeChecked();

    for (const width of [375, 1440]) {
      await checklist.setViewportSize({ width, height: width === 375 ? 844 : 1000 });
      for (const theme of ["light", "dark"]) {
        await checklist.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await expect(checklist.locator("html")).toHaveAttribute("data-theme", theme);
        const heading = section.getByRole("heading");
        await heading.evaluate((element) => {
          element.scrollIntoView({ block: "start", behavior: "instant" });
          window.scrollBy({ top: -120, behavior: "instant" });
        });
        await expect.poll(async () => (await heading.boundingBox())?.y).toBeGreaterThanOrEqual(110);
        expect(await checklist.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await checklist.screenshot({ path: testInfo.outputPath(`pos-obra-${width}-${theme}.png`), animations: "disabled" });
      }
    }
  } finally {
    await cleaner.close();
  }
});
