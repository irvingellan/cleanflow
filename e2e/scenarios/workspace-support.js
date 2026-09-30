import { createHash, randomBytes } from "node:crypto";
import { getApps } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { buildChecklistRunSnapshot } from "../../functions/src/checklistRunDefinition.js";
import {
  expect, seedScenarioFixture, cleanupScenarioFixture, syntheticPng,
} from "./support.js";

// These helpers extend only the experimental scenarios. The original runner
// fixtures and production data paths are deliberately unchanged.
export async function restrictWorkspaceBrowser(page) {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol)
      && !["127.0.0.1", "localhost"].includes(url.hostname)) return route.abort();
    return route.continue();
  });
}

export async function seedWorkspaceFixture(testInfo, scenarioName, runState = null) {
  const fixture = await seedScenarioFixture(testInfo, scenarioName);
  const now = Timestamp.now();
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const scheduledDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const jobs = Array.from({ length: 16 }, (_, index) => {
    const jobId = `${fixture.runLabel}-job-${String(index).padStart(2, "0")}`;
    const job = {
      organizationId: "cleanflow-demo",
      schemaVersion: 2,
      propertyId: fixture.propertyId,
      propertyName: `${fixture.propertyName} — Service ${String(index + 1).padStart(2, "0")}`,
      clientId: fixture.clientId,
      clientName: fixture.clientName,
      scheduledDate,
      scheduledStart: `${String(8 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10).padStart(2, "0")}`,
      operationalStatus: index === 0 && runState ? "ASSIGNED" : "UNASSIGNED",
      assignedCleanerIds: index === 0 && runState ? [fixture.cleanerAId] : [],
      checklistContextRevision: index === 0 && runState ? 1 : 0,
      clientPrice: 250,
      cleanerPayout: 150,
      dataProvenance: "DEMO",
      notes: fixture.runLabel,
      createdAt: now,
      updatedAt: now,
    };
    return { jobId, jobRef: fixture.orgRef.collection("jobs").doc(jobId), job };
  });
  const batch = fixture.db.batch();
  for (const { jobRef, job } of jobs) batch.set(jobRef, job);
  if (runState) {
    const { jobId, jobRef, job } = jobs[0];
    batch.set(jobRef.collection("assignments").doc("workspace-assignment"), {
      organizationId: "cleanflow-demo", jobId, cleanerId: fixture.cleanerAId,
      cleanerName: fixture.cleanerAName, isActive: true, source: "MANAGER_DIRECT",
      executionStatus: "ASSIGNED", assignedAt: now, createdAt: now, updatedAt: now,
    });
    const property = { id: fixture.propertyId, ...(await fixture.orgRef.collection("properties").doc(fixture.propertyId).get()).data() };
    const snapshot = buildChecklistRunSnapshot({ job: { id: jobId, ...job }, property });
    const runRef = jobRef.collection("checklistRuns").doc("initial");
    const run = { organizationId: "cleanflow-demo", jobId, status: "DRAFT", createdAt: now, ...snapshot };
    batch.set(runRef, run);
    const items = snapshot.resolvedDefinition.sections.flatMap((section) => section.items);
    const inventory = snapshot.resolvedDefinition.inventoryItems;
    batch.set(runRef.collection("drafts").doc("current"), {
      revision: 1,
      checklistAnswers: Object.fromEntries(items.map((item, index) => [item.id,
        runState === "READY_FOR_REVIEW" || index === 0 ? "DONE" : "UNANSWERED"])),
      inventoryAnswers: Object.fromEntries(inventory.map((item, index) => [item.id,
        index === 0 ? "NEEDS_RESTOCK" : runState === "READY_FOR_REVIEW" ? "HIGH" : "UNANSWERED"])),
      issueNotes: "Synthetic fixture: one supply needs restock.",
      generalNotes: "Synthetic saved progress.",
      updatedAt: now,
    });
    const token = randomBytes(32).toString("base64url");
    batch.set(runRef.collection("checklistCapabilities").doc("active"), {
      organizationId: "cleanflow-demo", jobId, runId: "initial", cleanerId: fixture.cleanerAId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      contextRevision: runState === "DRAFT" ? 0 : 1,
      rotation: 1, status: "ACTIVE", issuedAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000),
    });
    Object.assign(fixture, { runRef, run, token });
  }
  await batch.commit();
  return { ...fixture, jobs, scheduledDate };
}

