import { expect, test } from "@playwright/test";

const checklistResponse = {
  checklist: {
    status: "DRAFT",
    propertyName: "Synthetic Mobile Property",
    scheduledDate: "2026-09-25",
    sections: [{
      id: "bedroom",
      title: "Bedroom",
      items: [{ id: "living-belongings", label: "Check under beds and furniture", requiresPhoto: true }],
    }],
    inventoryItems: [],
    requiredPhotoTypes: [],
    evidence: [],
  },
  draft: {
    revision: 0,
    checklistAnswers: { "living-belongings": "UNANSWERED" },
    inventoryAnswers: {},
    issueNotes: "",
    generalNotes: "",
  },
};

test("photo retry stays a comfortable touch target after an unsupported image error", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const methods = [];
  await page.route("**/api/public-checklist**", async (route) => {
    methods.push(route.request().method());
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(checklistResponse) });
  });

  await page.goto("/checklist?t=synthetic-mobile-review-token");
  await expect(page.getByRole("heading", { name: "Cleaning checklist" })).toBeVisible();
  const photo = page.locator(".public-checklist__photo");
  await photo.locator('input[type="file"]').nth(1).setInputFiles({
    name: "unsupported.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("synthetic image bytes"),
  });

  await expect(photo.getByRole("alert")).toContainText("HEIC/HEIF photos are not supported yet.");
  const retry = photo.getByRole("button", { name: "Retry photo" });
  await expect(retry).toBeVisible();
  const retryHeight = await retry.evaluate((button) => button.getBoundingClientRect().height);
  expect(retryHeight).toBeGreaterThanOrEqual(44);
  expect(methods).not.toContain("PUT");

  const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});
