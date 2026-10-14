import { describe, expect, it } from "vitest";
import { assertMetadataSafeChecklistImage } from "./checklistImagePrivacy.js";
import { syntheticChecklistPng } from "../../security/syntheticChecklistImages.mjs";

// Synthetic black 2x2 Chromium Canvas JPEG, with its generated ICC APP2 removed.
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJVAA//Z", "base64");
describe("V2 image privacy boundary", () => {
  it("accepts synthetic metadata-free PNG and browser JPEG", () => {
    expect(() => assertMetadataSafeChecklistImage(syntheticChecklistPng(), "image/png")).not.toThrow();
    expect(() => assertMetadataSafeChecklistImage(jpeg, "image/jpeg")).not.toThrow();
  });
  it.each(["eXIf", "iTXt", "tEXt", "zTXt"])("rejects PNG %s metadata even with a valid CRC", type => {
    expect(() => assertMetadataSafeChecklistImage(syntheticChecklistPng(1, [[type, Buffer.from("private")]]), "image/png")).toThrow();
  });
  it("rejects private GPS/filename text hidden in a recognized PNG gAMA chunk", () => {
    const bytes = syntheticChecklistPng(1, [["gAMA", Buffer.from("synthetic GPS=12.34,56.78;filename=private-example.png")]]);
    expect(() => assertMetadataSafeChecklistImage(bytes, "image/png")).toThrow();
  });
  it("accepts correctly typed browser-compatible PNG ancillary values", () => {
    const chromaticities = Buffer.alloc(32);
    [31270,32900,64000,33000,30000,60000,15000,6000].forEach((value, index) => chromaticities.writeUInt32BE(value, index * 4));
    const png = syntheticChecklistPng(1, [
      ["gAMA", Buffer.from([0,0,177,143])], ["cHRM", chromaticities], ["sRGB", Buffer.from([0])],
      ["pHYs", Buffer.from([0,0,14,196,0,0,14,196,1])], ["PLTE", Buffer.from([1,2,3])],
      ["tRNS", Buffer.from([0,1,0,2,0,3])],
    ]);
    expect(() => assertMetadataSafeChecklistImage(png, "image/png")).not.toThrow();
  });
  it.each([
    ["gAMA", Buffer.alloc(4)], ["sRGB", Buffer.from([4])], ["sRGB", Buffer.from([0, 1])],
    ["cHRM", Buffer.alloc(31)], ["pHYs", Buffer.alloc(10)], ["pHYs", Buffer.from([0,0,0,1,0,0,0,1,2])],
    ["PLTE", Buffer.alloc(4)], ["PLTE", Buffer.alloc(0)], ["tRNS", Buffer.from("private")],
  ])("rejects malformed PNG %s payload", (type, bytes) => {
    expect(() => assertMetadataSafeChecklistImage(syntheticChecklistPng(1, [[type, bytes]]), "image/png")).toThrow();
  });
  it("rejects duplicate and post-IDAT PNG ancillary chunks", () => {
    const validGamma = Buffer.from([0,0,177,143]);
    expect(() => assertMetadataSafeChecklistImage(syntheticChecklistPng(1, [["gAMA", validGamma], ["gAMA", validGamma]]), "image/png")).toThrow();
    const png = syntheticChecklistPng(1, [["gAMA", validGamma]]);
    const afterData = Buffer.concat([png.subarray(0, 33), png.subarray(49, png.length - 12), png.subarray(33, 49), png.subarray(png.length - 12)]);
    expect(() => assertMetadataSafeChecklistImage(afterData, "image/png")).toThrow();
    expect(() => assertMetadataSafeChecklistImage(syntheticChecklistPng(1, [["IDAT", Buffer.alloc(0)], ["gAMA", validGamma]]), "image/png")).toThrow();
  });
  it("rejects JPEG EXIF/XMP/IPTC/comments and trailing data", () => {
    for (const marker of [0xe1, 0xe2, 0xed, 0xfe]) {
      const bytes = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([255, marker, 0, 4, 1, 1]), jpeg.subarray(2)]);
      expect(() => assertMetadataSafeChecklistImage(bytes, "image/jpeg")).toThrow();
    }
    expect(() => assertMetadataSafeChecklistImage(Buffer.concat([jpeg, Buffer.from("private")]), "image/jpeg")).toThrow();
  });
  it("rejects malformed or missing JPEG tables and excessive declared dimensions", () => {
    const noTables = Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
    expect(() => assertMetadataSafeChecklistImage(noTables, "image/jpeg")).toThrow();
    const giant = Buffer.from(jpeg);
    const frame = giant.indexOf(Buffer.from([255,192]));
    giant.writeUInt16BE(65535, frame + 5);
    giant.writeUInt16BE(65535, frame + 7);
    expect(() => assertMetadataSafeChecklistImage(giant, "image/jpeg")).toThrow();
  });
  it("rejects truncated containers and corrupted PNG CRC", () => {
    const png = syntheticChecklistPng();
    png[png.length - 1] ^= 1;
    expect(() => assertMetadataSafeChecklistImage(png, "image/png")).toThrow();
    expect(() => assertMetadataSafeChecklistImage(jpeg.subarray(0, jpeg.length - 2), "image/jpeg")).toThrow();
    expect(() => assertMetadataSafeChecklistImage(Buffer.from("RIFF0000WEBP"), "image/webp")).toThrow();
  });
});
