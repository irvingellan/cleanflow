import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const result = spawnSync("agent-browser", ["--version"], { encoding: "utf8" });

if (result.error || result.status !== 0) {
  throw new Error(
    "agent-browser is required for local visual smoke testing. Install it globally; do not add it as an application dependency.",
  );
}

const artifactDirectory = resolve("artifacts/visual-smoke");
await mkdir(artifactDirectory, { recursive: true });

console.log(`agent-browser ${result.stdout.trim()}`);
console.log(`Visual-smoke evidence will be written to ${artifactDirectory}.`);
console.log("Start Firebase emulators in another terminal, then follow docs/VISUAL_TESTING.md.");
