import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function inspectHostingBuild(dist, expectedSha, publicFiles) {
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
    if (!allowed.has(file) && !/^assets\/index-[A-Za-z0-9_-]+\.(js|css)$/.test(file)) {
      throw new Error(`Unexpected Hosting file: ${file}`);
    }
    if (file.split("/").some(part => part.startsWith(".")) || /(?:\.tmp|\.temp|\.swp|\.swo|~)$/.test(file)) {
      throw new Error(`Local artifact rejected: ${file}`);
    }
  }
  for (const file of required) if (!files.includes(file)) throw new Error(`Missing Hosting file: ${file}`);
  if (JSON.parse(fs.readFileSync(path.join(dist, "version.json"), "utf8")).buildId !== expectedSha) {
    throw new Error("Hosting build ID does not match intended SHA");
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
  if (expectedSha !== head) throw new Error("Expected SHA must equal checked-out HEAD");
  if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Tracked working tree must be clean");
  const publicFiles = git("ls-files", "public").split("\n").filter(Boolean).map(file => file.slice(7));
  const dist = path.join(root, "dist");
  const manifestPath = path.join(root, ".firebase", "hosting-prepared-manifest.json");
  fs.rmSync(manifestPath, { force: true });
  fs.rmSync(dist, { recursive: true, force: true });
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit", env: { ...process.env, GITHUB_SHA: expectedSha } });
  const manifest = { buildId: expectedSha, files: inspectHostingBuild(dist, expectedSha, publicFiles) };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
  console.log("Hosting prepared. No deployment performed.");
}
