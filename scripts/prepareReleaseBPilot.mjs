import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { releaseBBranch, validReleaseVerification } from "./preflightNotificationRelease.mjs";
import { sha256 } from "./notificationReleaseCloud.mjs";

const root = resolve(import.meta.dirname, "..");
const fail = (message) => { throw new Error(message); };
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
try {
  const { values } = parseArgs({ options: {
    "a-dir": { type: "string" }, "env-dir": { type: "string" }, dir: { type: "string" },
    verification: { type: "string" }, "vapid-console-sha256": { type: "string" },
  } });
  const { "a-dir": aDir, "env-dir": envDir, dir, verification, "vapid-console-sha256": fingerprint } = values;
  if (!aDir || !envDir || !dir || !verification || !/^[a-f0-9]{64}$/.test(fingerprint ?? "")) {
    fail("Use --a-dir, --env-dir, --dir, --verification and the Console public VAPID fingerprint.");
  }
  const target = resolve(dir);
  if (!relative(root, target).startsWith(".tmp/")) fail("Use an ignored directory under .tmp.");
  const sha = git("rev-parse", "HEAD");
  if (git("branch", "--show-current") !== releaseBBranch || git("status", "--porcelain")
    || process.versions.node.split(".")[0] !== "22" || !validReleaseVerification(json(verification), sha)) {
    fail("Use the clean Release B branch on Node 22 and its exact test receipt.");
  }
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const copyExact = (source, dest) => {
    if (!existsSync(dest)) cpSync(source, dest, { errorOnExist: true, force: false });
    else if (!readFileSync(source).equals(readFileSync(dest))) fail("Existing review input differs. Use a fresh directory.");
  };
  copyExact(verification, join(target, "verification.json"));
  const preflightReport = join(target, "preflight-B.json");
  // Use a temporary report to avoid replacing a sealed preflight.
  const scratch = join(target, "preflight-B-latest.json");
  execFileSync(process.execPath, ["scripts/preflightNotificationRelease.mjs", "--stage", "B", "--sha", sha,
    "--a-plan", join(aDir, "release-plan.json"), "--a-receipt", join(aDir, "publish-receipt.json"),
    "--previous-manifest", join(aDir, "hosting-manifest-A.json"), "--env-dir", envDir,
    "--verification", join(target, "verification.json"), "--vapid-console-sha256", fingerprint,
    "--report", scratch, "--build"], { cwd: root, stdio: "inherit" });
  const preflight = json(scratch);
  if (preflight.status !== "DRY_RUN_READY" || preflight.cleanerPushMode !== "pilot") fail("Pilot preflight did not pass.");
  copyExact(scratch, preflightReport);
  const manifest = join(root, ".firebase/hosting-prepared-manifest.json");
  if (sha256(readFileSync(manifest)) !== preflight.manifest.sha256) fail("Prepared bytes drifted.");
  copyExact(manifest, join(target, "hosting-manifest-B.json"));
  if (!existsSync(join(target, "assets-B"))) cpSync(join(root, "dist"), join(target, "assets-B"), { recursive: true });
  execFileSync(process.execPath, ["scripts/releaseNotificationB.mjs", "seal", "--sha", sha,
    "--a-dir", aDir, "--dir", target], { cwd: root, stdio: "inherit" });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
