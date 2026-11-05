import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const hostingBundleAsset = /^assets\/(?:index|main)-[A-Za-z0-9_-]+\.(js|css)$/;
// Emitted by Vite from @fontsource-variable/inter 5.2.8's wght.css.
// Pin both the emitted paths and the SHA-256 of the reviewed package bytes.
const interFonts = new Map([
  ["assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2", "ca157063339ac4ad418f214f3abfed119b0798ab4d377386ce5c9e5a7a435ebd"],
  ["assets/inter-cyrillic-wght-normal-DqGufNeO.woff2", "71d5ee93cc1e9f1d520a3a8b66456de18c7879d8df09d57fcd2eaff75fef0075"],
  ["assets/inter-greek-ext-wght-normal-DlzME5K_.woff2", "6e9e020a25f9b56d418f2c085b1d3c09725a4da23fe693a5b463064606732190"],
  ["assets/inter-greek-wght-normal-CkhJZR-_.woff2", "1be3448e292fbf05ffe176fe1e43f135013d50b1e7d324ad1a558f623d3bb6f6"],
  ["assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2", "34b9c504cab7a73e37b746343a449132e56cf7b5481af2cb81dc74dcff25c956"],
  ["assets/inter-latin-wght-normal-Dx4kXJAl.woff2", "3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62"],
  ["assets/inter-vietnamese-wght-normal-CBcvBZtf.woff2", "5c66f9e07e90c6d4ac4922cc68d60de26c17b1858e677fb5e603fce3952b3ff2"],
]);
const fileHash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export function inspectHostingFonts(dist, files) {
  const declared = new Set();
  for (const file of files.filter((name) => hostingBundleAsset.test(name) && name.endsWith(".css"))) {
    const css = fs.readFileSync(path.join(dist, file), "utf8");
    for (const match of css.matchAll(/url\(\s*(["']?)\/(assets\/[^)'"\s]+\.woff2)\1\s*\)/g)) {
      declared.add(match[2]);
    }
  }
  for (const file of files.filter((name) => /\.woff2$/i.test(name))) {
    if (!interFonts.has(file) || !declared.has(file)) throw new Error(`Unexpected or undeclared Hosting font: ${file}`);
    if (fileHash(path.join(dist, file)) !== interFonts.get(file)) throw new Error(`Hosting font hash differs: ${file}`);
  }
  for (const file of declared) {
    if (!files.includes(file)) throw new Error(`Missing declared Hosting font: ${file}`);
  }
  return declared;
}

export function inspectHostingBuild(dist, expectedSha, publicFiles, expectedBinding) {
  const files = [];
  function walk(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.name === ".DS_Store") {
        fs.rmSync(absolute, { force: true });
        continue;
      }
      if (entry.isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
      if (entry.isDirectory()) walk(absolute, relative + "/");
      else files.push(relative);
    }
  }
  walk(dist);
  const fonts = inspectHostingFonts(dist, files);
  const required = [...publicFiles, "index.html", "agenda.html", "version.json", "sw.js", "firebase-messaging-sw.js"];
  // Builds on the previous source line do not emit the optional cleaner worker.
  const allowed = new Set([...required, "cleaner-messaging-sw.js"]);
  for (const file of files) {
    if (!allowed.has(file) && !fonts.has(file) && !hostingBundleAsset.test(file)) {
      throw new Error(`Unexpected Hosting file: ${file}`);
    }
    if (file.split("/").some(part => part.startsWith(".")) || /(?:\.tmp|\.temp|\.swp|\.swo|~)$/.test(file)) {
      throw new Error(`Local artifact rejected: ${file}`);
    }
  }
  for (const file of required) if (!files.includes(file)) throw new Error(`Missing Hosting file: ${file}`);
  const version = JSON.parse(fs.readFileSync(path.join(dist, "version.json"), "utf8"));
  if (version.buildId !== expectedSha) {
    throw new Error("Hosting build ID does not match intended SHA");
  }
  if (expectedBinding && (version.environment !== expectedBinding.environment || version.projectId !== expectedBinding.projectId)) {
    throw new Error("Hosting environment/project does not match intended alias");
  }
  return files.sort().map(file => ({
    file,
    sha256: fileHash(path.join(dist, file)),
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const head = git("rev-parse", "HEAD");
  const expectedSha = process.argv[2] || head;
  const environment = process.argv[3] || "production";
  if (!["production", "sandbox"].includes(environment)) throw new Error("Hosting preparation requires production or sandbox");
  const alias = environment === "production" ? "prod" : "sandbox";
  const projectId = JSON.parse(fs.readFileSync(path.join(root, ".firebaserc"), "utf8")).projects[alias];
  if (!projectId || environment === "sandbox" && projectId === "clean-flow-prototipo"
    || environment === "production" && projectId !== "clean-flow-prototipo") {
    throw new Error("Missing or unsafe Hosting project alias. No build or deploy performed.");
  }
  if (expectedSha !== head) throw new Error("Expected SHA must equal checked-out HEAD");
  if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Tracked working tree must be clean");
  const publicFiles = git("ls-files", "public").split("\n").filter(Boolean).map(file => file.slice(7));
  const dist = path.join(root, "dist");
  const manifestPath = path.join(root, ".firebase", "hosting-prepared-manifest.json");
  fs.rmSync(manifestPath, { force: true });
  fs.rmSync(dist, { recursive: true, force: true });
  execFileSync("npm", ["run", environment === "sandbox" ? "build:sandbox" : "build"], { cwd: root, stdio: "inherit", env: { ...process.env, GITHUB_SHA: expectedSha } });
  const binding = { environment, projectId };
  const manifest = { buildId: expectedSha, ...binding, files: inspectHostingBuild(dist, expectedSha, publicFiles, binding) };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
  console.log("Hosting prepared. No deployment performed.");
}
