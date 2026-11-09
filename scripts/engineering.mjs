import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { inspectHostingOnlyPaths } from "./releaseHostingScope.mjs";

const official = "https://github.com/irvingellan/cleanflow.git";
const liveMarker = "https://clean-flow-prototipo.web.app/version.json";
const sha = /^[0-9a-f]{40}$/;
const issueId = /^[1-9][0-9]*$/;
const ownedBranch = /^(codex|claude)\/issue-([1-9][0-9]*)-[a-z0-9][a-z0-9-]*$/;

function run(cwd, cmd, args) {
  return execFileSync(cmd, args, {
    cwd, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "pipe"], timeout: 12_000, maxBuffer: 8 * 1024 * 1024,
  });
}
const git = (cwd, ...args) => run(cwd, "git", args);
function check(condition, message) {
  if (!condition) throw new Error(message);
}
const names = (output) => output.split("\0").filter(Boolean);
const headAt = (cwd) => git(cwd, "rev-parse", "--verify", "HEAD").trim();
const branchAt = (cwd) => git(cwd, "branch", "--show-current").trim();
const commonAt = (cwd) => git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir").trim();
const trackedDelta = (cwd, base, head) => names(git(cwd, "diff", "--name-only", "-z", "--no-renames", base, head));
const worktreeDelta = (cwd) => [...new Set([
  ...names(git(cwd, "diff", "--name-only", "-z", "--no-renames")),
  ...names(git(cwd, "diff", "--cached", "--name-only", "-z", "--no-renames")),
  ...names(git(cwd, "ls-files", "--others", "--exclude-standard", "-z")),
])];

export function readWorktrees(cwd) {
  const rows = [];
  for (const line of git(cwd, "worktree", "list", "--porcelain", "-z").split("\0")) {
    const split = line.indexOf(" ");
    if (!line) continue;
    const key = split === -1 ? line : line.slice(0, split);
    const value = split === -1 ? true : line.slice(split + 1);
    if (key === "worktree") rows.push({ path: value });
    else if (rows.length) rows.at(-1)[key] = value;
  }
  return rows.map(({ path, HEAD, branch, locked, prunable, detached }) => ({
    path, head: HEAD ?? null, branch: branch?.replace(/^refs\/heads\//, "") ?? null,
    locked: Boolean(locked), prunable: Boolean(prunable), detached: Boolean(detached),
  }));
}

function isCommit(cwd, id) {
  if (!sha.test(id ?? "")) return false;
  try { return git(cwd, "cat-file", "-t", id).trim() === "commit"; } catch { return false; }
}
export function ancestry(cwd, left, right) {
  if (!isCommit(cwd, left) || !isCommit(cwd, right)) return null;
  const [leftOnly, rightOnly] = git(cwd, "rev-list", "--left-right", "--count", `${left}...${right}`)
    .trim().split(/\s+/).map(Number);
  return { leftOnly, rightOnly };
}

function inScope(path, scope) {
  const file = path.toLowerCase();
  const prefix = scope.toLowerCase();
  return file === prefix || file.startsWith(prefix + "/");
}

export function scopeOverlap(left, right) {
  return inScope(left, right) || inScope(right, left);
}

export function validScopePath(path) {
  return /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path ?? "")
    && !path.split("/").some((part) => [".", "..", ".git"].includes(part.toLowerCase()));
}

function claimsPath(cwd) { return join(commonAt(cwd), "cleanflow-task-claims.json"); }
function readClaims(cwd) {
  const path = claimsPath(cwd);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
}

function updateClaims(cwd, update) {
  const path = claimsPath(cwd);
  const lock = path + ".lock";
  mkdirSync(lock, { mode: 0o700 });
  try {
    const next = update(readClaims(cwd));
    const temporary = join(lock, "next.json");
    writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
    renameSync(temporary, path);
    return next;
  } finally { rmdirSync(lock); }
}

