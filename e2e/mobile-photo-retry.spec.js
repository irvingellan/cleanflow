import { createServer } from "node:http";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { normalizeImageUpload } from "../functions/src/checklistEvidenceService.js";

// Reuse the installed Firebase CLI parser rather than introducing a transport dependency.
const require = createRequire(import.meta.url);
const requireFromFirebaseCli = createRequire(require.resolve("firebase-tools/package.json"));
const bodyParser = requireFromFirebaseCli("body-parser");

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

for (const [source, inputIndex] of [["camera", 0], ["library", 1]]) {
  test(`mobile ${source} JPEG preserves the complete 2 MiB File through native fetch and raw-body parsing`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      // Capture before the production change handler resets the input value.
      document.addEventListener("change", (event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "file") {
          window.__syntheticSelectedFileSize = event.target.files?.[0]?.size;
        }
      }, true);
    });

    const encodedJpeg = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      canvas.getContext("2d").fillRect(0, 0, 1, 1);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    // A real generated JPEG with harmless trailing synthetic padding; no photo contents.
    const syntheticJpeg = Buffer.alloc(2 * 1024 * 1024, 0x5a);
    Buffer.from(encodedJpeg).copy(syntheticJpeg);
    let encodedRequestBytes = null;
    let parsedUpload = null;
    const parserOptions = {
      limit: "32mb",
      verify: (request, _response, bytes) => { request.rawBody = bytes; },
    };
    // Match the Firebase emulator's parser order; image/jpeg reaches the raw parser.
    const parsers = [
      bodyParser.json(parserOptions),
      bodyParser.text(parserOptions),
      bodyParser.urlencoded({ ...parserOptions, extended: true }),
      bodyParser.raw({ ...parserOptions, type: "*/*" }),
    ];
    const server = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-CleanFlow-Checklist-Item, X-CleanFlow-Checklist-Session, X-CleanFlow-Checklist-Request");
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }
      const validateUpload = (parseError) => {
        try {
          if (parseError) throw parseError;
          const image = normalizeImageUpload({ contentType: request.headers["content-type"], bytes: request.rawBody });
          parsedUpload = {
            isBuffer: Buffer.isBuffer(request.rawBody),
            byteLength: request.rawBody.length,
            contentLength: request.headers["content-length"] === undefined ? null : Number(request.headers["content-length"]),
            contentType: image.contentType,
            matchesSelectedBytes: request.rawBody.equals(syntheticJpeg),
          };
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ evidence: [{
            requirementId: "living-belongings",
            contentType: image.contentType,
            sizeBytes: request.rawBody.length,
          }] }));
        } catch {
          response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "synthetic_validation_failed" }));
        }
      };
      let parserIndex = 0;
      const nextParser = (error) => {
        if (error || parserIndex === parsers.length) return validateUpload(error);
        parsers[parserIndex++](request, response, nextParser);
      };
      nextParser();
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const uploadUrl = `http://127.0.0.1:${server.address().port}/upload`;

    try {
      await page.route("**/api/public-checklist**", async (route) => {
        if (route.request().method() === "PUT") {
          encodedRequestBytes = route.request().postDataBuffer();
          return route.continue({ url: uploadUrl });
        }
        if (route.request().method() === "POST") {
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(checklistResponse) });
      });
      await page.goto("/checklist?t=synthetic-mobile-upload-token");
      await expect(page.getByRole("heading", { name: "Cleaning checklist" })).toBeVisible();
      const photo = page.locator(".public-checklist__photo");
      await photo.locator('input[type="file"]').nth(inputIndex).setInputFiles({
        name: "synthetic.jpg",
        mimeType: "image/jpeg",
        buffer: syntheticJpeg,
      });

      await expect(photo.locator(".public-checklist__photo-status")).toHaveText("Photo saved");
      expect(await page.evaluate(() => window.__syntheticSelectedFileSize)).toBe(syntheticJpeg.length);
      expect(encodedRequestBytes.length).toBe(syntheticJpeg.length);
      expect(encodedRequestBytes.equals(syntheticJpeg)).toBe(true);
      expect(parsedUpload).toEqual({
        isBuffer: true,
        byteLength: syntheticJpeg.length,
        contentLength: syntheticJpeg.length,
        contentType: "image/jpeg",
        matchesSelectedBytes: true,
      });
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
