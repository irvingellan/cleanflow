import { expect, test, step, loginManager } from "./support.js";
import {
  restrictWorkspaceBrowser, seedWorkspaceFixture, readyWorkspaceFixture, cleanupWorkspaceFixture,
  openWorkspace, selectWorkspaceJob, returnWorkspaceList, expectWorkspaceContained,
} from "./workspace-support.js";

test("workspace reviews saved answers and synthetic evidence through the established approval path", async ({ page }, testInfo) => {
  page.setDefaultTimeout(20_000);
  await restrictWorkspaceBrowser(page);
  const fixture = await seedWorkspaceFixture(testInfo, "workspace-ready-review", "READY_FOR_REVIEW");
  const { jobRef, jobId } = fixture.jobs[0];
  try {
    await step(0, "Prepare only local synthetic saved-review fixture", () => readyWorkspaceFixture(page, fixture));
    await loginManager(page);
    const list = await openWorkspace(page, fixture);
    await selectWorkspaceJob(page, jobId);
    await step(30, "Open the existing manager Checklist Run inside the workspace", async () => {
      await page.locator(".workspace-next-actions").getByRole("button", { name: "Review checklist", exact: true }).click();
      const run = page.locator(".workspace-detail .checklist-run");
      await expect(run).toBeVisible();
      await expect(run).toContainText("The cleaner sent this saved checklist for manager review.");
      await expect(run).toContainText("Synthetic saved progress.");
      await expect(run.locator(".checklist-run__answers").first()).toContainText("Done");
      await expect(run.locator(".checklist-run__evidence-photo")).toBeVisible();
      await expect.poll(() => run.locator(".checklist-run__evidence-photo").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      await expectWorkspaceContained(page, testInfo, "ready-review");
      await run.getByRole("button", { name: "Refresh saved progress", exact: true }).click();
      await expect(run).toContainText("Synthetic saved progress.");
    });

    await step(65, "Approve using the existing server-owned completion transaction", async () => {
      const run = page.locator(".workspace-detail .checklist-run");
      await run.getByRole("button", { name: "Approve and complete service", exact: true }).click();
      const confirmation = run.locator(".completion-confirmation");
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole("button", { name: "Approve and complete service", exact: true }).click();
      await expect.poll(async () => (await jobRef.get()).data().operationalStatus).toBe("COMPLETED");
      expect((await fixture.runRef.get()).data().status).toBe("READY_FOR_REVIEW");
      expect((await jobRef.get()).data()).toMatchObject({ clientPrice: 250, cleanerPayout: 150 });
    });

    await step(100, "Completed context has no illegal execution actions; Services search remains", async () => {
      await page.getByRole("button", { name: "Job summary", exact: true }).click();
      const next = page.locator(".workspace-next-actions");
      const more = next.locator(".workspace-more summary");
      if (await more.isVisible()) await more.click();
      await expect(next.getByRole("button", { name: "Assign cleaner", exact: true })).toHaveCount(0);
      await expect(next.getByRole("button", { name: "Edit schedule", exact: true })).toHaveCount(0);
      await expect(next.getByRole("button", { name: "Complete service", exact: true })).toHaveCount(0);
      await expect(next.getByRole("button", { name: "Prepare message", exact: true })).toHaveCount(0);
      await returnWorkspaceList(page);
      await expect(list.getByRole("searchbox")).toHaveValue(fixture.runLabel);
      await expect(page).toHaveURL(/\/workspace-preview/);
    });
  } finally {
    await cleanupWorkspaceFixture(fixture);
  }
});
