import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import { makeJpegThumbnail } from "./checklistThumbnail.js";
import { checklistThumbnailPath, downloadSavedChecklistEvidence } from "./checklistEvidenceService.js";

function sampleJpeg(width = 1600, height = 1200) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    data[i] = (x * 255) / width; data[i + 1] = (y * 255) / height; data[i + 2] = ((x + y) * 7) & 255; data[i + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ width, height, data }, 85).data);
}

describe("checklist thumbnails", () => {
  it("makes a much smaller valid JPEG from a 12 MP photo", async () => {
    const source = sampleJpeg(4000, 3000);
    const thumb = await makeJpegThumbnail(source);
    expect(Buffer.isBuffer(thumb)).toBe(true);
    const decoded = jpeg.decode(thumb);
    expect(decoded.width).toBe(360);
    expect(decoded.height).toBe(270);
    expect(thumb.length).toBeLessThan(source.length / 5);
  });

  it("keeps working when a phone stores extra data after the JPEG", async () => {
    const source = Buffer.concat([sampleJpeg(1600, 1200), Buffer.from("extra data stored after the image")]);
    const thumb = await makeJpegThumbnail(source);
    expect(jpeg.decode(thumb).width).toBe(360);
  });

  it("returns null for a PNG, a truncated JPEG, a malformed JPEG and null", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC", "base64");
    const truncated = sampleJpeg(800, 600).subarray(0, -2);
    const malformed = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await expect(makeJpegThumbnail(png)).resolves.toBeNull();
    await expect(makeJpegThumbnail(truncated)).resolves.toBeNull();
    await expect(makeJpegThumbnail(malformed)).resolves.toBeNull();
    await expect(makeJpegThumbnail(null)).resolves.toBeNull();
  });

  it("builds the thumbnail once, caches it and then serves the cached copy", async () => {
    const files = new Map([["orgs/photo.jpg", sampleJpeg(800, 600)]]);
    const downloads = [];
    const storage = { bucket: () => ({ file: (path) => ({
      download: async () => {
        downloads.push(path);
        if (!files.has(path)) throw Object.assign(new Error("missing"), { code: 404 });
        return [files.get(path)];
      },
      save: async (bytes) => { files.set(path, bytes); },
    }) }) };
    const run = { evidencePolicy: { version: 2 } };
    const evidence = { evidenceId: "e-1", status: "SAVED", contentType: "image/jpeg", sizeBytes: 1000, storagePath: "orgs/photo.jpg", generation: "7" };
    const first = await downloadSavedChecklistEvidence(run, evidence, { storage, variant: "thumbnail" });
    expect(first.variant).toBe("thumbnail");
    expect(files.has(checklistThumbnailPath(evidence))).toBe(true);
    const second = await downloadSavedChecklistEvidence(run, evidence, { storage, variant: "thumbnail" });
    expect(second.bytes).toEqual(first.bytes);
    expect(downloads.filter((path) => path === "orgs/photo.jpg")).toHaveLength(1);
    const full = await downloadSavedChecklistEvidence(run, evidence, { storage });
    expect(full.bytes.length).toBeGreaterThan(first.bytes.length);
    expect(checklistThumbnailPath(evidence)).not.toContain("orgs");
  });
});
