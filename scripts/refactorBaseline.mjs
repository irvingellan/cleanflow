import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

if (!existsSync("dist")) {
  console.error("Run npm run build:emulators first.");
  process.exit(1);
}

const assetDirectory = "dist/assets";
const assets = readdirSync(assetDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(js|css)$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const assetRows = assets.map((asset) => {
  const bytes = readFileSync(join(assetDirectory, asset));
  const name = asset.replace(/-[\w-]{8}(?=\.(?:js|css)$)/, "-*");
  return [`${assetDirectory}/${name} (bytes)`, bytes.length, gzipSync(bytes).length];
});

const countedFiles = [
  "src/index.css",
  "src/i18n/translations.js",
  "functions/src/index.js",
  "src/App.jsx",
  "src/features/jobs/JobDetail.jsx",
];
const lineRows = countedFiles.map((file) => {
  const source = readFileSync(file, "utf8");
  return [`${file} (lines)`, source.split("\n").length - Number(source.endsWith("\n")), "—"];
});

const literalFileCount = ["src", "functions/src"].flatMap((directory) =>
  readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) =>
    entry.isFile()
    && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
    && !/(?:^|[\\/])(?:test|tests|__tests__|__snapshots__)(?:[\\/]|$)/.test(entry.parentPath)
    && readFileSync(join(entry.parentPath, entry.name), "utf8").includes("cleanflow-demo"),
  ),
).length;

const imports = Array.from({ length: 5 }, () => Number(execFileSync(process.execPath, [
  "-e",
  "const t=performance.now();import('./src/index.js').then(()=>console.log(performance.now()-t))",
], {
  cwd: "functions",
  env: {
    ...process.env,
    GCLOUD_PROJECT: "demo-cleanflow",
    FIREBASE_CONFIG: '{"projectId":"demo-cleanflow"}',
    GOOGLE_APPLICATION_CREDENTIALS: "/nonexistent/cleanflow-no-credentials.json",
  },
  encoding: "utf8",
}).trim())).sort((a, b) => a - b);

const rows = [
  ...assetRows,
  ...lineRows,
  ["Non-test files containing cleanflow-demo", literalFileCount, "—"],
  ["Median of 5 Functions imports (ms)", imports[2].toFixed(1), "—"],
];
console.log("| Metric | Value | Gzip bytes |");
console.log("| --- | ---: | ---: |");
for (const row of rows) console.log(`| ${row.join(" | ")} |`);
