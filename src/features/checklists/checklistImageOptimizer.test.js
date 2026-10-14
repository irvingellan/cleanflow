import { afterEach, describe, expect, it, vi } from "vitest";
import { optimizeChecklistImage } from "./checklistImageOptimizer.js";
import { assertMetadataSafeChecklistImage } from "../../../functions/src/checklistImagePrivacy.js";
import { syntheticChecklistPng } from "../../../security/syntheticChecklistImages.mjs";

// Hand-checked, metadata-free synthetic 2x2 JPEG from the server privacy fixture.
const cleanJpeg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJVAA//Z", "base64"));
function jpeg(width = 2, height = 2, metadata = false) {
  const bytes = cleanJpeg.slice();
  const frame = bytes.findIndex((value, i) => value === 255 && bytes[i + 1] === 192);
  bytes[frame + 5] = height >> 8; bytes[frame + 6] = height & 255;
  bytes[frame + 7] = width >> 8; bytes[frame + 8] = width & 255;
  return metadata ? new Uint8Array([...bytes.slice(0, 2), 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, ...bytes.slice(2)]) : bytes;
}
function file(bytes = jpeg(), type = "image/jpeg") { return new Blob([bytes], { type }); }
function native({ width = 2, height = 2, fail = false, stall = false, encode, encodeStall = false } = {}) {
  const image = { naturalWidth: width, naturalHeight: height, removeAttribute: vi.fn(), onload: null, onerror: null };
  Object.defineProperty(image, "src", { set: () => { if (!stall) queueMicrotask(() => fail ? image.onerror?.() : image.onload?.()); } });
  const context = { fillRect: vi.fn(), drawImage: vi.fn() };
  const canvas = { width: 0, height: 0, getContext: () => context,
    toBlob: vi.fn((callback, type, quality) => { if (!encodeStall) queueMicrotask(() => callback(encode ? encode(type, quality) : file(jpeg(canvas.width, canvas.height)))); }) };
  vi.stubGlobal("Image", class { constructor() { return image; } });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:synthetic"), revokeObjectURL: vi.fn() });
  vi.spyOn(document, "createElement").mockImplementation(() => canvas);
  return { image, context, canvas };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("local checklist image optimizer", () => {
  it.each([[4000, 3000, 1920, 1440], [100, 60, 100, 60], [3000, 4000, 1440, 1920]])("bounds %sx%s without upscaling", async (width, height, wantedWidth, wantedHeight) => {
    const { canvas, context, image } = native({ width, height });
    const result = await optimizeChecklistImage(file(jpeg(width, height, true)));
    expect(result).toMatchObject({ width: wantedWidth, height: wantedHeight, contentType: "image/jpeg" });
    expect(result.optimizedBytes).toBeLessThanOrEqual(result.originalBytes);
    expect(result.blob).not.toBeInstanceOf(File);
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, wantedWidth, wantedHeight);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic");
    expect(image.onload).toBeNull(); expect(image.onerror).toBeNull();
    expect(image.removeAttribute).toHaveBeenCalledWith("src");
  });
  it.each(["image/heic", "image/heif", "image/svg+xml", ""])("rejects unsupported %j before native decode", async type => {
    native();
    await expect(optimizeChecklistImage(file(jpeg(), type))).rejects.toHaveProperty("code", "checklist_photo_invalid_type");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("rejects signature/MIME mismatch and truncated source", async () => {
    native();
    for (const input of [file(jpeg(), "image/png"), file(jpeg().slice(0, 20))]) {
      await expect(optimizeChecklistImage(input)).rejects.toHaveProperty("code", "checklist_photo_invalid_image");
    }
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("rejects source bytes above 20 MiB before reading", async () => {
    const read = vi.fn();
    await expect(optimizeChecklistImage({ type: "image/jpeg", size: 20 * 1024 * 1024 + 1, arrayBuffer: read })).rejects.toHaveProperty("code", "checklist_photo_source_too_large");
    expect(read).not.toHaveBeenCalled();
  });
  it("admits the exact 20 MiB byte boundary then rejects a partial source read",async()=>{
    native();const read=vi.fn().mockResolvedValue(cleanJpeg.buffer);
    await expect(optimizeChecklistImage({type:"image/jpeg",size:20*1024*1024,arrayBuffer:read})).rejects.toHaveProperty("code","checklist_photo_invalid_image");
    expect(read).toHaveBeenCalledOnce();expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("rejects declared 16MP overflow before allocating a native decoder", async () => {
    native();
    await expect(optimizeChecklistImage(file(jpeg(4001, 4000)))).rejects.toHaveProperty("code", "checklist_photo_pixels_exceeded");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("releases the decoder on native decode failure", async () => {
    const { image } = native({ fail: true });
    await expect(optimizeChecklistImage(file())).rejects.toHaveProperty("code", "checklist_photo_decode_failed");
    expect(URL.revokeObjectURL).toHaveBeenCalled(); expect(image.onload).toBeNull();
  });
  it.each(["read", "decode", "encode"])("expires a stalled %s at the absolute 20s deadline", async stage => {
    vi.useFakeTimers();
    const { canvas, image } = native({ stall: stage === "decode", encodeStall: stage === "encode" });
    const input = file(); let finishRead;
    if (stage === "read") Object.defineProperty(input, "arrayBuffer", { value: () => new Promise(resolve => { finishRead = resolve; }) });
    const outcome = optimizeChecklistImage(input).catch(error => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await outcome).toHaveProperty("code", "checklist_photo_optimization_timeout");
    expect(canvas.width).toBe(0); expect(image.onload).toBeNull();
    finishRead?.(jpeg().buffer);
    await vi.advanceTimersByTimeAsync(1);
    if (stage === "read") expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("shares one absolute deadline across source read and native decode", async () => {
    vi.useFakeTimers(); native({ stall: true });
    const input = file();
    Object.defineProperty(input, "arrayBuffer", { value: () => new Promise(resolve => setTimeout(() => resolve(jpeg().buffer), 15_000)) });
    const outcome = optimizeChecklistImage(input).catch(error => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await outcome).toHaveProperty("code", "checklist_photo_optimization_timeout");
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
  it("strips EXIF and encoder ICC while preserving a server-valid pixel stream", async () => {
    const encoded = new Uint8Array([...cleanJpeg.slice(0, 2), 255, 226, 0, 8, 73, 67, 67, 0, 0, 0, ...cleanJpeg.slice(2)]);
    native({ encode: () => file(encoded) });
    const result = await optimizeChecklistImage(file(jpeg(2, 2, true)));
    const bytes = Buffer.from(await result.blob.arrayBuffer());
    expect(bytes.equals(Buffer.from(cleanJpeg))).toBe(true);
    expect(() => assertMetadataSafeChecklistImage(bytes, result.contentType)).not.toThrow();
  });
  it("retains a validated metadata-free small original when encoding would enlarge it", async () => {
    native({ encode: () => file(jpeg(2, 2, true)) });
    const original = file();
    const result = await optimizeChecklistImage(original);
    expect(result.optimizedBytes).toBe(original.size);
    expect(Buffer.from(await result.blob.arrayBuffer())).toEqual(Buffer.from(cleanJpeg));
  });
  it("never retains private metadata or silently enlarges a non-fallback image", async () => {
    // More structural pixel bytes, not metadata, are needed to force output growth.
    const source = file(jpeg(2, 2, true));
    const larger = cleanJpeg.slice();
    const scan = larger.findIndex((value, i) => value === 255 && larger[i + 1] === 217);
    const largePixels = file(new Uint8Array([...larger.slice(0, scan), ...new Uint8Array(200).fill(1), ...larger.slice(scan)]));
    native({ encode: () => largePixels });
    await expect(optimizeChecklistImage(source)).rejects.toHaveProperty("code", "checklist_photo_optimization_too_large");
  });
  it("does not fall back to a JPEG whose color interpretation has no JFIF declaration", async () => {
    const source = file(new Uint8Array([...cleanJpeg.slice(0, 2), ...cleanJpeg.slice(20)]));
    native({ encode: () => file(cleanJpeg) });
    await expect(optimizeChecklistImage(source)).rejects.toHaveProperty("code", "checklist_photo_optimization_too_large");
  });
  it("admits exact 16MP but rejects excessive PNG dimensions before decode", async () => {
    native({ width: 4000, height: 4000 });
    await expect(optimizeChecklistImage(file(jpeg(4000, 4000, true)))).resolves.toMatchObject({width:1920,height:1920});
    const png = syntheticChecklistPng(1); png.writeUInt32BE(4001,16); png.writeUInt32BE(4000,20);
    // CRC must be recomputed for the declared header to remain structurally valid.
    let crc=0xffffffff; for(const byte of png.subarray(12,29)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
    png.writeUInt32BE((crc^0xffffffff)>>>0,29);
    URL.createObjectURL.mockClear();
    await expect(optimizeChecklistImage(file(png,"image/png"))).rejects.toHaveProperty("code","checklist_photo_pixels_exceeded");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("rejects excessive WebP declared dimensions and animation before native decode", async()=>{
    native();
    const container=new Uint8Array(30); container.set([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0]);
    container.set([160,15,0,159,15,0],24); // 4001x4000
    await expect(optimizeChecklistImage(file(container,"image/webp"))).rejects.toHaveProperty("code","checklist_photo_pixels_exceeded");
    container[20]=2;
    await expect(optimizeChecklistImage(file(container,"image/webp"))).rejects.toHaveProperty("code","checklist_photo_invalid_type");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("retains an independently validated simple metadata-free WebP when JPEG would grow it",async()=>{
    const bytes=new Uint8Array([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,32,10,0,0,0,0,0,0,157,1,42,96,0,64,0]);
    native({width:96,height:64});
    const result=await optimizeChecklistImage(file(bytes,"image/webp"));
    expect(result).toMatchObject({contentType:"image/webp",width:96,height:64,optimizedBytes:30});
    expect(Buffer.from(await result.blob.arrayBuffer())).toEqual(Buffer.from(bytes));
    expect(()=>assertMetadataSafeChecklistImage(Buffer.from(bytes),result.contentType)).not.toThrow();
  });
  it("rejects corrupt PNG CRC, animated PNG and mismatched decoded dimensions",async()=>{
    native({width:3,height:2});
    await expect(optimizeChecklistImage(file())).rejects.toHaveProperty("code","checklist_photo_decode_failed");
    const corrupt=syntheticChecklistPng(1);corrupt[29]^=1;
    await expect(optimizeChecklistImage(file(corrupt,"image/png"))).rejects.toHaveProperty("code","checklist_photo_invalid_image");
    const animated=syntheticChecklistPng(1,[["acTL",Buffer.from([0,0,0,1,0,0,0,0])]]);
    await expect(optimizeChecklistImage(file(animated,"image/png"))).rejects.toHaveProperty("code","checklist_photo_invalid_type");
  });
  it("never processes a late encoder callback after timeout",async()=>{
    vi.useFakeTimers(); const {canvas}=native({encodeStall:true}); let finish;
    canvas.toBlob.mockImplementation(callback=>{finish=callback;});
    const result=optimizeChecklistImage(file()).catch(error=>error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toHaveProperty("code","checklist_photo_optimization_timeout");
    const read=vi.fn().mockResolvedValue(cleanJpeg.buffer);
    finish({type:"image/jpeg",size:cleanJpeg.length,arrayBuffer:read});
    await vi.advanceTimersByTimeAsync(1);
    expect(read).not.toHaveBeenCalled();expect(canvas.width).toBe(0);
  });
  it.each(["read","decode","encode"])("releases and rejects %s on queue cancellation",async stage=>{
    vi.useFakeTimers();
    const abort=new AbortController(); const {canvas,image}=native({stall:stage==="decode",encodeStall:stage==="encode"});
    const input=file();let finishRead;
    if(stage==="read")Object.defineProperty(input,"arrayBuffer",{value:()=>new Promise(resolve=>{finishRead=resolve;})});
    let cancelled;
    const outcome=optimizeChecklistImage(input,{signal:abort.signal}).catch(error=>{cancelled=error;return error;});
    // Let the real source-read and native-boundary microtasks reach this stage.
    for(let i=0;i<8;i++)await Promise.resolve();
    abort.abort();
    for(let i=0;i<8;i++)await Promise.resolve();
    expect(cancelled?.code).toBe("checklist_photo_optimization_cancelled");
    expect(await outcome).toHaveProperty("code","checklist_photo_optimization_cancelled");
    expect(canvas.width).toBe(0);expect(image.onload).toBeNull();
    finishRead?.(cleanJpeg.buffer);
    for(let i=0;i<3;i++)await Promise.resolve();
    if(stage==="read")expect(URL.createObjectURL).not.toHaveBeenCalled();
    else expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
  it("rejects an already-cancelled selection before reading its source",async()=>{
    native();
    const abort=new AbortController();abort.abort();const input=file();const read=vi.spyOn(input,"arrayBuffer");
    await expect(optimizeChecklistImage(input,{signal:abort.signal})).rejects.toHaveProperty("code","checklist_photo_optimization_cancelled");
    expect(read).not.toHaveBeenCalled();
  });
  it("does not consume a late encoder Blob after queue cancellation",async()=>{
    vi.useFakeTimers();
    const abort=new AbortController();const {canvas}=native({encodeStall:true});let finish;
    canvas.toBlob.mockImplementation(callback=>{finish=callback;});
    let cancelled;
    const outcome=optimizeChecklistImage(file(),{signal:abort.signal}).catch(error=>{cancelled=error;return error;});
    for(let i=0;i<8;i++)await Promise.resolve();
    abort.abort();for(let i=0;i<8;i++)await Promise.resolve();
    expect(cancelled?.code).toBe("checklist_photo_optimization_cancelled");
    expect(await outcome).toHaveProperty("code","checklist_photo_optimization_cancelled");
    const read=vi.fn().mockResolvedValue(cleanJpeg.buffer);
    finish({type:"image/jpeg",size:cleanJpeg.length,arrayBuffer:read});
    for(let i=0;i<3;i++)await Promise.resolve();
    expect(read).not.toHaveBeenCalled();expect(canvas.width).toBe(0);
  });
  it("rejects null encoder output and releases its backing store", async () => {
    const { canvas } = native({ encode: () => null });
    await expect(optimizeChecklistImage(file())).rejects.toHaveProperty("code", "checklist_photo_encode_failed");
    expect(canvas.width).toBe(0); expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
