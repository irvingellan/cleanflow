import { expect, test, step, loginManager } from "./support.js";
import {
  restrictWorkspaceBrowser, seedWorkspaceFixture, cleanupWorkspaceFixture, openWorkspace, selectWorkspaceJob,
  closeWorkspacePanel, returnWorkspaceList, expectWorkspaceContained,
} from "./workspace-support.js";

test("workspace recovers a stale DRAFT link without changing saved work or accepting a previous Job response", async ({ page }, testInfo) => {
  page.setDefaultTimeout(20_000);
  await restrictWorkspaceBrowser(page);
  const fixture = await seedWorkspaceFixture(testInfo, "workspace-draft-recovery", "DRAFT");
  try {
    await step(0, "Open the synthetic Draft Job", () => loginManager(page));
    const list = await openWorkspace(page, fixture);
    await selectWorkspaceJob(page, fixture.jobs[0].jobId);
    const savedDraft = (await fixture.runRef.collection("drafts").doc("current").get()).data();

    await step(25, "Explain Draft and reuse existing stale-link recovery controls", async () => {
      await expect(page.locator(".workspace-next-actions")).toContainText("Confirm the current assignment, create a new cleaner link, and resend it.");
      await page.locator(".workspace-next-actions").getByRole("button", { name: "Cleaner link", exact: true }).click();
      const controls = page.locator(".workspace-action-panel .job-checklist__capability");
      await expect(page.locator(".workspace-action-panel .job-checklist")).toContainText("Checklist in progress — waiting for the cleaner to send it for review.");
      await expect(controls).toContainText("Cleaner link is no longer valid for this Job context.");
      await controls.getByRole("button", { name: "Create cleaner link", exact: true }).click();
      await expect(controls).toContainText("Active cleaner link");
      await expect(controls.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
      expect((await fixture.runRef.collection("checklistCapabilities").doc("active").get()).data()).toMatchObject({
        contextRevision: 1, rotation: 2, status: "ACTIVE", cleanerId: fixture.cleanerAId,
      });
      expect((await fixture.runRef.collection("drafts").doc("current").get()).data()).toEqual(savedDraft);
      expect((await fixture.runRef.get()).data().status).toBe("DRAFT");
      await expectWorkspaceContained(page, testInfo, "draft-recovery-panel");
      await closeWorkspacePanel(page);
    });

    await step(55, "Keep saved Draft review in the same workspace", async () => {
      await page.locator(".workspace-next-actions").getByRole("button", { name: "View checklist progress", exact: true }).click();
      await expect(page.locator(".workspace-detail .checklist-run")).toBeVisible();
      await expect(page.locator(".workspace-detail .checklist-run")).toContainText("Synthetic saved progress.");
      await page.getByRole("button", { name: "Job summary", exact: true }).click();
      await returnWorkspaceList(page);
      await expect(list.getByRole("searchbox")).toHaveValue(fixture.runLabel);
    });

    await step(80, "Ignore a delayed old Checklist read after Job selection changes", async () => {
      await selectWorkspaceJob(page, fixture.jobs[1].jobId);
      await returnWorkspaceList(page);
      let releaseRead;
      let resolveStarted;
      let resolveFinished;
      const delayed = new Promise((resolve) => { releaseRead = resolve; });
      const started = new Promise((resolve) => { resolveStarted = resolve; });
      const finished = new Promise((resolve) => { resolveFinished = resolve; });
      await page.route("**/getChecklistRun", async (route) => {
        const request = route.request().postDataJSON();
        if (request?.data?.jobId !== fixture.jobs[0].jobId) return route.continue();
        const response = await route.fetch();
        resolveStarted();
        await delayed;
        await route.fulfill({ response });
        resolveFinished();
      });
      await selectWorkspaceJob(page, fixture.jobs[0].jobId);
      await started;
      await returnWorkspaceList(page);
      await selectWorkspaceJob(page, fixture.jobs[1].jobId);
      releaseRead();
      await finished;
      await page.unroute("**/getChecklistRun");
      await expect(page.locator(".workspace-detail").getByRole("heading", { name: fixture.jobs[1].job.propertyName, exact: true })).toBeVisible();
      await expect(page.locator(".workspace-next-actions").getByRole("button", { name: "Cleaner link", exact: true })).toHaveCount(0);
      await expect(page.locator(".workspace-next-actions").getByRole("button", { name: "View checklist progress", exact: true })).toHaveCount(0);
      await expect(page).toHaveURL(/\/workspace-preview/);
    });
    await step(100, "Confirm original Draft answers remain unchanged", async () => {
      expect((await fixture.runRef.collection("drafts").doc("current").get()).data()).toEqual(savedDraft);
    });
  } finally {
    await cleanupWorkspaceFixture(fixture);
  }
});
