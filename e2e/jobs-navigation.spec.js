import { expect, test } from "@playwright/test";
import { e2eManager, getE2eFirestore } from "./globalSetup.js";

async function signIn(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(e2eManager.email);
  await page.getByLabel("Password").fill(e2eManager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Operations dashboard" }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("Dashboard needs-assignment metric preserves its Jobs filter through detail navigation", async ({
  page,
}) => {
  await page
    .locator(".dashboard-summary")
    .getByRole("button", { name: /Needs assignment/ })
    .click();

  await expect(page.getByRole("heading", { name: "Cleaning jobs" })).toBeVisible();
  const needsAssignment = page.getByRole("button", {
    name: "⏰ Needs assignment",
  });
  await expect(needsAssignment).toHaveAttribute("aria-pressed", "true");

  await page
    .getByRole("button", { name: "View E2E Needs Assignment Property" })
    .click();
  await expect(
    page.getByRole("heading", { name: "E2E Needs Assignment Property" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Back/ }).click();
  await expect(page.getByRole("heading", { name: "Cleaning jobs" })).toBeVisible();
  await expect(needsAssignment).toHaveAttribute("aria-pressed", "true");
});

test("Dashboard Needs Attention returns to Dashboard through Job Detail", async ({ page }) => {
  const attentionItem = page
    .locator(".attention-list .attention-item")
    .filter({ hasText: "E2E Needs Assignment Property" });

  await expect(attentionItem).toBeVisible();
  await attentionItem.click();
  await expect(
    page.getByRole("heading", { name: "E2E Needs Assignment Property" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Back/ }).click();
  await expect(
    page.getByRole("heading", { name: "Operations dashboard" }),
  ).toBeVisible();
});

test("Jobs completed filter and search persist after opening a Job detail", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", {
    name: "Jobs",
  }).click();
  await expect(page.getByRole("heading", { name: "Cleaning jobs" })).toBeVisible();

  const completed = page.getByRole("button", { name: "✅ Completed" });
  await completed.click();
  await page.getByRole("searchbox", { name: "Search" }).fill("completed");
  await expect(completed).toHaveAttribute("aria-pressed", "true");

  await page
    .getByRole("button", { name: "View E2E Completed Property" })
    .click();
  await expect(
    page.getByRole("heading", { name: "E2E Completed Property" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Back/ }).click();
  await expect(completed).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("completed");
});

test("an assigned Job starts safely in the emulator", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", {
    name: "Jobs",
  }).click();
  await expect(page.getByRole("heading", { name: "Cleaning jobs" })).toBeVisible();

  await page
    .getByRole("button", { name: "View E2E Assigned Property" })
    .click();
  await expect(page.getByRole("button", { name: "Start cleaning" })).toBeVisible();

  await page.getByRole("button", { name: "Start cleaning" }).click();
  await expect(page.getByText("Cleaning in progress")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start cleaning" })).toHaveCount(0);
});

test("a v2 Job supports an additive manager roster before work starts", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", {
    name: "Jobs",
  }).click();
  await page.getByRole("button", { name: "View E2E Team Property" }).click();

  const offers = page.locator(".offer-status-item");
  await expect(
    offers.filter({ hasText: "E2E Team Cleaner C" }).getByRole("button", { name: "Assign" }),
  ).toHaveCount(0);
  await offers.filter({ hasText: "E2E Team Cleaner A" }).getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("1 cleaner assigned")).toBeVisible();
  await offers.filter({ hasText: "E2E Team Cleaner B" }).getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("2 cleaners assigned")).toBeVisible();

  const roster = page.locator(".assignment-roster");
  await roster
    .locator(".assignment-roster__item")
    .filter({ hasText: "E2E Team Cleaner A" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(page.getByText("1 cleaner assigned")).toBeVisible();
  await expect(roster.getByText("E2E Team Cleaner B")).toBeVisible();

  const db = getE2eFirestore();
  const jobSnapshot = await db
    .collection("organizations")
    .doc("cleanflow-demo")
    .collection("jobs")
    .doc("e2e-team-job")
    .get();
  const assignments = await jobSnapshot.ref.collection("assignments").get();
  const assignmentByCleanerId = Object.fromEntries(
    assignments.docs.map((snapshot) => [snapshot.data().cleanerId, snapshot.data()]),
  );

  expect(jobSnapshot.data().assignedCleanerIds).toEqual(["e2e-team-cleaner-b"]);
  expect(assignmentByCleanerId["e2e-team-cleaner-a"]).toMatchObject({
    isActive: false,
    sourceOfferId: "e2e-team-cleaner-a",
  });
  expect(assignmentByCleanerId["e2e-team-cleaner-b"]).toMatchObject({
    isActive: true,
    sourceOfferId: "e2e-team-cleaner-b",
  });
});

