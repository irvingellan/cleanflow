import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

const artifactsRoot = resolve("artifacts");
const visualSmokeArtifacts = resolve(artifactsRoot, "visual-smoke");

if (!visualSmokeArtifacts.startsWith(`${artifactsRoot}${sep}`)) {
  throw new Error("Refusing to remove an artifact path outside artifacts/visual-smoke.");
}

await rm(visualSmokeArtifacts, { recursive: true, force: true });
console.log("Removed local visual-smoke artifacts.");
