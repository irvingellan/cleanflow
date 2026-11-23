// Measures time and process memory of the checklist thumbnail generator on a synthetic photo.
// The photo is generated in a child process so its buffers do not count.
// Usage: node --max-old-space-size=192 scripts/performance/thumbnailMemory.mjs <width> <height> [photos]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeJpegThumbnail } from "../../functions/src/checklistThumbnail.js";

const [width, height, photos = 1] = process.argv.slice(2).map(Number);
if (!width || !height) throw new Error("Usage: thumbnailMemory.mjs <width> <height> [photos]");

const jpegModule = fileURLToPath(new URL("../../functions/node_modules/jpeg-js/index.js", import.meta.url));
const folder = mkdtempSync(join(tmpdir(), "cleanflow-thumbnail-"));
const file = join(folder, "synthetic.jpg");
// Gradients plus noise: compresses like a detailed photo and contains nothing real.
execFileSync(process.execPath, ["--input-type=module", "-e", `
  import jpeg from ${JSON.stringify(jpegModule)};
  import { writeFileSync } from "node:fs";
  const w = ${width}, h = ${height}; const data = Buffer.alloc(w * h * 4); let seed = 7;
  for (let i = 0; i < w * h; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff; const n = seed % 48; const x = i % w; const y = (i / w) | 0;
    data[i * 4] = (x * 255 / w + n) & 255; data[i * 4 + 1] = (y * 255 / h + n) & 255;
    data[i * 4 + 2] = ((x + y) * 127 / (w + h) + n) & 255; data[i * 4 + 3] = 255;
  }
  writeFileSync(${JSON.stringify(file)}, Buffer.from(jpeg.encode({ width: w, height: h, data }, 82).data));
`]);
const source = readFileSync(file);
rmSync(folder, { recursive: true, force: true });

const megabytes = (bytes) => Math.round(bytes / 1048576);
const baseRss = process.memoryUsage().rss;
let peakRss = baseRss;
let thumbnails = 0;
const times = [];
for (let index = 0; index < photos; index += 1) {
  const started = performance.now();
  if (makeJpegThumbnail(source)) thumbnails += 1;
  times.push(performance.now() - started);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  await new Promise((resolve) => setTimeout(resolve, 0));
}
times.sort((first, second) => first - second);
console.log(JSON.stringify({
  size: `${width}x${height}`, sourceKB: Math.round(source.length / 1024), photos, thumbnails,
  baseRssMB: megabytes(baseRss), peakRssMB: megabytes(peakRss),
  medianMs: Math.round(times[times.length >> 1]), slowestMs: Math.round(times.at(-1)),
}));
