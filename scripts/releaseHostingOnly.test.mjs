import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { notificationProject } from "./notificationReleaseCloud.mjs";
import { assertOwnedHostingPublication, assertStaticHostingConfig, hostingUploadMatches, runHostingOnlySequence } from "./releaseHostingOnly.mjs";
import { assertOfficialReleaseHead, inspectHostingOnlyPaths, validateForwardRelease } from "./releaseHostingScope.mjs";

const before = "a".repeat(40);
const head = "b".repeat(40);
const older = "c".repeat(40);
const prior = {
  hosting: { version: "version-a", release: "release-a" },
  functions: { notifyCleanerInboxEvent: { revision: "r1", hash: "config1", cleanerPushPilotRelease: before } },
  rules: { hash: "rules1" },
  schedules: [{ hash: "schedule1" }],
};
const candidate = { ...prior, hosting: { version: "version-b", release: "release-b" } };

test("admit presentation plus exact engineering evidence, fail closed on configuration and dependencies", () => {
  const css = "src/features/cleaners/cleaners.css";
  assert.equal(inspectHostingOnlyPaths([css, "src/App.jsx", ".github/workflows/engineering.yml",
    "scripts/releaseHostingOnly.mjs", "docs/CURRENT_STATE.md", "scripts/releaseHostingOnly.test.mjs"]).allowed, true);
  assert.equal(inspectHostingOnlyPaths([]).allowed, false);
  assert.equal(inspectHostingOnlyPaths(["src/App.test.jsx", "docs/CURRENT_STATE.md"]).allowed, false);
  for (const blocked of ["functions/src/index.js", "functions/src/index.test.js", "functions/package-lock.json",
    "firestore.rules", "storage.rules", "firestore.indexes.json", "firebase.json", ".firebaserc", "vite.config.js",
    "package.json", "package-lock.json", ".env.production", "public/sw.js", "public/agenda.webmanifest",
    "src/services/firebase/client.js", "src/environment.js", ".github/workflows/unreviewed.yml"]) {
    const result = inspectHostingOnlyPaths([css, blocked]);
    assert.equal(result.allowed, false, blocked);
    assert.deepEqual(result.blocked, [blocked]);
  }
});

test("a release needs the exact fresh official SHA and a strict forward ancestry", () => {
  const reviewed = { baselineSha: before, head, officialHead: head, isAncestor: (a, b) => a === before && b === head };
  assert.doesNotThrow(() => validateForwardRelease(reviewed));
  assert.throws(() => validateForwardRelease({ ...reviewed, officialHead: older }), /official origin\/main/);
  assert.throws(() => validateForwardRelease({ ...reviewed, head: "abc123" }), /official origin\/main/);
  assert.throws(() => validateForwardRelease({ ...reviewed, baselineSha: head }), /strictly ahead/);
  assert.throws(() => validateForwardRelease({ ...reviewed, isAncestor: () => false }), /strictly ahead/);
});

test("rollback uses the clean sealed commit even when main has advanced", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "cleanflow-sealed-git-"));
  const checkout = join(fixture, "checkout");
  const bin = join(fixture, "bin");
  mkdirSync(checkout);
  mkdirSync(bin);
  const path = process.env.PATH;
  process.env.PATH = bin + delimiter + path;
  t.after(() => {
    process.env.PATH = path;
    rmSync(fixture, { recursive: true, force: true });
  });
  const gh = (visibility, branch) => writeFileSync(join(bin, "gh"),
    `#!/bin/sh
printf '%s\n' '${JSON.stringify({ visibility, defaultBranchRef: { name: branch } })}'
`, { mode: 0o700 });
  gh("PUBLIC", "main");
  const git = (...args) => execFileSync("git", args, { cwd: checkout, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (message) => git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", message);
  git("init", "-qb", "main");
  git("config", "protocol.allow", "never");
  git("config", "protocol.https.allow", "never");
  git("remote", "add", "origin", "https://github.com/irvingellan/cleanflow.git");
  commit("prior");
  const baseline = git("rev-parse", "HEAD");
  commit("sealed");
  const sealed = git("rev-parse", "HEAD");
  commit("later");
  git("update-ref", "refs/remotes/origin/main", "HEAD");

  const rollback = () => assertOfficialReleaseHead(checkout, baseline, sealed, { action: "rollback" });
  assert.throws(rollback, /clean official/);
  git("checkout", "--detach", sealed);
  assert.notEqual(git("rev-parse", "origin/main"), sealed);
  assert.doesNotThrow(rollback);
  const publish = () => assertOfficialReleaseHead(checkout, baseline, sealed);
  assert.throws(publish, /PRIVATE/);
  gh("PRIVATE", "other");
  assert.throws(publish, /official main/);
  gh("PRIVATE", "main");
  assert.throws(publish, /ls-remote/);

  const dirty = join(checkout, "dirty");
  writeFileSync(dirty, "changed");
  assert.throws(rollback, /clean official/);
  rmSync(dirty);
  git("remote", "set-url", "origin", "https://example.invalid/other.git");
  assert.throws(rollback, /clean official/);
});

