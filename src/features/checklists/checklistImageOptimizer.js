// Current phones save 24, 48 and 50 MP photos. The source is decoded once and
// drawn into the 1920 px canvas, so these limits bound the phone's own file,
// not what is uploaded.
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const MAX_PIXELS = 64_000_000;
const MAX_EDGE = 1920;
const BUDGET_MS = 20_000;
const JPEG_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc4, 0xdb, 0xdd, 0xda]);
const MESSAGES = {
  invalid_type: "Choose a JPEG, PNG or WebP photo. HEIC is not supported; export it as JPEG first.",
  source_too_large: "Choose a photo of at most 40 MiB.",
  pixels_exceeded: "Choose a photo with at most 64 million pixels.",
  invalid_image: "This photo is incomplete or its format does not match. Export it again.",
  decode_failed: "This browser could not open the photo. Export it as JPEG and try again.",
  encode_failed: "This browser could not optimize the photo. Try another photo.",
  optimization_timeout: "Photo optimization took too long. Try a smaller photo.",
  optimization_cancelled: "Photo optimization was cancelled.",
  optimization_too_large: "This photo cannot be optimized without increasing its size. Export it as JPEG and try again.",
};
function failure(reason) {
  return Object.assign(new Error(MESSAGES[reason]), { name: "ChecklistImageOptimizationError", code: `checklist_photo_${reason}` });
}
function invalid() { throw failure("invalid_image"); }
function dimensions(width, height) {
  if (!width || !height) invalid();
  if (width * height > MAX_PIXELS) throw failure("pixels_exceeded");
  return { width, height };
}
function ascii(bytes, start, length) { return String.fromCharCode(...bytes.subarray(start, start + length)); }
function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

