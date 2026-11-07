import jpeg from "jpeg-js";

// Small JPEG previews of saved checklist photos for grids. Photos are already
// optimized on the cleaner's device (≤1920 px JPEG, no metadata), so a pure-JS
// decoder is enough; anything else falls back to the full photo.

export const thumbnailMaxEdge = 360;
export const thumbnailQuality = 72;
const maximumSourceBytes = 8 * 1024 * 1024;

function isJpeg(bytes) {
  return bytes?.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Area-average downscale (box filter) of an RGBA image. */
export function downscaleRgba({ width, height, data }, maxEdge = thumbnailMaxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const out = Buffer.alloc(outWidth * outHeight * 4);
  const xRatio = width / outWidth;
  const yRatio = height / outHeight;
  for (let y = 0; y < outHeight; y += 1) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < outWidth; x += 1) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio));
      let r = 0; let g = 0; let b = 0; let count = 0;
      for (let sy = y0; sy < y1 && sy < height; sy += 1) {
        let index = (sy * width + x0) * 4;
        for (let sx = x0; sx < x1 && sx < width; sx += 1) {
          r += data[index]; g += data[index + 1]; b += data[index + 2]; count += 1; index += 4;
        }
      }
      const target = (y * outWidth + x) * 4;
      out[target] = r / count; out[target + 1] = g / count; out[target + 2] = b / count; out[target + 3] = 255;
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}

/** Returns JPEG thumbnail bytes, or null when the source is not a usable JPEG. */
export function makeJpegThumbnail(bytes) {
  if (!isJpeg(bytes) || bytes.length > maximumSourceBytes) return null;
  try {
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 20, maxMemoryUsageInMB: 160 });
    const small = downscaleRgba(decoded);
    const encoded = jpeg.encode(small, thumbnailQuality).data;
    return encoded.length < bytes.length ? Buffer.from(encoded) : null;
  } catch {
    return null;
  }
}