test("rollback verifies the exact live Hosting release, version and publication marker", () => {
  const planHash = "d".repeat(64);
  const artifactHash = "e".repeat(64);
  const version = "0".repeat(16);
  const releaseName = `sites/${notificationProject}/releases/123456`;
  const snapshot = { ...candidate, hosting: { release: releaseName, version } };
  const receipt = { schema: 1, state: "COMPLETE", action: "publish", sha: head, planHash, artifactHash, snapshot, version };
  const release = {
    name: releaseName, version: { name: `sites/${notificationProject}/versions/${version}` },
    message: `CleanFlow Hosting only publish ${planHash}`,
  };
  const reviewed = { receipt, sha: head, planHash, artifactHash, snapshot, release };
  assert.doesNotThrow(() => assertOwnedHostingPublication(reviewed));
  assert.throws(() => assertOwnedHostingPublication({ ...reviewed, receipt: { ...receipt, state: "DEPLOYING" } }), /COMPLETE/);
  assert.throws(() => assertOwnedHostingPublication({ ...reviewed, receipt: { ...receipt, artifactHash: planHash } }), /COMPLETE/);
  assert.throws(() => assertOwnedHostingPublication({ ...reviewed, release: { ...release, message: "different" } }), /sealed publication/);
  assert.throws(() => assertOwnedHostingPublication({ ...reviewed, release: { ...release, name: `sites/${notificationProject}/releases/123457` } }),
    /sealed publication/);
  assert.throws(() => assertOwnedHostingPublication({ ...reviewed, snapshot: { ...snapshot, functions: {} } }), /sealed publication/);
});

test("Hosting config refuses hooks, Cloud Run, frameworks, and pinned Functions", () => {
  const staticHosting = { public: "dist", rewrites: [
    { source: "/api/public-checklist", function: { functionId: "publicChecklist", region: "us-central1" } },
    { source: "**", destination: "/index.html" },
  ] };
  assert.doesNotThrow(() => assertStaticHostingConfig(staticHosting));
  for (const config of [
    { ...staticHosting, predeploy: "firebase deploy" },
    { ...staticHosting, source: "." },
    { ...staticHosting, rewrites: [{ source: "/api", run: { serviceId: "x", pinTag: true } }] },
    { ...staticHosting, rewrites: [{ source: "/api", function: { functionId: "x", region: "us-central1", pinTag: true } }] },
  ]) assert.throws(() => assertStaticHostingConfig(config), /plain static Hosting/);
});

test("verify uploaded content and exactly the two unchanged Firebase-generated assets", () => {
  const baseline = new Map([["/__/firebase/init.js", "a".repeat(64)], ["/__/firebase/init.json", "b".repeat(64)]]);
  const expected = new Map([["/index.html", "c".repeat(64)]]);
  const uploaded = new Map([...baseline, ...expected]);
  assert.equal(hostingUploadMatches(uploaded, expected, baseline), true);
  assert.equal(hostingUploadMatches(new Map([...uploaded, ["/extra", "d".repeat(64)]]), expected, baseline), false);
  uploaded.set("/__/firebase/init.json", "d".repeat(64));
  assert.equal(hostingUploadMatches(uploaded, expected, baseline), false);
});

function harness(overrides = {}) {
  let current = prior;
  const events = [];
  return {
    events,
    options: {
      initial: prior, inspect: async () => current, verifyLock: async () => events.push("lock"),
      assertSource: async () => events.push("source"),
      switchLive: async () => { events.push("switch"); current = overrides.after ?? candidate; },
      verifyAssets: async () => events.push("assets"),
      journal: async (state) => events.push(state),
      ...overrides.options,
    },
  };
}

test("the sequence switches Hosting only and rechecks source and mutex immediately beforehand", async () => {
  const run = harness();
  assert.deepEqual(await runHostingOnlySequence(run.options), candidate);
  assert.deepEqual(run.events, ["lock", "DEPLOYING", "source", "lock", "switch", "lock", "assets", "lock", "VERIFIED"]);
});

test("drift or a stale SHA stops before the switch", async () => {
  let reads = 0;
  const changed = { ...prior, functions: { notifyCleanerInboxEvent: { revision: "r2" } } };
  const drift = harness({ options: { inspect: async () => (++reads === 1 ? prior : changed) } });
  await assert.rejects(runHostingOnlySequence(drift.options), /drift.*just before/);
  assert.ok(!drift.events.includes("switch"));
  const stale = harness({ options: { assertSource: () => { throw new Error("Stale official HEAD"); } } });
  await assert.rejects(runHostingOnlySequence(stale.options), /Stale official HEAD/);
  assert.ok(!stale.events.includes("switch"));
});

test("a new Function revision, changed pilot binding, Rules, or schedule prevents completion", async () => {
  for (const after of [
    { ...candidate, functions: { notifyCleanerInboxEvent: { ...prior.functions.notifyCleanerInboxEvent, revision: "r2" } } },
    { ...candidate, functions: { notifyCleanerInboxEvent: { ...prior.functions.notifyCleanerInboxEvent, cleanerPushPilotRelease: head } } },
    { ...candidate, rules: { hash: "rules2" } },
    { ...candidate, schedules: [{ hash: "schedule2" }] },
  ]) {
    const run = harness({ after });
    await assert.rejects(runHostingOnlySequence(run.options), /Unexpected Functions|Concurrent/);
    assert.ok(!run.events.includes("VERIFIED"));
  }
});

test("an ambiguous Hosting switch is attempted once and never journals VERIFIED", async () => {
  let attempts = 0;
  const run = harness({ options: { switchLive: async () => { attempts++; throw new Error("Unknown response"); } } });
  await assert.rejects(runHostingOnlySequence(run.options), /Unknown response/);
  assert.equal(attempts, 1);
  assert.ok(run.events.includes("DEPLOYING"));
  assert.ok(!run.events.includes("VERIFIED"));
});
