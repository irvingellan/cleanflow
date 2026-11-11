import { execFileSync, spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

const officialOrigin = "https://github.com/irvingellan/cleanflow.git";
const fullSha = /^[a-f0-9]{40}$/;
const presentation = /^src\/(?:[^\n]+\.css|App\.jsx|(?:components|features)\/[^\n]+\.jsx|i18n\/translations\.js)$/;
const engineeringMetadata = new Set([
  ".github/workflows/engineering.yml", ".github/pull_request_template.md", "AGENTS.md", "CLAUDE.md", ".gitignore",
  "scripts/engineering.mjs", "scripts/releaseHostingScope.mjs", "scripts/releaseHostingOnly.mjs", "scripts/releaseNotificationBUpdate.mjs",
  "firebase.manager-e2e.json", "playwright.config.js", "scripts/runManagerE2e.mjs",
]);
const evidence = /^(?:docs\/|e2e\/|security\/)|(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/;

// Only the exact emulator entry point may differ. Runtime, dependency, and
// build metadata still require separate release review.
export function isManagerE2eScriptOnly(previousPackage, candidatePackage) {
  return candidatePackage?.scripts?.["test:e2e"] === "node scripts/runManagerE2e.mjs"
    && isDeepStrictEqual(previousPackage, {
      ...candidatePackage, scripts: { ...candidatePackage.scripts, "test:e2e": previousPackage?.scripts?.["test:e2e"] },
    });
}

/** Exact policy shared by release admission and CI. Unknown paths require separate review. */
export function inspectHostingOnlyPaths(paths, { previousPackage, candidatePackage } = {}) {
  const changed = [...new Set(paths)].sort();
  const blocked = changed.filter((file) => {
    if (file === "package.json") return !isManagerE2eScriptOnly(previousPackage, candidatePackage);
    if (/^(?:functions\/|public\/|src\/services\/firebase\/)/.test(file)) return true;
    return !presentation.test(file) && !evidence.test(file) && !engineeringMetadata.has(file);
  });
  return {
    allowed: blocked.length === 0 && changed.some((file) => presentation.test(file) && !evidence.test(file)),
    changed,
    blocked,
  };
}

export function validateForwardRelease({ baselineSha, head, officialHead, isAncestor }) {
  if (![baselineSha, head, officialHead].every((sha) => typeof sha === "string" && fullSha.test(sha))
    || head !== officialHead || baselineSha === head || !isAncestor(baselineSha, head)) {
    throw new Error("Release requires a fresh official origin/main HEAD strictly ahead of the exact published SHA.");
  }
}

export function assertOfficialReleaseHead(root, baselineSha, head, { action = "publish" } = {}) {
  const options = { cwd: root, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" }, stdio: ["ignore", "pipe", "ignore"] };
  const git = (...args) => execFileSync("git", args, options).trim();
  if (!fullSha.test(head || "") || git("remote", "get-url", "origin") !== officialOrigin || git("rev-parse", "HEAD") !== head
    || git("status", "--porcelain", "--untracked-files=all")) {
    throw new Error("Use the clean official CleanFlow source checkout and exact candidate HEAD.");
  }
  // A sealed rollback follows its live publication receipt, even after main advances.
  if (action === "rollback") return;
  let repository;
  try {
    repository = JSON.parse(execFileSync("gh", ["repo", "view", officialOrigin.slice(0, -4),
      "--json", "defaultBranchRef"], options));
  } catch {
    throw new Error("Official repository default branch could not be verified.");
  }
  if (repository?.defaultBranchRef?.name !== "main") {
    throw new Error("Publishing requires the verified official main branch.");
  }
  const official = git("ls-remote", "--exit-code", "origin", "refs/heads/main");
  const [officialHead, ref, extra] = official.split(/\s+/);
  if (ref !== "refs/heads/main" || extra) throw new Error("Official origin/main could not be verified.");
  validateForwardRelease({
    baselineSha, head, officialHead,
    isAncestor: (before, after) => spawnSync("git", ["merge-base", "--is-ancestor", before, after],
      { cwd: root, stdio: "ignore", timeout: 20_000 }).status === 0,
  });
}