// Native decode still validates the pixel stream. These checks run BEFORE decoding,
// and also validate source fallback/encoder structure without trusting MIME alone.
function jpegContainer(bytes, strip = false) {
  if (bytes[0] !== 255 || bytes[1] !== 216) invalid();
  const data = view(bytes);
  // Source admission does not retain a list of every source segment.
  const parts = strip ? [bytes.subarray(0, 2)] : [];
  let offset = 2, frame, scan = false, quantization = false, huffman = false, safe = true, hasJfif = false;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 255) invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!frame || !scan) invalid();
      // Phones append depth maps, HDR gain maps or motion data after the image.
      // The source is re-encoded, so that trailer is ignored and never uploaded.
      if (offset !== bytes.length) { if (strip) invalid(); safe = false; }
      if (strip) parts.push(bytes.subarray(start, offset));
      return { ...frame, safe: safe && hasJfif, parts };
    }
    if (offset + 2 > bytes.length) invalid();
    const length = data.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) invalid();
    const app = marker >= 0xe0 && marker <= 0xef || marker === 0xfe;
    if (!app && !JPEG_MARKERS.has(marker)) invalid();
    const jfif = marker === 0xe0 && length === 16 && ascii(bytes, offset + 2, 5) === "JFIF\0"
      && bytes[offset + 7] === 1 && bytes[offset + 8] <= 2 && bytes[offset + 9] <= 2
      && bytes[offset + 14] === 0 && bytes[offset + 15] === 0;
    if (app && !jfif) safe = false;
    if (jfif) hasJfif = true;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (frame || length < 11 || bytes[offset + 2] !== 8 || length !== 8 + bytes[offset + 7] * 3) invalid();
      frame = dimensions(data.getUint16(offset + 5), data.getUint16(offset + 3));
      if (![1, 3].includes(bytes[offset + 7])) safe = false;
    }
    if (marker === 0xdd && length !== 4) invalid();
    if (marker === 0xdb || marker === 0xc4) {
      let cursor = offset + 2;
      while (cursor < offset + length) {
        const info = bytes[cursor++];
        if ((info & 15) > 3 || info >>> 4 > 1) invalid();
        if (marker === 0xdb) { cursor += 64 * ((info >>> 4) + 1); quantization = true; }
        else {
          if (cursor + 16 > offset + length) invalid();
          let count = 0;
          for (let i = 0; i < 16; i++) count += bytes[cursor++];
          if (!count || count > 256) invalid();
          cursor += count; huffman = true;
        }
      }
      if (cursor !== offset + length) invalid();
    }
    const segmentEnd = offset + length;
    if (strip && (!app || jfif)) parts.push(bytes.subarray(start, segmentEnd));
    offset = segmentEnd;
    if (marker === 0xda) {
      if (!frame || !quantization || !huffman || length < 8 || length !== 6 + 2 * bytes[segmentEnd - length + 2]) invalid();
      const scanStart = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || next >= 0xd0 && next <= 0xd7) { offset += 2; continue; }
        break;
      }
      if (scanStart === offset) invalid();
      scan = true; if (strip) parts.push(bytes.subarray(scanStart, offset));
    }
  }
  invalid();
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngContainer(bytes) {
  if (![137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) invalid();
  const data = view(bytes);
  let offset = 8, frame, pixelData = false, safe = true, endedData = false;
  while (offset + 12 <= bytes.length) {
    const length = data.getUint32(offset);
    if (length > bytes.length - offset - 12) invalid();
    const type = ascii(bytes, offset + 4, 4);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== data.getUint32(offset + 8 + length)) invalid();
    if (!frame && type !== "IHDR") invalid();
    if (type === "IHDR") {
      if (frame || length !== 13) invalid();
      frame = dimensions(data.getUint32(offset + 8), data.getUint32(offset + 12));
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      if (!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]})[color]?.includes(depth)
        || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) invalid();
      // The conservative fallback excludes palette/profile/EXIF/ancillary chunks.
      if (color === 3) safe = false;
    } else if (type === "IDAT") {
      if (endedData) invalid();
      if (length) pixelData = true;
    } else if (type === "IEND") {
      if (length || !pixelData || offset + 12 !== bytes.length) invalid();
      return { ...frame, safe };
    } else {
      if (type === "acTL" || type === "fcTL" || type === "fdAT") throw failure("invalid_type");
      if (!(bytes[offset + 4] & 32) && type !== "PLTE") invalid();
      safe = false;
      if (pixelData) endedData = true;
    }
    offset += length + 12;
  }
  invalid();
}
function webpContainer(bytes) {
  const data = view(bytes);
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP" || data.getUint32(4, true) + 8 !== bytes.length) invalid();
  let offset = 12, frame, extended, safe = true;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4), length = data.getUint32(offset + 4, true), payload = offset + 8;
    if (length > bytes.length - payload) invalid();
    if (type === "ANIM" || type === "ANMF") throw failure("invalid_type");
    if (!["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP", "EXIF", "XMP "].includes(type)) invalid();
    if (["ICCP", "EXIF", "XMP "].includes(type)) safe = false;
    if (type === "VP8X") {
      if (extended || length !== 10) invalid();
      if (bytes[payload] & 2) throw failure("invalid_type");
      if (bytes[payload] & ~0x10 || bytes[payload + 1] || bytes[payload + 2] || bytes[payload + 3]) safe = false;
      const uint24 = at => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
      extended = dimensions(uint24(payload + 4) + 1, uint24(payload + 7) + 1);
    }
    if (type === "VP8 " || type === "VP8L") {
      if (frame) invalid();
      if (type === "VP8 ") {
        if (length < 10 || ascii(bytes, payload + 3, 3) !== "\x9d\x01\x2a") invalid();
        frame = dimensions(data.getUint16(payload + 6, true) & 0x3fff, data.getUint16(payload + 8, true) & 0x3fff);
      } else {
        if (length < 5 || bytes[payload] !== 0x2f) invalid();
        const packed = data.getUint32(payload + 1, true);
        frame = dimensions((packed & 0x3fff) + 1, (packed >>> 14 & 0x3fff) + 1);
      }
    }
    offset += 8 + length + (length % 2);
  }
  if (!frame || offset !== bytes.length || extended && (extended.width !== frame.width || extended.height !== frame.height)) invalid();
  return { ...frame, safe };
}
function inspect(bytes, type) {
  if (type === "image/jpeg") return jpegContainer(bytes);
  if (type === "image/png") return pngContainer(bytes);
  return webpContainer(bytes);
}

