import sharp from "sharp";

// Small JPEG previews of saved checklist photos for grids. libvips shrinks while decoding,
// so a 12 MP photo stays far below the 256 MiB Function limit.
sharp.cache(false);
sharp.concurrency(1);

export const thumbnailMaxEdge = 360;
export const thumbnailQuality = 72;
const maximumSourceBytes = 8 * 1024 * 1024;

function isJpeg(bytes) {
  return bytes?.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Returns JPEG thumbnail bytes, or null when the source is not a usable JPEG. */
export async function makeJpegThumbnail(bytes) {
  try {
    if (!isJpeg(bytes) || bytes.length > maximumSourceBytes) return null;
    // "truncated" rejects cut-off photos but keeps photos with extra data after the image.
    const encoded = await sharp(bytes, { failOn: "truncated", limitInputPixels: 20_000_000, sequentialRead: true })
      .rotate()
      .resize({ width: thumbnailMaxEdge, height: thumbnailMaxEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: thumbnailQuality })
      .toBuffer();
    return encoded.length < bytes.length ? encoded : null;
  } catch {
    return null;
  }
}
