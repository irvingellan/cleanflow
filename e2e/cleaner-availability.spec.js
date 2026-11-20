import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { managerOrganizationId } from "../src/services/firebase/config.js";
import { getE2eFirestore } from "./globalSetup.js";
import { loginManager } from "./scenarios/support.js";

test("a manager can offer a Job to a cleaner whose profile marks the time unavailable", async ({ page }) => {
  test.setTimeout(90_000);
  const org = getE2eFirestore().collection("organizations").doc(managerOrganizationId);
  const blockedId = "e2e-team-cleaner-a";
  const availableId = "e2e-team-cleaner-b";
  const blockedName = "E2E Team Cleaner A";
  const availableName = "E2E Team Cleaner B";
  const blockQuery = org.collection("cleanerUnavailability").where("cleanerId", "==", blockedId);
  const note = `Synthetic availability ${randomUUID()}`;
  const serviceDate = new Date(Date.now() + 28 * 86400_000).toISOString().slice(0, 10);

  await page.setViewportSize({ width: 375, height: 844 });
  await loginManager(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const panel = page.getByRole("region", { name: "Unavailable days" });
  async function openCleanerProfile() {
    await nav.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Cleaners" }).click();
    await page.getByRole("button", { name: `View ${blockedName}` }).click();
    await expect(panel).toBeVisible();
  }

  await openCleanerProfile();
  await panel.getByRole("button", { name: "Add a period" }).click();
  await panel.getByLabel("From", { exact: true }).fill(serviceDate);
  await panel.getByLabel("To", { exact: true }).fill(serviceDate);
  await panel.getByRole("checkbox", { name: "Part of the day" }).check();
  await panel.getByLabel("Start time").fill("09:00");
  await panel.getByLabel("End time").fill("12:00");
  await panel.getByRole("button", { name: "Save period" }).click();
  await expect(panel.getByRole("button", { name: /^Remove / })).toBeVisible();
  const saved = (await blockQuery.get()).docs.find(doc => doc.get("startDate") === serviceDate);
  expect(saved?.data()).toMatchObject({ cleanerId: blockedId, endDate: serviceDate, startTime: "09:00", endTime: "12:00", createdBy: "MANAGER" });

  await nav.getByRole("button", { name: "Jobs" }).click();
  await page.locator(".cf-services").getByRole("button", { name: "New service", exact: true }).click();
  const form = page.locator(".cleaning-form");
  await form.getByRole("searchbox").fill("E2E Client Property");
  await form.getByRole("combobox", { name: "Property" }).selectOption("e2e-client-property");
  await form.getByLabel("Date", { exact: true }).fill(serviceDate);
  await form.getByLabel("Scheduled time", { exact: true }).fill("10:30");
  await form.getByRole("textbox", { name: "Notes" }).fill(note);
  await form.getByRole("button", { name: "Create cleaning" }).click();
  await page.getByRole("button", { name: "Next step: Offer cleaning to cleaners", exact: true }).click();
  await page.locator(".offers-section").getByRole("button", { name: "Offer cleaning to cleaners", exact: true }).click();

  const picker = page.locator(".offer-form");
  const options = picker.locator(".cleaner-list").getByRole("checkbox");
  const blocked = picker.getByRole("checkbox", { name: blockedName, exact: true });
  const available = picker.getByRole("checkbox", { name: availableName, exact: true });
  const showUnavailable = picker.getByRole("button", { name: /show 1 unavailable cleaner/i });
  await expect(showUnavailable).toBeVisible();
  await expect(blocked).toHaveCount(0);
  await expect(available).toBeVisible();
  await showUnavailable.click();
  await expect(blocked).toHaveAccessibleDescription(/Unavailable this day.*9:00.*12:00/i);
  await expect(blocked).toBeEnabled();
  await expect(blocked).not.toBeChecked();
  await expect(available).toBeVisible();
  const order = await options.evaluateAll(inputs => inputs.map(input => input.getAttribute("aria-label")));
  expect(order.indexOf(availableName)).toBeLessThan(order.indexOf(blockedName));
  await available.check();
  await blocked.check();
  await expect(picker.getByRole("status").filter({ hasText: blockedName })).toContainText(/unavailable period/i);
  await picker.getByRole("button", { name: "Create offers" }).click();
  await expect(page.locator(".offers-section__success")).toContainText("Offers created (2)");

  const created = await org.collection("jobs").where("notes", "==", note).get();
  expect(created.size).toBe(1);
  const job = created.docs[0];
  expect(job.data()).toMatchObject({ operationalStatus: "OFFERED", assignedCleanerIds: [] });
  for (const cleanerId of [blockedId, availableId]) {
    const offer = await job.ref.collection("offers").doc(cleanerId).get();
    expect(offer.data()).toMatchObject({ cleanerId, status: "PENDING" });
  }

  await openCleanerProfile();
  await panel.getByRole("button", { name: /^Remove / }).click();
  await expect(panel.getByText("No periods added.")).toBeVisible();
  expect((await saved.ref.get()).exists).toBe(false);
});