/** Exactly one local photo; no upload, filename, capability or provider access.
 * Native decoders may allocate the full admitted (<=16 MP) source bitmap. JS cannot
 * impose a hard decoder-memory ceiling or interrupt a browser's synchronous work.
 * The one target canvas is at most 1920x1920; deadline rejects late async results.
 * Optional {signal} releases local references on queue disposal. File.arrayBuffer
 * and native decode/encode are not physically interruptible JavaScript operations.
 */
export async function optimizeChecklistImage(file, { signal } = {}) {
  const deadline = Date.now() + BUDGET_MS;
  let active = true, timer, image, canvas, objectUrl, onAbort;
  const check = () => {
    if (signal?.aborted) throw failure("optimization_cancelled");
    if (!active || Date.now() >= deadline) throw failure("optimization_timeout");
  };
  const work = async () => {
    check();
    if (!["image/jpeg", "image/png", "image/webp"].includes(file?.type)) throw failure("invalid_type");
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || typeof file.arrayBuffer !== "function") invalid();
    if (file.size > MAX_SOURCE_BYTES) throw failure("source_too_large");
    let source;
    try { source = new Uint8Array(await file.arrayBuffer()); } catch { throw failure("invalid_image"); }
    check();
    if (source.byteLength !== file.size) invalid();
    const admitted = inspect(source, file.type);
    check();
    image = new Image();
    objectUrl = URL.createObjectURL(new Blob([source], { type: file.type }));
    await new Promise((resolve, reject) => {
      image.onload = () => { if (active) resolve(); };
      image.onerror = () => { if (active) reject(failure("decode_failed")); };
      image.src = objectUrl;
    });
    check();
    const decoded = dimensions(image.naturalWidth, image.naturalHeight);
    if (!(decoded.width === admitted.width && decoded.height === admitted.height)
      && !(decoded.width === admitted.height && decoded.height === admitted.width)) throw failure("decode_failed");
    // Image applies EXIF orientation itself, including mirrored orientations.
    // Drawing its oriented natural dimensions avoids rotating a second time.
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
    if (!context) throw failure("encode_failed");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    check();
    const fallback = admitted.safe && scale === 1 && decoded.width === admitted.width && decoded.height === admitted.height;
    for (const quality of [0.85, 0.8, 0.75]) {
      let encoded = await new Promise((resolve, reject) => {
        try { canvas.toBlob(blob => { if (active) resolve(blob); }, "image/jpeg", quality); }
        catch { reject(failure("encode_failed")); }
      });
      check();
      if (!encoded || encoded.type !== "image/jpeg" || encoded.size > MAX_SOURCE_BYTES) throw failure("encode_failed");
      let bytes;
      try { bytes = new Uint8Array(await encoded.arrayBuffer()); } catch { throw failure("encode_failed"); }
      check();
      const container = jpegContainer(bytes, true);
      if (container.width !== width || container.height !== height) throw failure("encode_failed");
      encoded = new Blob(container.parts, { type: "image/jpeg" });
      check();
      if (encoded.size <= file.size) return { blob: encoded, originalBytes: file.size, optimizedBytes: encoded.size, width, height, contentType: encoded.type };
      if (fallback) {
        const blob = new Blob([source], { type: file.type });
        check();
        return { blob, originalBytes: file.size, optimizedBytes: blob.size, width, height, contentType: blob.type };
      }
      // Only retain this candidate until the next iteration; no candidate list.
    }
    throw failure("optimization_too_large");
  };
  try {
    const cancellation = new Promise((_, reject) => {
      if (!signal) return;
      onAbort = () => { active = false; reject(failure("optimization_cancelled")); };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return await Promise.race([work(), cancellation, new Promise((_, reject) => {
      timer = setTimeout(() => { active = false; reject(failure("optimization_timeout")); }, BUDGET_MS);
    })]);
  } catch (error) {
    if (error?.code?.startsWith("checklist_photo_")) throw error;
    throw failure("encode_failed");
  } finally {
    active = false; clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
    if (image) { image.onload = null; image.onerror = null; image.removeAttribute("src"); }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
