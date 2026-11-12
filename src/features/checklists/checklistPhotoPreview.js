const PREVIEW_EDGE = 320;

/**
 * A small local picture of a photo the phone just prepared, so the cleaner sees
 * each photo while it is sent. It lives only in this page; nothing is uploaded.
 * Returns an object URL, or null when the browser cannot make one.
 */
export async function createChecklistPhotoPreview(blob) {
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") return null;
  let source, canvas;
  try {
    source = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async"; image.src = source;
    await image.decode();
    const ratio = Math.min(1, PREVIEW_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const small = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
    return small ? URL.createObjectURL(small) : null;
  } catch { return null; }
  finally {
    if (source) URL.revokeObjectURL(source);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export function releaseChecklistPhotoPreview(url) {
  if (url && typeof URL?.revokeObjectURL === "function") URL.revokeObjectURL(url);
}
