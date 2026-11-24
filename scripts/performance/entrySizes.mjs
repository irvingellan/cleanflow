// Prints the JavaScript each entry downloads, following static imports between built chunks.
// Usage: npm run build:emulators && node scripts/performance/entrySizes.mjs [dist]
import { readFileSync, readdirSync } from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";

const directory = `${process.argv[2] || "dist"}/assets/`;
const files = readdirSync(directory).filter((file) => file.endsWith(".js"));
const chunk = (prefix) => files.find((file) => file.startsWith(`${prefix}-`));
const imports = (file) => [...readFileSync(directory + file, "utf8").matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)]
  .map((match) => match[1]);

function closure(entry, seen = new Set()) {
  if (!entry || seen.has(entry)) return seen;
  seen.add(entry);
  imports(entry).forEach((file) => closure(file, seen));
  return seen;
}

const entries = {
  "manager (/)": ["main", "ManagerRoot"],
  "cleaner agenda (/agenda)": ["main", "CleanerHubApp"],
  "public checklist": ["main", "PublicChecklistPage"],
  "public offer": ["main", "PublicOfferPage"],
};

for (const [label, roots] of Object.entries(entries)) {
  const chunks = [...new Set(roots.flatMap((root) => [...closure(chunk(root))]))];
  const total = { bytes: 0, gzip: 0, brotli: 0 };
  for (const file of chunks) {
    const content = readFileSync(directory + file);
    total.bytes += content.length;
    total.gzip += gzipSync(content).length;
    total.brotli += brotliCompressSync(content).length;
  }
  console.log(`${label}: ${chunks.length} chunks, ${total.bytes} bytes, ${total.gzip} gzip, ${total.brotli} brotli`);
}
