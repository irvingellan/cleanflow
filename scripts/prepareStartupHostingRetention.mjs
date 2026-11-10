import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { hostingBundleAsset, inspectHostingBuild } from "./prepareHosting.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const projectId = "clean-flow-prototipo";
const environment = "production";
const gitSha = /^[a-f0-9]{40}$/;
const hostingVersion = /^[a-f0-9]{16}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function check(condition, reason) {
  if (!condition) throw new Error(reason);
}

function regularBytes(file) {
  check(lstatSync(file).isFile(), "Expected a regular source file.");
  return readFileSync(file);
}

function readJson(file) {
  const bytes = regularBytes(file);
  return { data: JSON.parse(bytes), sha256: hash(bytes) };
}

function publicFilesAt(sha) {
  return execFileSync("git", ["ls-tree", "-r", "--name-only", sha, "--", "public"], { cwd: root, encoding: "utf8" })
    .trim().split("\n").filter(Boolean).map((file) => file.slice(7));
}

function verifyEntries(dist, files) {
  const paths = new Set(files.map(({ file }) => file));
  for (const entry of ["index.html", "agenda.html"]) {
    const html = regularBytes(join(dist, entry)).toString("utf8");
    const refs = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']\/(assets\/[\w-]+\.(?:js|css))["'][^>]*>/gi)]
      .map(([, file]) => file);
    check(refs.some((file) => file.endsWith(".js")) && refs.some((file) => file.endsWith(".css")) &&
      refs.every((file) => hostingBundleAsset.test(file) && paths.has(file)), "An entry points outside its reviewed JS and CSS.");
  }
}

function readBuild(dist, manifestFile, sha, listPublicFiles) {
  check(gitSha.test(sha) && lstatSync(dist).isDirectory(), "Use an exact build SHA and a real distribution directory.");
  const { data: manifest, sha256: manifestHash } = readJson(manifestFile);
  check(manifest.buildId === sha && manifest.projectId === projectId && manifest.environment === environment,
    "Unexpected Hosting manifest binding.");
  const publicFiles = listPublicFiles(sha);
  const actual = inspectHostingBuild(dist, sha, publicFiles, manifest, { removeFinderMetadata: false });
  check(same(actual, manifest.files), "Distribution inventory or file SHA differs from its manifest.");
  verifyEntries(dist, actual);
  const { data: marker } = readJson(join(dist, "version.json"));
  check(marker.deploymentId === `${sha}-cleaner-push`, "Expected the Production cleaner push build variant.");
  return { dist, sha, manifestHash, files: actual, publicFiles };
}

function readPublishedReview(dir, listPublicFiles) {
  const { data: plan, sha256: planHash } = readJson(join(dir, "release-plan-U.json"));
  const { data: receipt, sha256: receiptHash } = readJson(join(dir, "publish-receipt-U.json"));
  const build = readBuild(join(dir, "assets-U"), join(dir, "hosting-manifest-U.json"), plan.sha, listPublicFiles);
  const version = receipt.snapshot?.hosting?.version;
  check(plan.kind === "RELEASE_B_UPDATE" && plan.project === projectId &&
    receipt.action === "publish" && receipt.state === "COMPLETE" && receipt.sha === plan.sha &&
    receipt.planHash === planHash && receipt.artifactHash === plan.artifactHash && plan.artifactHash === build.manifestHash &&
    typeof version === "string" && hostingVersion.test(version), "Previous publication does not match its COMPLETE release receipt.");
  const binding = { sha: plan.sha, planHash, receiptHash, artifactHash: build.manifestHash };
  return { ...build, binding, version, previous: plan.previous };
}

function isRetainedAsset(file) {
  // inspectHostingBuild already validated the allowlist and digest of any declared fonts.
  return hostingBundleAsset.test(file) || /^assets\/inter-[\w-]+\.woff2$/.test(file);
}

