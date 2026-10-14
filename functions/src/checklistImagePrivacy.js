import { HttpsError } from "firebase-functions/v2/https";

function invalid() {
  throw new HttpsError("invalid-argument", "Choose a valid image without embedded metadata.");
}
function dimensions(width, height) {
  if (!width || !height || width * height > 16_000_000) invalid();
}
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

/** Container validation, not an image decoder. V2 accepts browser-reencoded still images only. */
export function assertMetadataSafeChecklistImage(bytes, contentType) {
  if (contentType === "image/jpeg") {
    let offset = 2;
    let frame = false;
    let scan = false;
    let quantization = false;
    let huffman = false;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9) {
        if (!frame || !scan || offset !== bytes.length) invalid();
        return;
      }
      if (marker === 0xd8 || marker === 0 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) invalid();
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) invalid();
      // APP1 includes EXIF and XMP; APP13/IPTC and comments are also private metadata.
      if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) invalid();
      if (![0xe0, 0xc0, 0xc1, 0xc2, 0xc4, 0xdb, 0xdd, 0xda].includes(marker)) invalid();
      if (marker === 0xe0 && (length < 16 || bytes.toString("ascii", offset + 2, offset + 7) !== "JFIF\0")) invalid();
      if (marker === 0xe0 && length !== 16 + 3 * bytes[offset + 14] * bytes[offset + 15]) invalid();
      if (marker === 0xdd && length !== 4) invalid();
      if (marker === 0xdb || marker === 0xc4) {
        let tableOffset = offset + 2;
        while (tableOffset < offset + length) {
          const tableInfo = bytes[tableOffset++];
          if ((tableInfo & 15) > 3 || (tableInfo >>> 4) > 1) invalid();
          if (marker === 0xdb) {
            tableOffset += 64 * ((tableInfo >>> 4) + 1);
            quantization = true;
          } else {
            if (tableOffset + 16 > offset + length) invalid();
            let symbols = 0;
            for (let i = 0; i < 16; i++) symbols += bytes[tableOffset++];
            if (!symbols || symbols > 256) invalid();
            tableOffset += symbols;
            huffman = true;
          }
        }
        if (tableOffset !== offset + length) invalid();
      }
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (frame || length < 11 || bytes[offset + 2] !== 8 || length !== 8 + bytes[offset + 7] * 3) invalid();
        dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
        frame = true;
      }
      offset += length;
      if (marker === 0xda) {
        if (!frame || !quantization || !huffman || length < 8 || length !== 6 + 2 * bytes[offset - length + 2]) invalid();
        scan = true;
        const scanStart = offset;
        // Entropy bytes may contain stuffed FF00 and restart markers.
        while (offset < bytes.length) {
          if (bytes[offset] !== 255) { offset++; continue; }
          const next = bytes[offset + 1];
          if (next === 0 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
          break;
        }
        if (offset === scanStart) invalid();
      }
    }
    invalid();
  }
  if (contentType === "image/png") {
    let offset = 8;
    let header = false;
    let data = false;
    let colorType;
    let bitDepth;
    let paletteEntries = 0;
    const seen = new Set();
    const allowed = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "sRGB", "pHYs"]);
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (length > bytes.length - offset - 12 || !allowed.has(type)) invalid();
      if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) invalid();
      if (!header && type !== "IHDR") invalid();
      // All supported metadata/palette chunks have fixed, typed payloads and
      // precede pixel data. A valid CRC does not make arbitrary payloads safe.
      if (type !== "IDAT" && seen.has(type)) invalid();
      if (seen.has("IDAT") && !["IDAT", "IEND"].includes(type)) invalid();
      if (["gAMA", "cHRM", "sRGB"].includes(type) && seen.has("PLTE")) invalid();
      const payload = offset + 8;
      if (type === "IHDR") {
        if (header || length !== 13) invalid();
        dimensions(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12));
        bitDepth = bytes[payload + 8];
        colorType = bytes[payload + 9];
        if (!({ 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] })[colorType]?.includes(bitDepth)
          || bytes[payload + 10] !== 0 || bytes[payload + 11] !== 0 || bytes[payload + 12] > 1) invalid();
        header = true;
      }
      if (type === "gAMA" && (length !== 4 || bytes.readUInt32BE(payload) === 0)) invalid();
      if (type === "sRGB" && (length !== 1 || bytes[payload] > 3)) invalid();
      if (type === "pHYs" && (length !== 9 || bytes[payload + 8] > 1)) invalid();
      if (type === "cHRM") {
        if (length !== 32) invalid();
        for (let point = 0; point < 4; point++) {
          const x = bytes.readUInt32BE(payload + point * 8);
          const y = bytes.readUInt32BE(payload + point * 8 + 4);
          if (x > 100_000 || y > 100_000 || x + y > 100_000) invalid();
        }
      }
      if (type === "PLTE") {
        if ([0,4].includes(colorType) || seen.has("tRNS") || !length || length % 3 || length > 768) invalid();
        paletteEntries = length / 3;
        if (colorType === 3 && paletteEntries > 2 ** bitDepth) invalid();
      }
      if (type === "tRNS") {
        if (colorType === 3) {
          if (!paletteEntries || !length || length > paletteEntries) invalid();
        } else if (colorType === 0 || colorType === 2) {
          if (length !== (colorType === 0 ? 2 : 6)) invalid();
          for (let sample = 0; sample < length; sample += 2) if (bytes.readUInt16BE(payload + sample) >= 2 ** bitDepth) invalid();
        } else invalid();
      }
      if (type === "IDAT" && colorType === 3 && !paletteEntries) invalid();
      if (type === "IDAT" && length > 0) data = true;
      seen.add(type);
      offset += length + 12;
      if (type === "IEND") { if (!data || length !== 0 || offset !== bytes.length) invalid(); return; }
    }
    invalid();
  }
  if (contentType === "image/webp") {
    if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) invalid();
    let offset = 12;
    let image = false;
    while (offset + 8 <= bytes.length) {
      const type = bytes.toString("ascii", offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      if (!new Set(["VP8 ", "VP8L", "VP8X", "ALPH"]).has(type) || size > bytes.length - offset - 8) invalid();
      if (type === "VP8X" && (size !== 10 || (bytes[offset + 8] & ~0x10) !== 0)) invalid();
      if (type === "VP8X") dimensions(bytes.readUIntLE(offset + 12, 3) + 1, bytes.readUIntLE(offset + 15, 3) + 1);
      if (type === "VP8 " || type === "VP8L") {
        if (image || (type === "VP8 " && (size < 10 || !bytes.subarray(offset + 11, offset + 14).equals(Buffer.from([0x9d, 0x01, 0x2a]))))
          || (type === "VP8L" && (size < 5 || bytes[offset + 8] !== 0x2f))) invalid();
        image = true;
        if (type === "VP8 ") dimensions(bytes.readUInt16LE(offset + 14) & 0x3fff, bytes.readUInt16LE(offset + 16) & 0x3fff);
        else {
          const packed = bytes.readUInt32LE(offset + 9);
          dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
        }
      }
      offset += 8 + size + (size % 2);
    }
    if (!image || offset !== bytes.length) invalid();
    return;
  }
  invalid();
}
