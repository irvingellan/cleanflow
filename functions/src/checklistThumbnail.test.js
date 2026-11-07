import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import { downscaleRgba, makeJpegThumbnail, thumbnailMaxEdge } from "./checklistThumbnail.js";
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
  it("makes a much smaller JPEG with the same orientation", () => {
    const source = sampleJpeg();
    const thumb = makeJpegThumbnail(source);
    const decoded = jpeg.decode(thumb);
    expect(decoded.width).toBe(thumbnailMaxEdge);
    expect(decoded.height).toBe(270);
    expect(thumb.length).toBeLessThan(source.length / 5);
  });

  it("returns null for anything that is not a usable JPEG", () => {
    expect(makeJpegThumbnail(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).toBeNull();
    expect(makeJpegThumbnail(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00]))).toBeNull();
    expect(makeJpegThumbnail(null)).toBeNull();
  });

  it("averages pixels when shrinking", () => {
    const image = { width: 2, height: 2, data: Buffer.from([0, 0, 0, 255, 200, 200, 200, 255, 0, 0, 0, 255, 200, 200, 200, 255]) };
    const small = downscaleRgba(image, 1);
    expect([...small.data]).toEqual([100, 100, 100, 255]);
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
