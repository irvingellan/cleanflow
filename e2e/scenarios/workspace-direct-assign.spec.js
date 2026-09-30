import { expect, test, step, loginManager } from "./support.js";
import {
  restrictWorkspaceBrowser, seedWorkspaceFixture, cleanupWorkspaceFixture, openWorkspace, selectWorkspaceJob,
  closeWorkspacePanel, returnWorkspaceList, expectWorkspaceContained,
} from "./workspace-support.js";

test("workspace creates, assigns, and prepares a reminder without replacing the Services list", async ({ page }, testInfo) => {
  page.setDefaultTimeout(20_000);
  await restrictWorkspaceBrowser(page);
  const fixture = await seedWorkspaceFixture(testInfo, "workspace-direct-assign");
  try {
    await step(0, "Login and open experimental workspace", () => loginManager(page));
    const list = await openWorkspace(page, fixture);
    await step(15, "Preserve search, filter, and list scroll across selections", async () => {
      await list.getByRole("button", { name: /Needs assignment/ }).click();
      const mobile = page.viewportSize().width < 1000;
      if (mobile) await page.evaluate(() => window.scrollTo(0, 360));
      else await list.evaluate((element) => { element.scrollTop = 360; });
      await list.locator(`.job-card[data-job-id="${fixture.jobs[5].jobId}"]`).scrollIntoViewIfNeeded();
      const before = mobile ? await page.evaluate(() => window.scrollY) : await list.evaluate((element) => element.scrollTop);
      expect(before).toBeGreaterThan(0);
      await selectWorkspaceJob(page, fixture.jobs[5].jobId);
      await returnWorkspaceList(page);
      await expect(list.getByRole("searchbox", { includeHidden: true })).toHaveValue(fixture.runLabel);
      await expect(list.getByRole("button", { name: /Needs assignment/ })).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => mobile ? page.evaluate(() => window.scrollY) : list.evaluate((element) => element.scrollTop)).toBe(before);
      await list.getByRole("button", { name: /Needs assignment/ }).click();
      await selectWorkspaceJob(page, fixture.jobs[0].jobId);
      await expectWorkspaceContained(page, testInfo, "selected-context");
      await returnWorkspaceList(page);
    });

    let created;
    await step(35, "Create New service in a panel and select the acknowledged Job", async () => {
      await list.getByRole("button", { name: "New service", exact: true }).click();
      const panel = page.getByRole("dialog", { name: "New service", exact: true });
      const form = panel.locator(".cleaning-form");
      await form.getByRole("searchbox").fill(fixture.propertyName);
      await form.getByRole("combobox", { name: "Property", exact: true }).selectOption(fixture.propertyId);
      await expect(form.getByRole("textbox", { name: "Scheduled time" })).toHaveValue("11:00");
      await expect(form.getByRole("spinbutton", { name: "Client price" })).toHaveValue("250");
      await expect(form.getByRole("spinbutton", { name: "Cleaner payout" })).toHaveValue("150");
      await form.getByRole("textbox", { name: "Date", exact: true }).fill(fixture.scheduledDate);
      await form.getByRole("textbox", { name: "Notes", exact: true }).fill(`${fixture.runLabel}-created`);
      await form.getByRole("button", { name: "Create cleaning", exact: true }).click();
      await expect(panel).not.toBeVisible();
      await expect(page.locator(".workspace-detail").getByRole("heading", { name: fixture.propertyName, exact: true })).toBeVisible();
      const jobs = await fixture.orgRef.collection("jobs").where("propertyId", "==", fixture.propertyId).get();
      created = jobs.docs.find((job) => job.data().notes === `${fixture.runLabel}-created`);
      expect(created).toBeTruthy();
      expect(created.data()).toMatchObject({ operationalStatus: "UNASSIGNED", scheduledStart: "11:00", clientPrice: 250, cleanerPayout: 150 });
      await expect(list.getByRole("searchbox", { includeHidden: true })).toHaveValue(fixture.runLabel);
    });

    await step(60, "Use existing authorized direct-Assignment action", async () => {
      await page.locator(".workspace-next-actions").getByRole("button", { name: "Assign cleaner", exact: true }).click();
      const panel = page.locator(".workspace-action-panel");
      await panel.getByRole("combobox", { name: "Assigned cleaner", exact: true }).selectOption(fixture.cleanerAId);
      await panel.getByRole("button", { name: "Confirm assignment", exact: true }).click();
      await expect.poll(async () => (await created.ref.get()).data().operationalStatus).toBe("ASSIGNED");
      const assignments = await created.ref.collection("assignments").get();
      expect(assignments.docs.filter((item) => item.data().isActive)).toHaveLength(1);
      expect(assignments.docs[0].data()).toMatchObject({ cleanerId: fixture.cleanerAId, source: "MANAGER_DIRECT" });
      expect((await created.ref.collection("offers").get()).empty).toBe(true);
      await expect(panel).not.toBeVisible();
    });

    await step(85, "Prepare existing reminder without sending or losing selected context", async () => {
      await page.locator(".workspace-next-actions").getByRole("button", { name: "Prepare message", exact: true }).click();
      const preview = page.locator(".workspace-action-panel .job-reminder-preview");
      await expect(preview).toBeVisible();
      await expect(preview.locator("pre")).toContainText(fixture.propertyName);
      await expect(preview.locator("pre")).toContainText(fixture.cleanerAName);
      await expectWorkspaceContained(page, testInfo, "reminder-panel");
      await closeWorkspacePanel(page);
      await expect(page).toHaveURL(/\/workspace-preview/);
      await expect(page.locator(`.workspace-job-list .job-card[data-job-id="${created.id}"]`)).toHaveAttribute("aria-pressed", "true");
    });
    await step(100, "Confirm no checklist or payment side effects", async () => {
      expect((await created.ref.collection("checklistRuns").get()).empty).toBe(true);
      expect((await created.ref.get()).data()).toMatchObject({ clientPrice: 250, cleanerPayout: 150 });
    });
  } finally {
    await cleanupWorkspaceFixture(fixture);
  }
});
