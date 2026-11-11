import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkCandidate, claimTask, closeTask, diagnose, renderCheckpoint, updateCheckpoint } from "./engineering.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function file(cwd, path, content) {
  const target = join(cwd, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function commit(cwd, subject) {
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", subject);
  return git(cwd, "rev-parse", "HEAD");
}
function scenario() {
  const root = mkdtempSync(join(tmpdir(), "cleanflow-engineering-simulation-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "CleanFlow fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  file(repo, "src/index.css", ":root { color: black; }\n");
  file(repo, "functions/index.js", "export const fixture = true;\n");
  file(repo, "firestore.rules", "rules_version = '2';\n");
  file(repo, "storage.rules", "rules_version = '2';\n");
  file(repo, "firebase.json", '{"hosting":{"public":"dist"}}\n');
  const base = commit(repo, "synthetic canonical base");
  const claude = join(root, "visual-worktree");
  const codex = join(root, "server-worktree");
  git(repo, "worktree", "add", "-b", "claude/issue-101-colors", claude, base);
  git(repo, "worktree", "add", "-b", "codex/issue-102-server", codex, base);
  return { root, repo, claude, codex, base };
}

test("parallel Claude and Codex tasks keep exclusive paths and isolate uncommitted edits", () => {
  const { repo, claude, codex, base } = scenario();
  const observed = { canonical: base, production: base, visibility: "PUBLIC", defaultBranch: "main", remote: { main: base } };
  claimTask(claude, { issue: "101", scopes: ["src"], canonical: base });
  assert.throws(() => claimTask(codex, { issue: "102", scopes: ["Src/INDEX.css"], canonical: base }), /already owns/);
  assert.throws(() => claimTask(codex, { issue: "102", scopes: [".Git/config"], canonical: base }), /repository-relative/);
  claimTask(codex, { issue: "102", scopes: ["functions"], canonical: base });
  file(claude, "src/index.css", ":root { color: blue; }\n");
  file(codex, "functions/index.js", "export const fixture = false;\n");
  assert.equal(readFileSync(join(codex, "src/index.css"), "utf8"), ":root { color: black; }\n");
  assert.equal(readFileSync(join(claude, "functions/index.js"), "utf8"), "export const fixture = true;\n");
  const cleanPlan = diagnose(claude, observed);
  assert.deepEqual(cleanPlan.blockers, []);
  assert.equal(cleanPlan.worktrees.filter((row) => row.dirtyPaths > 0).length, 2);
  const overlap = diagnose(claude, observed, ["functions/index.js"]);
  assert.ok(overlap.blockers.includes("OVERLAPPING_TASK_SCOPE"));
  assert.ok(overlap.blockers.includes("CHANGE_OUTSIDE_TASK_SCOPE"));
  assert.throws(() => closeTask(claude, "102"), /does not own/);
  closeTask(claude, "101");
  assert.equal(diagnose(repo, observed).claims, 1);
});

test("visual commit leaves Functions, Rules and Firebase configuration identical", () => {
  const { repo, claude, codex, base } = scenario();
  file(claude, "src/index.css", ":root { color: blue; }\n");
  const visual = commit(claude, "isolated visual update");
  assert.deepEqual(checkCandidate(repo, { base, head: visual, scope: "hosting" }).changed, ["src/index.css"]);
  for (const path of ["functions/index.js", "firestore.rules", "storage.rules", "firebase.json"]) {
    assert.equal(git(repo, "rev-parse", `${base}:${path}`), git(repo, "rev-parse", `${visual}:${path}`));
  }
  file(codex, "functions/index.js", "export const fixture = false;\n");
  const backend = commit(codex, "isolated backend update");
  assert.throws(() => checkCandidate(repo, { base, head: backend, scope: "hosting" }), /Hosting scope blocked/);
  assert.doesNotThrow(() => checkCandidate(repo, { base, head: backend, scope: "full" }));
  assert.throws(() => checkCandidate(repo, { base: visual, head: backend, scope: "full" }), /exact integration base/);
  assert.throws(() => checkCandidate(repo, { base: visual, head: base, scope: "hosting" }), /exact integration base/);
  file(claude, "src/index.css", ":root { color: red; }\n");
  file(claude, ".github/workflows/engineering.yml", "name: synthetic policy update\n");
  const selfEditing = commit(claude, "visual update modifies its own CI");
  assert.throws(() => checkCandidate(repo, { base: visual, head: selfEditing, scope: "hosting" }), /scope:full/);
});

test("doctor distinguishes a public, stale canonical ref from the published commit", () => {
  const { repo, claude, base } = scenario();
  file(claude, "src/index.css", ":root { color: blue; }\n");
  const live = commit(claude, "published fixture");
  const status = diagnose(repo, { canonical: base, production: live, visibility: "PUBLIC", defaultBranch: "main", remote: { main: base } });
  assert.deepEqual(status.liveDelta, { leftOnly: 1, rightOnly: 0 });
  assert.equal(status.visibility, "PUBLIC");
  assert.ok(status.blockers.includes("CANONICAL_MISSING_LIVE_SOURCE"));
  const managed = updateCheckpoint("# Current State\n\nKeep original evidence.\n", renderCheckpoint(status, { issue: "83", verification: "LOCAL" }));
  const revised = updateCheckpoint(managed, "## Replaced checkpoint");
  assert.ok(revised.includes("Keep original evidence."));
  assert.equal(revised.match(/cleanflow-engineering:begin/g)?.length, 1);
  assert.throws(() => updateCheckpoint(managed + "\n<!-- cleanflow-engineering:end -->", "invalid"), /Ambiguous/);
});

test("a symlinked CLI path still executes the committed scope policy", (context) => {
  const { root, repo, claude, codex, base } = scenario();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = join(root, "linked-engineering.mjs");
  symlinkSync(fileURLToPath(new URL("./engineering.mjs", import.meta.url)), cli);
  const run = (head) => execFileSync(process.execPath, [cli, "check", "--base", base, "--head", head, "--scope", "hosting"], {
    cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  file(claude, "src/index.css", ":root { color: blue; }\n");
  assert.deepEqual(JSON.parse(run(commit(claude, "visual fixture"))).changed, ["src/index.css"]);
  file(codex, "functions/index.js", "export const fixture = false;\n");
  assert.throws(() => run(commit(codex, "backend fixture")), /Hosting scope blocked/);
});