export function claimTask(cwd, { issue, scopes, canonical }) {
  cwd = realpathSync(cwd);
  const branch = branchAt(cwd);
  check(issueId.test(issue) && ownedBranch.exec(branch)?.[2] === issue, "Use an issue-specific codex/ or claude/ branch.");
  check(scopes.length && scopes.every(validScopePath), "Supply explicit repository-relative --path scopes.");
  check(readWorktrees(cwd).some((row) => row.path === cwd && row.branch === branch && !row.locked && !row.prunable),
    "Use the registered, unlocked task worktree.");
  check(worktreeDelta(cwd).length === 0, "Start a task from a clean worktree.");
  const relation = ancestry(cwd, canonical, headAt(cwd));
  check(relation && relation.leftOnly === 0, "Task HEAD does not include the canonical commit.");
  const entry = { issue: Number(issue), branch, path: cwd, scopes: [...new Set(scopes)], canonical };
  return updateClaims(cwd, (claims) => {
    check(!claims.some((other) => other.issue === entry.issue || other.branch === branch
      || entry.scopes.some((path) => other.scopes.some((scope) => scopeOverlap(path, scope)))),
    "An active task already owns the issue, branch, or scope.");
    return [...claims, entry];
  }).find((row) => row.branch === branch);
}

export function closeTask(cwd, issue) {
  cwd = realpathSync(cwd);
  const branch = branchAt(cwd);
  return updateClaims(cwd, (claims) => {
    const match = claims.find((row) => row.path === cwd && row.branch === branch && row.issue === Number(issue));
    check(match, "This worktree does not own the requested issue.");
    return claims.filter((row) => row !== match);
  });
}

export function checkCandidate(cwd, { base, head, scope }) {
  const relation = ancestry(cwd, base, head);
  check(relation && relation.leftOnly === 0 && relation.rightOnly > 0,
    "Candidate must contain the exact integration base and advance it.");
  const paths = trackedDelta(cwd, base, head);
  check(paths.length, "Candidate has no changes.");
  if (scope === "hosting") {
    check(!paths.some((path) => path.startsWith(".github/")
      || /^scripts\/(?:engineering|release|notificationReleaseCloud)/.test(path)),
    "Engineering and release policy changes require scope:full.");
    const result = inspectHostingOnlyPaths(paths);
    check(result.allowed, `Hosting scope blocked: ${result.blocked.join(", ") || "no presentation changes"}`);
  } else check(scope === "full", "Declare the hosting or full scope.");
  return { base, head, scope, files: paths.length, changed: paths };
}

