import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectHostingBuild } from "./prepareHosting.mjs";
import { prepareStartupHostingRetention } from "./prepareStartupHostingRetention.mjs";

const environment = "production";
const projectId = "clean-flow-prototipo";
const candidateSha = "a".repeat(40);
const baselineSha = "b".repeat(40);
const olderSha = "c".repeat(40);
const baselineVersion = "b".repeat(16);
const publicFiles = ["onesignal/OneSignalSDKWorker.js"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function writeJson(file, data) {
  const bytes = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(file, bytes);
  return hash(bytes);
}

function build(directory, sha, asset, { cleanerWorker = "same-cleaner", dashboardChunk } = {}) {
  const dist = join(directory, "assets-U");
  mkdirSync(join(dist, "assets"), { recursive: true });
  mkdirSync(join(dist, "onesignal"));
  const body = `<script type="module" src="/assets/main-${asset}.js"></script><link rel="stylesheet" href="/assets/main-${asset}.css">`;
  const files = {
    "index.html": `<!-- ${sha} manager -->${body}`,
    "agenda.html": `<!-- ${sha} agenda -->${body}`,
    "sw.js": `const buildId = "${sha}-cleaner-push";`,
    "firebase-messaging-sw.js": "same-manager",
    "cleaner-messaging-sw.js": cleanerWorker,
    "onesignal/OneSignalSDKWorker.js": "same-onesignal",
    [`assets/main-${asset}.js`]: dashboardChunk
      ? `export default () => import("./${dashboardChunk}");`
      : `export default "${sha}";`,
    [`assets/main-${asset}.css`]: `/* ${sha} */`,
  };
  if (dashboardChunk) files[`assets/${dashboardChunk}`] = `export default "${sha}";`;
  for (const [file, contents] of Object.entries(files)) writeFileSync(join(dist, file), contents);
  writeJson(join(dist, "version.json"), { buildId: sha, environment, projectId, deploymentId: `${sha}-cleaner-push` });
  const manifest = join(directory, "hosting-manifest-U.json");
  const artifactHash = writeJson(manifest, {
    buildId: sha, environment, projectId, files: inspectHostingBuild(dist, sha, publicFiles),
  });
  return { dist, manifest, sha, artifactHash };
}

function publication(dir, built, version, previous) {
  const { sha, artifactHash } = built;
  const planHash = writeJson(join(dir, "release-plan-U.json"), {
    sha, artifactHash, previous, project: projectId, kind: "RELEASE_B_UPDATE",
  });
  const receiptHash = writeJson(join(dir, "publish-receipt-U.json"), {
    state: "COMPLETE", action: "publish", sha, planHash, artifactHash, snapshot: { hosting: { version } },
  });
  return { sha, planHash, receiptHash, artifactHash };
}

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "cleanflow-retention-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baselineReview = join(root, "baseline");
  const olderReview = join(root, "older");
  const older = build(olderReview, olderSha, "older");
  const olderBinding = publication(olderReview, older, "c".repeat(16));
  const baseline = build(baselineReview, baselineSha, "baseline", { dashboardChunk: options.baselineChunk });
  publication(baselineReview, baseline, baselineVersion, olderBinding);
  const candidate = build(join(root, "candidate"), candidateSha, options.collision ? "baseline" : "candidate", options);
  const args = { candidateDist: candidate.dist, candidateManifest: candidate.manifest, candidateSha,
    baselineReview, baselineVersion, olderReview, out: join(root, "prepared") };
  return { args, candidate, baseline, older, prepare: () => prepareStartupHostingRetention(args, () => publicFiles) };
}

test("preserves both sets of entry files and adds only hashed assets to each variant", (t) => {
  const { args, candidate, baseline, prepare } = fixture(t);
  const result = prepare();
  assert.equal(result.state, "RETENTION_PREPARED_LOCAL_ONLY");
  assert.equal(result.forwardRetained, 4);
  assert.equal(result.rollbackRetained, 4);
  const manifestBytes = readFileSync(join(args.out, "retention-manifest.json"));
  assert.equal(hash(manifestBytes), result.manifestHash);
  const manifest = JSON.parse(manifestBytes);
  for (const [variant, primary, secondary] of [["forward", candidate, baseline], ["rollback", baseline, candidate]]) {
    for (const file of ["index.html", "agenda.html", "sw.js", "version.json"]) {
      assert.deepEqual(readFileSync(join(args.out, variant, file)), readFileSync(join(primary.dist, file)));
    }
    assert.deepEqual(manifest[variant].retainedAssets.map(({ fromBuild }) => fromBuild).sort(),
      [secondary.sha, secondary.sha, olderSha, olderSha].sort());
    for (const { file, sha256 } of manifest[variant].files) {
      assert.equal(hash(readFileSync(join(args.out, variant, file))), sha256);
    }
  }
});

test("rejects the same asset path with different bytes before creating output", (t) => {
  const { args, prepare } = fixture(t, { collision: true });
  assert.throws(prepare, /asset path refers to different bytes/);
  assert.equal(existsSync(args.out), false);
});

test("retains the Dashboard chunk required by the other release's entry in each direction", (t) => {
  const baselineChunk = "dashboardReads-Baseline.js";
  const dashboardChunk = "dashboardReads-NextHash.js";
  const { args, prepare } = fixture(t, { baselineChunk, dashboardChunk });
  prepare();
  const manifest = JSON.parse(readFileSync(join(args.out, "retention-manifest.json")));
  assert.equal(manifest.forward.retainedAssets.find(({ file }) => file === `assets/${baselineChunk}`)?.fromBuild, baselineSha);
  assert.equal(manifest.rollback.retainedAssets.find(({ file }) => file === `assets/${dashboardChunk}`)?.fromBuild, candidateSha);
  for (const variant of ["forward", "rollback"]) {
    assert.ok(existsSync(join(args.out, variant, "assets", baselineChunk)));
    assert.ok(existsSync(join(args.out, variant, "assets", dashboardChunk)));
  }
});

test("rejects changed reviewed bytes and an altered prior release receipt", (t) => {
  const { args, older, prepare } = fixture(t);
  const receiptFile = join(args.olderReview, "publish-receipt-U.json");
  const receipt = JSON.parse(readFileSync(receiptFile));
  receipt.artifactHash = "0".repeat(64);
  writeJson(receiptFile, receipt);
  assert.throws(prepare, /COMPLETE release receipt/);
  writeFileSync(join(older.dist, "assets/main-older.js"), "changed");
  assert.throws(prepare, /file SHA differs/);
  assert.equal(existsSync(args.out), false);
});

test("rejects a change to a production notification worker", (t) => {
  const { args, prepare } = fixture(t, { cleanerWorker: "changed" });
  assert.throws(prepare, /notification worker differs/);
  assert.equal(existsSync(args.out), false);
});

test("rejects an existing output and preserves its contents", (t) => {
  const { args, prepare } = fixture(t);
  mkdirSync(args.out);
  writeFileSync(join(args.out, "keep"), "existing");
  assert.throws(prepare, { code: "EEXIST" });
  assert.equal(readFileSync(join(args.out, "keep"), "utf8"), "existing");
});
