import { describe, expect, it } from "vitest";
import { maximumChecklistEvidenceSizeBytes } from "./checklistEvidenceDefinition.js";
import { normalizeImageUpload } from "./checklistEvidenceService.js";

const imageFixtures = [
  ["image/jpeg", "jpg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
  ["image/png", "png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ["image/webp", "webp", Buffer.from("RIFF0000WEBP", "ascii")],
];

describe("checklist photo upload validation", () => {
  it.each(imageFixtures)("accepts a valid %s image signature", (contentType, extension, bytes) => {
    expect(normalizeImageUpload({ contentType, bytes })).toMatchObject({
      contentType,
      extension,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("rejects an oversized image before storage access", () => {
    const bytes = Buffer.alloc(maximumChecklistEvidenceSizeBytes + 1);
    Buffer.from([0xff, 0xd8, 0xff]).copy(bytes);
    let thrown;
    try {
      normalizeImageUpload({ contentType: "image/jpeg", bytes });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "invalid-argument" });
    expect(thrown.message).toContain("too large");
  });

  it.each([
    ["HEIC MIME", "image/heic", Buffer.from("ftypheic")],
    ["HEIF MIME", "image/heif", Buffer.from("ftypheif")],
    ["missing content type", undefined, imageFixtures[0][2]],
    ["incorrect content type", "image/png", imageFixtures[0][2]],
  ])("rejects %s explicitly", (_label, contentType, bytes) => {
    let thrown;
    try {
      normalizeImageUpload({ contentType, bytes });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "invalid-argument" });
  });
});
