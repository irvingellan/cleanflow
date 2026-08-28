import { expect, test } from "@playwright/test";
import { e2eManager } from "./globalSetup.js";

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
