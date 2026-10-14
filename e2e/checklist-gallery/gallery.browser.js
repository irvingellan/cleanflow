import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["blob:", "data:"].includes(url.protocol)) return route.continue();
    if (url.hostname !== "127.0.0.1") throw new Error("Unexpected non-loopback request");
    if (url.pathname === "/api/synthetic-photo") return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC", "base64") });
    return route.continue();
  });
  await page.goto("/e2e/checklist-gallery/index.html");
  await expect(page.getByRole("heading", { name: "Cleaning checklist" })).toBeVisible();
});

test("native multiple selection appends camera later and respects mobile controls", async ({ page }) => {
  const jpeg = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600;
    const context = canvas.getContext("2d"); context.fillStyle = "#ddd"; context.fillRect(0, 0, 800, 600); context.fillStyle = "#333"; context.font = "40px sans-serif"; context.fillText("SYNTHETIC PHOTO", 50, 300);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .95));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const input = { name: "synthetic.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) };
  await page.getByLabel("Choose photos").setInputFiles([input, input]);
  await expect(page.getByText("Photo saved", { exact: true })).toHaveCount(2);
  await page.getByLabel("Take photo", { exact: true }).setInputFiles(input);
  await expect(page.getByText("Photo saved", { exact: true })).toHaveCount(3);
  expect(await page.evaluate(() => window.gallerySummary())).toMatchObject({ count: 3, uploads: 3, purposes: ["living-belongings", "additional", "additional"], types: ["image/jpeg", "image/jpeg", "image/jpeg"] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const sizes = await page.locator(".checklist-photo-gallery .button").evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().height));
  expect(sizes.every((size) => size >= 44)).toBe(true);
  await expect(page.locator(".checklist-photo-gallery img")).toHaveCount(0);
});

test("twenty saved photos load no images until explicit view; READY is read-only", async ({ page }) => {
  let images = 0; page.on("request", (request) => { if (request.url().includes("/api/synthetic-photo")) images++; });
  await page.evaluate(() => window.resetGallery({ count: 20 }));
  await expect(page.getByRole("button", { name: "View photo", exact: true })).toHaveCount(20);
  expect(images).toBe(0);
  await page.getByRole("button", { name: "View photo", exact: true }).nth(10).click();
  await expect(page.locator(".checklist-photo-gallery img")).toHaveCount(1);
  await expect.poll(() => images).toBe(1);
  await page.getByRole("button", { name: "View photo", exact: true }).nth(10).click();
  await expect.poll(() => images).toBe(2);
  await expect(page.locator(".checklist-photo-gallery img")).toHaveCount(1);
  await page.evaluate(() => window.resetGallery({ count: 20, ready: true }));
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Choose photos")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View photo", exact: true })).toHaveCount(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
