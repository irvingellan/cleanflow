import { deflateSync } from "node:zlib";
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name);
  const size = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([size, type, data, checksum]);
}
/** Valid synthetic 1x1 RGB PNG, with no personal content or metadata. */
export function syntheticChecklistPng(red = 1, extraChunks = []) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header),
    ...extraChunks.map(([type, bytes]) => chunk(type, bytes)),
    chunk("IDAT", deflateSync(Buffer.from([0, red, 100, 120]))), chunk("IEND", Buffer.alloc(0)),
  ]);
}