export async function upstreamState(cwd) {
  const capture = async (fn) => { try { return await fn(); } catch { return null; } };
  const [remote, github, production] = await Promise.all([
    capture(() => {
      const result = git(cwd, "ls-remote", "--refs", official, "refs/heads/*").trim().split("\n");
      return Object.fromEntries(result.flatMap((line) => {
        const [id, ref] = line.split("\t");
        return sha.test(id) && ref?.startsWith("refs/heads/") ? [[ref.slice(11), id]] : [];
      }));
    }),
    capture(() => JSON.parse(run(cwd, "gh", ["repo", "view", "irvingellan/cleanflow", "--json", "visibility,defaultBranchRef"]))),
    capture(async () => {
      const response = await fetch(liveMarker, { redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
      check(response.ok, "Production marker unavailable.");
      const { buildId, environment, projectId } = await response.json();
      check(sha.test(buildId) && environment === "production" && projectId === "clean-flow-prototipo", "Unexpected Production marker.");
      return buildId;
    }),
  ]);
  return { remote, canonical: remote?.main ?? null, production, visibility: github?.visibility ?? null,
    defaultBranch: github?.defaultBranchRef?.name ?? null };
}

export function diagnose(cwd, observed, proposed = []) {
  cwd = realpathSync(cwd);
  const branch = branchAt(cwd) || null;
  const head = headAt(cwd);
  const headRemote = branch ? observed.remote?.[branch] ?? null : null;
  const canonicalDelta = ancestry(cwd, observed.canonical, head);
  const liveDelta = ancestry(cwd, observed.production, observed.canonical);
  const worktrees = readWorktrees(cwd).map((row) => {
    try {
      const dirtyPaths = row.prunable || !existsSync(row.path) ? null : worktreeDelta(row.path);
      return { ...row, dirtyPaths };
    } catch { return { ...row, dirtyPaths: null }; }
  });
  const claims = readClaims(cwd);
  const here = worktrees.find((row) => row.path === cwd);
  const currentClaim = claims.find((row) => row.path === cwd && row.branch === branch);
  const claimedChanges = currentClaim && isCommit(cwd, currentClaim.canonical)
    ? trackedDelta(cwd, currentClaim.canonical, head) : [];
  const touched = [...new Set([...proposed, ...(here?.dirtyPaths ?? []), ...claimedChanges])];
  const outsideClaim = currentClaim ? touched.filter((path) =>
    !currentClaim.scopes.some((scope) => inScope(path, scope))) : [];
  const collisionScope = [...touched, ...(currentClaim?.scopes ?? [])];
  const collisions = [
    ...claims.filter((row) => row.path !== cwd).map((row) => ({ branch: row.branch, paths: row.scopes })),
    ...worktrees.filter((row) => row.path !== cwd && row.dirtyPaths?.length)
      .map((row) => ({ branch: row.branch, paths: row.dirtyPaths })),
  ].filter((row) => row.paths.some((path) => collisionScope.some((next) => scopeOverlap(next, path))))
    .map((row) => ({ branch: row.branch }));
  const staleClaims = claims.filter((claim) => !worktrees.some((row) =>
    row.path === claim.path && row.branch === claim.branch && row.dirtyPaths !== null));
  const blockers = [];
  if (!observed.canonical || observed.defaultBranch !== "main") blockers.push("CANONICAL_MAIN_UNVERIFIED");
  if (observed.visibility !== "PRIVATE") blockers.push("PRIVATE_REMOTE_UNVERIFIED");
  if (!liveDelta || liveDelta.leftOnly > 0) blockers.push("CANONICAL_MISSING_LIVE_SOURCE");
  if (!canonicalDelta || canonicalDelta.leftOnly > 0) blockers.push("HEAD_MISSING_CANONICAL");
  if (!here || here.locked || here.prunable || here.detached || here.dirtyPaths === null) blockers.push("WORKTREE_UNVERIFIED");
  if (collisionScope.length && worktrees.some((row) => row.path !== cwd && row.dirtyPaths === null)) {
    blockers.push("OTHER_WORKTREE_UNVERIFIED");
  }
  if (collisions.length) blockers.push("OVERLAPPING_TASK_SCOPE");
  if (outsideClaim.length) blockers.push("CHANGE_OUTSIDE_TASK_SCOPE");
  if (staleClaims.length) blockers.push("STALE_LOCAL_TASK_CLAIM");
  const refs = git(cwd, "for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads")
    .trim().split("\n").filter(Boolean).map((line) => line.split("\t"));
  return {
    observedAt: new Date().toISOString(), head, branch, canonical: observed.canonical, production: observed.production,
    visibility: observed.visibility, canonicalDelta, liveDelta, headRemote,
    headSync: !observed.remote ? "UNVERIFIED" : !headRemote ? "LOCAL_ONLY"
      : headRemote === head ? "MATCH" : "DIFFERENT",
    branches: { local: refs.length, remote: observed.remote ? Object.keys(observed.remote).length : null,
      localOnly: observed.remote ? refs.filter(([name]) => !observed.remote[name]).length : null,
      differentTips: observed.remote ? refs.filter(([name, id]) => observed.remote[name] && observed.remote[name] !== id).length : null },
    worktrees: worktrees.map(({ dirtyPaths, ...row }) => ({ ...row, dirtyPaths: dirtyPaths?.length ?? null })),
    claims: claims.length, staleClaims: staleClaims.length, collisions, outsideClaim: outsideClaim.length, blockers,
  };
}

export function renderCheckpoint(status, { issue }) {
  const branch = /^[A-Za-z0-9/_.-]+$/.test(status.branch ?? "") ? status.branch : "unavailable";
  return [
    "## Unified Engineering checkpoint",
    "",
    `- Observed at: ${status.observedAt}`,
    `- Issue: #${issue}`,
    `- Source branch: \`${branch}\``,
    `- Source SHA: \`${status.head}\``,
    `- GitHub main observed: \`${status.canonical || "unverified"}\``,
    `- Production Hosting marker: \`${status.production || "unverified"}\``,
    "- Verification: LOCAL diagnostic",
    `- Diagnostic blockers: ${status.blockers.join(", ") || "none"}`,
  ].join("\n");
}

export function updateCheckpoint(document, checkpoint) {
  const begin = "<!-- cleanflow-engineering:begin -->";
  const end = "<!-- cleanflow-engineering:end -->";
  const block = `${begin}\n${checkpoint}\n${end}`;
  const start = document.indexOf(begin);
  const finish = document.indexOf(end);
  check((start === -1 && finish === -1) || (start >= 0 && finish > start
    && document.lastIndexOf(begin) === start && document.lastIndexOf(end) === finish),
  "Ambiguous managed CURRENT_STATE block.");
  if (start >= 0) return document.slice(0, start) + block + document.slice(finish + end.length);
  const heading = document.indexOf("\n");
  check(heading >= 0, "CURRENT_STATE has no title.");
  return document.slice(0, heading + 1) + "\n" + block + "\n" + document.slice(heading + 1);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const { values } = parseArgs({ args, options: {
    base: { type: "string" }, head: { type: "string" }, scope: { type: "string" },
    path: { type: "string", multiple: true, default: [] }, issue: { type: "string" },
    "write-state": { type: "boolean" },
  } });
  const cwd = git(process.cwd(), "rev-parse", "--show-toplevel").trim();
  if (command === "check") {
    console.log(JSON.stringify(checkCandidate(cwd, values), null, 2));
    return;
  }
  if (command === "close") {
    check(issueId.test(values.issue), "Supply an issue number.");
    closeTask(cwd, values.issue);
    return;
  }
  check(["doctor", "claim", "checkpoint"].includes(command), "Use doctor, check, claim, close, or checkpoint.");
  check(values.path.every(validScopePath), "Invalid scope path.");
  const observed = await upstreamState(cwd);
  const status = diagnose(cwd, observed, values.path);
  if (command === "doctor") {
    console.log(JSON.stringify(status, null, 2));
    if (status.blockers.length) process.exitCode = 2;
    return;
  }
  if (command === "claim") {
    check(!status.blockers.length, `Task claim blocked: ${status.blockers.join(", ")}`);
    console.log(JSON.stringify(claimTask(cwd, { issue: values.issue, scopes: values.path, canonical: observed.canonical }), null, 2));
    return;
  }
  check(issueId.test(values.issue), "Supply an issue number.");
  const checkpoint = renderCheckpoint(status, values);
  if (values["write-state"]) {
    check(!status.blockers.length, `Current State update blocked: ${status.blockers.join(", ")}`);
    check(readClaims(cwd).some((claim) => claim.path === cwd && claim.branch === status.branch
      && claim.issue === Number(values.issue) && claim.scopes.some((scope) => scopeOverlap(scope, "docs/CURRENT_STATE.md"))),
    "Claim the CURRENT_STATE path before writing it.");
    const path = join(cwd, "docs/CURRENT_STATE.md");
    check(realpathSync(path) === path, "Current State must be a regular worktree path.");
    const temporary = path + ".tmp";
    writeFileSync(temporary, updateCheckpoint(readFileSync(path, "utf8"), checkpoint), { flag: "wx" });
    renameSync(temporary, path);
  }
  console.log(checkpoint);
}

const entryPath = process.argv[1];
if (entryPath && existsSync(entryPath)
  && realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
