import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  const required = [...publicFiles, "index.html", "version.json", "sw.js", "firebase-messaging-sw.js"];
  const allowed = new Set(required);
  for (const file of files) {
    const sandboxIntakeChunk = expectedBinding?.environment === "sandbox"
      && /^assets\/ReservationInboxPreview-[A-Za-z0-9_-]+\.(js|css)$/.test(file);
    if (!allowed.has(file) && !/^assets\/index-[A-Za-z0-9_-]+\.(js|css)$/.test(file) && !sandboxIntakeChunk) {
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
    sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(dist, file))).digest("hex"),
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