test("a v2 Job can offer, collect interest, and assign multiple cleaners before work starts", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", {
    name: "Jobs",
  }).click();
  await page.getByRole("button", { name: "View E2E V2 Offer Property" }).click();

  await page.getByRole("button", { name: "Offer cleaning to cleaners" }).click();
  await page.getByLabel("E2E Team Cleaner A").check();
  await page.getByLabel("E2E Team Cleaner B").check();
  await page.getByRole("button", { name: "Send offers" }).click();
  await expect(page.getByRole("heading", { name: "Offers sent" })).toBeVisible();
  await page.getByRole("button", { name: "Back to job", exact: true }).click();

  const offers = page.locator(".offer-status-item");
  for (const cleanerName of ["E2E Team Cleaner A", "E2E Team Cleaner B"]) {
    const offer = offers.filter({ hasText: cleanerName });
    await offer.getByRole("button", { name: "Simulate offer" }).click();
    await page.getByRole("button", { name: "I'm interested" }).click();
    await page.getByRole("button", { name: /Back/ }).click();
  }

  await offers
    .filter({ hasText: "E2E Team Cleaner A" })
    .getByRole("button", { name: "Assign" })
    .click();
  await expect(page.getByText("1 cleaner assigned")).toBeVisible();
  await offers
    .filter({ hasText: "E2E Team Cleaner B" })
    .getByRole("button", { name: "Assign" })
    .click();
  await expect(page.getByText("2 cleaners assigned")).toBeVisible();

  const db = getE2eFirestore();
  const jobSnapshot = await db
    .collection("organizations")
    .doc("cleanflow-demo")
    .collection("jobs")
    .doc("e2e-v2-offer-job")
    .get();
  const assignments = await jobSnapshot.ref.collection("assignments").get();
  const offerSnapshots = await jobSnapshot.ref.collection("offers").get();

  expect(jobSnapshot.data()).toMatchObject({
    operationalStatus: "ASSIGNED",
    assignedCleanerIds: ["e2e-team-cleaner-a", "e2e-team-cleaner-b"],
  });
  expect(assignments.docs.filter((snapshot) => snapshot.data().isActive).length).toBe(2);
  expect(offerSnapshots.docs.map((snapshot) => snapshot.data().status).sort()).toEqual([
    "INTERESTED",
    "INTERESTED",
  ]);
});

test("Client property navigation returns to the originating Client", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", {
    name: "Clients",
  }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

  await page.getByRole("button", { name: "View E2E Linked Client" }).click();
  await expect(page.getByRole("heading", { name: "E2E Linked Client" })).toBeVisible();

  await page.getByRole("button", { name: "Open property" }).click();
  await expect(page.getByRole("heading", { name: "E2E Client Property" })).toBeVisible();

  await page.getByRole("button", { name: /Back/ }).click();
  await expect(page.getByRole("heading", { name: "E2E Linked Client" })).toBeVisible();
});

test("a manager-created Job keeps optional guest context from a linked Property", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", {
    name: "Properties",
  }).click();

  await page.getByRole("button", { name: "View E2E Client Property" }).click();
  await expect(page.getByRole("heading", { name: "E2E Client Property" })).toBeVisible();

  await page.getByRole("button", { name: "Create cleaning" }).click();
  await page.getByRole("textbox", { name: "Date" }).fill("2026-09-15");
  await page.getByRole("textbox", { name: "Scheduled time" }).fill("10:00");
  await page.getByLabel("Guest name (optional)").fill("E2E Guest");
  await page.getByRole("button", { name: "Create cleaning" }).click();
  await expect(page.getByRole("heading", { name: "Service created" })).toBeVisible();

  await page.getByRole("button", { name: "View service" }).click();
  await expect(page.getByText("E2E Guest")).toBeVisible();
  await expect(page.getByText("10:00")).toBeVisible();
});