function collectFiles(primary, preceding) {
  const combined = new Map(primary.files.map((entry) => [entry.file, { ...entry, source: primary }]));
  for (const build of preceding) {
    for (const entry of build.files.filter(({ file }) => isRetainedAsset(file))) {
      const current = combined.get(entry.file);
      check(!current || current.sha256 === entry.sha256, "A hashed asset path refers to different bytes in the reviewed releases.");
      if (!current) combined.set(entry.file, { ...entry, source: build });
    }
  }
  return [...combined.values()].sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0);
}

function writeVariant(dir, primary, entries) {
  for (const { file, sha256, source } of entries) {
    const bytes = regularBytes(join(source.dist, file));
    check(hash(bytes) === sha256, "A source file changed during preparation.");
    const target = join(dir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: "wx" });
  }
  const files = inspectHostingBuild(dir, primary.sha, primary.publicFiles,
    { environment, projectId }, { removeFinderMetadata: false });
  check(same(files, entries.map(({ file, sha256 }) => ({ file, sha256 }))), "The prepared inventory does not match the reviewed bytes.");
  verifyEntries(dir, files);
  return {
    buildId: primary.sha, environment, projectId, files,
    retainedAssets: entries.filter(({ source }) => source !== primary)
      .map(({ file, sha256, source }) => ({ file, sha256, fromBuild: source.sha })),
  };
}

export function prepareStartupHostingRetention(options, listPublicFiles = publicFilesAt) {
  const candidate = readBuild(options.candidateDist, options.candidateManifest, options.candidateSha, listPublicFiles);
  const baseline = readPublishedReview(options.baselineReview, listPublicFiles);
  check(baseline.version === options.baselineVersion && baseline.sha !== candidate.sha,
    "The candidate and exact rollback baseline must be distinct.");
  for (const worker of ["firebase-messaging-sw.js", "cleaner-messaging-sw.js", "onesignal/OneSignalSDKWorker.js"]) {
    const digest = baseline.files.find(({ file }) => file === worker)?.sha256;
    check(digest && candidate.files.find(({ file }) => file === worker)?.sha256 === digest,
      "A notification worker differs from the exact rollback baseline.");
  }
  const earlier = options.olderReview ? [readPublishedReview(options.olderReview, listPublicFiles)] : [];
  if (earlier.length) check(same(baseline.previous, earlier[0].binding), "The older publication is not the predecessor sealed by the baseline.");
  const forward = collectFiles(candidate, [baseline, ...earlier]);
  const rollback = collectFiles(baseline, [candidate, ...earlier]);
  const out = resolve(options.out);
  mkdirSync(out, { mode: 0o700 });
  try {
    const result = {
      schema: 1,
      candidate: { sha: candidate.sha, manifestHash: candidate.manifestHash },
      baseline: { ...baseline.binding, hostingVersion: baseline.version },
      older: earlier.map(({ binding, version }) => ({ ...binding, hostingVersion: version })),
      forward: writeVariant(join(out, "forward"), candidate, forward),
      rollback: writeVariant(join(out, "rollback"), baseline, rollback),
    };
    const manifest = Buffer.from(JSON.stringify(result, null, 2) + "\n");
    writeFileSync(join(out, "retention-manifest.json"), manifest, { mode: 0o600, flag: "wx" });
    return {
      state: "RETENTION_PREPARED_LOCAL_ONLY", manifestHash: hash(manifest),
      forwardFiles: result.forward.files.length, rollbackFiles: result.rollback.files.length,
      forwardRetained: result.forward.retainedAssets.length, rollbackRetained: result.rollback.retainedAssets.length,
    };
  } catch (error) {
    rmSync(out, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const required = ["candidate-dist", "candidate-manifest", "candidate-sha", "baseline-review", "baseline-version", "out"];
    const { values } = parseArgs({
      options: Object.fromEntries([...required, "older-review"].map((key) => [key, { type: "string" }])),
    });
    check(required.every((key) => values[key]), "Supply the candidate, baseline, and fresh output directory arguments.");
    const options = Object.fromEntries(Object.entries(values)
      .map(([key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
    console.log(JSON.stringify(prepareStartupHostingRetention(options)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