export async function readyWorkspaceFixture(page, fixture) {
  // Exercise the real photo endpoint with synthetic bytes only. The local
  // project's fail-closed fixture guard already ran before creating any state.
  const response = await page.request.put(`/api/public-checklist?${new URLSearchParams({ token: fixture.token })}`, {
    headers: { "Content-Type": "image/png", "X-CleanFlow-Checklist-Item": "living-belongings" }, data: syntheticPng,
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).evidence).toHaveLength(1);
  await fixture.runRef.update({
    status: "READY_FOR_REVIEW", readyForReviewAt: Timestamp.now(),
    readyForReviewCleanerId: fixture.cleanerAId, readyForReviewContextRevision: 1,
    readyForReviewCapabilityRotation: 1, readyForReviewDraftRevision: 1,
  });
}

export async function openWorkspace(page, fixture) {
  await page.goto("/workspace-preview");
  await expect(page.getByRole("heading", { name: "Operations workspace", exact: true })).toBeVisible();
  const list = page.locator(".workspace-job-list");
  await list.getByRole("searchbox").fill(fixture.runLabel);
  await expect(list.locator(".job-card")).toHaveCount(fixture.jobs.length);
  return list;
}

export async function selectWorkspaceJob(page, jobId) {
  await page.locator(`.workspace-job-list .job-card[data-job-id="${jobId}"]`).click();
  await expect(page.locator(`.workspace-job-list .job-card[data-job-id="${jobId}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.workspace-detail [aria-labelledby="job-detail-title"]')).toBeVisible();
}

export async function closeWorkspacePanel(page) {
  const panel = page.locator(".workspace-action-panel");
  await panel.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(panel).not.toBeVisible();
}

export async function returnWorkspaceList(page) {
  if (page.viewportSize().width < 1000) {
    await page.getByRole("button", { name: "Back to services", exact: true }).click();
  }
  await expect(page.locator(".workspace-job-list")).toBeVisible();
}

export async function expectWorkspaceContained(page, testInfo, label = "workspace") {
  const sizes = [[2560, 1080], [1920, 1080], [1440, 900], [768, 1024], [390, 844]];
  const previous = page.viewportSize();
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator(".workspace-detail")).toBeVisible();
    if (width >= 1000) {
      const card = page.locator(".workspace-job-list .job-card").first();
      const summary = await card.locator(".job-card__summary").boundingBox();
      expect(summary.width).toBeGreaterThanOrEqual(220);
      expect((await card.boundingBox()).height).toBeLessThan(400);
    }
    if (width === 390) {
      const actions = await page.locator(".workspace-next-actions").boundingBox();
      expect(actions.y + actions.height).toBeGreaterThanOrEqual(height - 1);
      expect(actions.y).toBeGreaterThan(height / 2);
      const panelOpen = await page.locator(".workspace-action-panel").isVisible();
      if (panelOpen) {
        for (const button of await page.locator(".workspace-action-panel > header > .button, .workspace-action-panel .job-reminder-preview__header > .button").all()) {
          await expect(button).toHaveCSS("white-space", "nowrap");
        }
      }
      const canScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight > 450);
      if (!panelOpen && canScroll) {
        await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
        const scrollToTop = page.locator(".operations-workspace .scroll-to-top-button");
        await expect(scrollToTop).toBeVisible();
        await expect.poll(async () => {
          const button = await scrollToTop.boundingBox();
          const footer = await page.locator(".workspace-next-actions").boundingBox();
          return button.y + button.height - footer.y;
        }).toBeLessThanOrEqual(-6);
        await scrollToTop.click();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
      }
    }
    if (testInfo && [2560, 390].includes(width)) {
      await page.screenshot({ path: testInfo.outputPath(`${label}-${width}.png`) });
    }
  }
  await page.setViewportSize(previous);
}

export async function cleanupWorkspaceFixture(fixture) {
  if (fixture?.runRef) {
    const evidence = await fixture.runRef.collection("evidence").doc("living-belongings").get();
    if (evidence.exists && typeof evidence.data().storagePath === "string") {
      // The emulator's default demo bucket is local. This cleanup is restricted
      // to the exact synthetic object recorded beneath this fixture's Run.
      const path = evidence.data().storagePath;
      if (!path.startsWith(`organizations/cleanflow-demo/jobs/${fixture.jobs[0].jobId}/`)) {
        throw new Error("Unexpected synthetic evidence path; cleanup refused.");
      }
      const app = getApps().find((candidate) => candidate.name === "cleanflow-e2e-test");
      await getStorage(app).bucket("demo-cleanflow.appspot.com").file(path).delete({ ignoreNotFound: true });
    }
  }
  await cleanupScenarioFixture(fixture);
}
