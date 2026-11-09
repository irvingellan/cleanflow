import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import {
  acquireReleaseLock, assertReleaseLock, notificationProject, readNotificationProduction, releaseReleaseLock, sha256,
} from "./notificationReleaseCloud.mjs";
import { checkedWebEnvironment, validReleaseVerification, validVapidFingerprint } from "./preflightNotificationRelease.mjs";
import { inspectHostingBuild } from "./prepareHosting.mjs";
import { releaseToolchain, runReleaseSequence, verifyLiveAssets, verifyTransition } from "./releaseNotificationA.mjs";
import { releaseBSnapshot } from "./releaseNotificationB.mjs";
import { checkPushTestFunction, checkTransportRelease, readPrevious } from "./releaseNotificationBUpdate.mjs";
import { assertOfficialReleaseHead, inspectHostingOnlyPaths } from "./releaseHostingScope.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("firebase-tools/lib/apiv2");
const { convertConfig } = require("firebase-tools/lib/deploy/hosting/convertConfig");
const { Uploader } = require("firebase-tools/lib/deploy/hosting/uploader");
const { createVersion, getChannel, updateVersion } = require("firebase-tools/lib/hosting/api");
const root = resolve(import.meta.dirname, "..");
const project = notificationProject;
const api = new Client({ urlPrefix: "https://firebasehosting.googleapis.com" });
const readOptions = { timeout: 12_000, retries: 0, skipLog: { reqBody: true, resBody: true } };
const stage = { id: "hosting", only: "hosting" };
const origin = `https://${project}.web.app`;
const fullSha = /^[a-f0-9]{40}$/;
const fullHash = /^[a-f0-9]{64}$/;
const versionPattern = /^[a-f0-9]{16}$/;
const planName = "release-plan-H.json";
const manifestName = "hosting-manifest-H.json";
const assetsName = "assets-H";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const hash = (file) => sha256(readFileSync(file));
const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordered = (value) => Array.isArray(value) ? value.map(ordered)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])])) : value;
const check = (ok, message) => { if (!ok) throw new Error(message); };

export function assertStaticHostingConfig(config) {
  const keys = new Set(["public", "ignore", "headers", "rewrites", "redirects", "cleanUrls", "trailingSlash"]);
  check(config?.public === "dist" && Object.keys(config).every((key) => keys.has(key))
    && (config.rewrites || []).every((rule) => {
      if (typeof rule.destination === "string") return Object.keys(rule).every((key) => ["source", "regex", "destination"].includes(key));
      return rule.function && typeof rule.function.functionId === "string" && typeof rule.function.region === "string"
        && Object.keys(rule.function).every((key) => ["functionId", "region"].includes(key))
        && Object.keys(rule).every((key) => ["source", "regex", "function"].includes(key));
    }), "The Hosting-only workflow requires plain static Hosting without hooks, framework backends, or pinned rewrites.");
}

function assertCandidate(previousSha, sha, action) {
  check(fullSha.test(sha || ""), "Pass the exact full source SHA.");
  assertOfficialReleaseHead(root, previousSha, sha, { action });
  const paths = git("diff", "--no-renames", "--name-only", previousSha, sha).split("\n").filter(Boolean);
  const scope = inspectHostingOnlyPaths(paths);
  check(scope.allowed, `Hosting-only scope rejected: ${scope.blocked.join(", ") || "no presentation change"}.`);
  const config = JSON.parse(git("show", `${sha}:firebase.json`)).hosting;
  assertStaticHostingConfig(config);
  return config;
}

function artifact(directory, sha, expectedHash) {
  const file = join(directory, manifestName);
  const manifest = json(file);
  const manifestHash = hash(file);
  check(fullSha.test(sha || "") && manifest.buildId === sha && manifest.projectId === project
    && manifest.environment === "production" && (!expectedHash || manifestHash === expectedHash),
  "Hosting artifact binding differs.");
  const dist = join(directory, assetsName);
  const publicFiles = git("ls-tree", "-r", "--name-only", sha, "--", "public").split("\n").filter(Boolean).map((file) => file.slice(7));
  check(same(inspectHostingBuild(dist, sha, publicFiles, manifest, { removeFinderMetadata: false }), manifest.files)
    && json(join(dist, "version.json")).deploymentId === `${sha}-cleaner-push`,
  "Hosting files or Cleaner pilot build marker differ.");
  return { sha, manifest, manifestHash, dist };
}

function previousPublication(directory) {
  if (!existsSync(join(directory, planName))) {
    const previous = readPrevious(directory);
    return { ...previous, pilotRelease: previous.plan.sha };
  }
  check(!["release-plan-B.json", "release-plan-U.json"].some((file) => existsSync(join(directory, file))),
    "Previous directory has more than one release kind.");
  const planFile = join(directory, planName);
  const receiptFile = join(directory, "publish-receipt-H.json");
  const plan = json(planFile);
  const receipt = json(receiptFile);
  const planHash = hash(planFile);
  check(plan.schema === 1 && plan.kind === "HOSTING_ONLY" && plan.project === project && fullSha.test(plan.pilotRelease),
    "Previous Hosting plan must match Production and the existing pilot binding.");
  assertHostingReceipt(receipt, { sha: plan.sha, planHash, artifactHash: plan.artifactHash });
  checkTransportRelease(receipt.snapshot, plan.pilotRelease);
  checkPushTestFunction(receipt.snapshot, plan.pilotRelease, Object.hasOwn(receipt.snapshot.functions, "cleanerPushTest"));
  return { plan, receipt, planHash, receiptHash: hash(receiptFile), pilotRelease: plan.pilotRelease,
    build: artifact(directory, plan.sha, plan.artifactHash) };
}

function previousBinding(previous) {
  return { sha: previous.plan.sha, planHash: previous.planHash, receiptHash: previous.receiptHash,
    artifactHash: previous.plan.artifactHash, version: previous.receipt.snapshot.hosting.version };
}

function checkWorkerBytes(build, previous) {
  for (const name of ["firebase-messaging-sw.js", "cleaner-messaging-sw.js"]) {
    check(readFileSync(join(build.dist, name)).equals(readFileSync(join(previous.build.dist, name))),
      "Existing Firebase worker bytes must be preserved.");
  }
  const old = readFileSync(join(previous.build.dist, "sw.js"), "utf8");
  check(old.includes(previous.plan.sha) && readFileSync(join(build.dist, "sw.js"), "utf8")
    === old.replaceAll(previous.plan.sha, build.sha), "The root worker may only change its build marker.");
}

function hostingResourceId(name, resource) {
  const suffix = resource === "versions" ? "[a-f0-9]{16}" : "[0-9]+";
  const path = typeof name === "string" ? name.replace("/channels/live/", "/") : "";
  const match = path.match(new RegExp(`^(?:projects/(?:470414797064|${project}|-)/)?sites/${project}/${resource}/(${suffix})$`));
  check(match, "Hosting returned a resource outside the reviewed project, site or channel.");
  return match[1];
}

const hostingReleaseMarker = (action, planHash) => `CleanFlow Hosting only ${action} ${planHash}`;

function assertHostingReceipt(receipt, { sha, planHash, artifactHash }) {
  check(receipt?.schema === 1 && receipt.state === "COMPLETE" && receipt.action === "publish"
    && receipt.sha === sha && receipt.planHash === planHash && fullHash.test(artifactHash || "") && receipt.artifactHash === artifactHash
    && versionPattern.test(receipt.version || "") && receipt.version === receipt.snapshot?.hosting?.version,
  "Hosting requires the exact COMPLETE publication receipt.");
}

export function assertOwnedHostingPublication({ receipt, sha, planHash, artifactHash, snapshot, release }) {
  assertHostingReceipt(receipt, { sha, planHash, artifactHash });
  check(same(receipt.snapshot, snapshot)
    && hostingResourceId(release?.name, "releases") === hostingResourceId(snapshot.hosting.release, "releases")
    && hostingResourceId(release?.version?.name, "versions") === receipt.version
    && release?.message === hostingReleaseMarker("publish", planHash),
  "The live Hosting release does not belong to the sealed publication.");
}

function checkPreviousHostingOwnership(previous, live) {
  if (previous.plan.kind !== "HOSTING_ONLY") return;
  assertOwnedHostingPublication({
    receipt: previous.receipt, sha: previous.plan.sha, planHash: previous.planHash, artifactHash: previous.plan.artifactHash,
    snapshot: live.snapshot, release: live.hostingRelease,
  });
}

async function readLive(previous, expectedNotification) {
  const { report, dedicatedApp } = await readNotificationProduction("B");
  const binding = previous.plan.cleanerBinding;
  check(dedicatedApp?.projectId === project && report.dedicatedAppState === "FOUND"
    && report.fcmRegistrationApi === "ENABLED" && report.fcmDeliveryApi === "ENABLED"
    && sha256(dedicatedApp.appId || "") === binding.appIdHash && sha256(dedicatedApp.apiKey || "") === binding.apiKeyHash,
  "The existing Production Firebase Messaging binding differs.");
  const snapshot = releaseBSnapshot(report);
  checkTransportRelease(snapshot, previous.pilotRelease);
  checkPushTestFunction(snapshot, previous.pilotRelease, Object.hasOwn(previous.receipt.snapshot.functions, "cleanerPushTest"));
  const notification = { webAppCount: report.webAppCount, registration: report.fcmRegistrationApi,
    delivery: report.fcmDeliveryApi, senderHash: sha256(dedicatedApp.messagingSenderId || "") };
  check(Number.isInteger(notification.webAppCount) && (!expectedNotification || same(notification, expectedNotification)),
    "Production messaging metadata differs from the sealed baseline.");
  const channel = await getChannel("-", project, "live");
  check(hostingResourceId(channel?.release?.name, "releases") === hostingResourceId(snapshot.hosting.release, "releases")
    && hostingResourceId(channel.release.version?.name, "versions") === snapshot.hosting.version,
  "Production live channel does not match the inventory.");
  return { snapshot, lock: report.releaseLock.state, dedicatedApp, notification, hostingRelease: channel.release };
}

async function versionConfig(id) {
  check(versionPattern.test(id || ""), "Invalid Hosting version.");
  const result = await api.get(`/v1beta1/sites/${project}/versions/${id}`, readOptions);
  check(result.status === 200 && result.body.status === "FINALIZED" && result.body.config,
    "The reviewed Hosting version must be FINALIZED.");
  return ordered(result.body.config);
}

async function versionFiles(id) {
  const { status, body } = await api.get(`/v1beta1/sites/${project}/versions/${id}/files`, {
    ...readOptions, queryParams: { status: "ACTIVE", pageSize: 1000 },
  });
  check(status === 200 && !body.nextPageToken && Array.isArray(body.files), "The Hosting inventory is incomplete.");
  const inventory = new Map(body.files.map(({ path, hash }) => [path, hash]));
  check(inventory.size === body.files.length, "Duplicate paths in Hosting inventory.");
  return inventory;
}

export function hostingUploadMatches(uploaded, expected, baseline) {
  const generated = ["/__/firebase/init.js", "/__/firebase/init.json"];
  return uploaded.size === expected.size + generated.length
    && [...expected].every(([path, hash]) => uploaded.get(path) === hash)
    && generated.every((path) => /^[a-f0-9]{64}$/.test(baseline.get(path) || "") && uploaded.get(path) === baseline.get(path));
}

async function upload(build, config, rollbackVersion) {
  const workspace = mkdtempSync(join(tmpdir(), "cleanflow-hosting-only-"));
  try {
    const dist = join(workspace, "dist");
    const expected = new Map();
    const files = build.manifest.files.map(({ file, sha256: reviewedHash }) => {
      const target = join(dist, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(build.dist, file), target);
      const bytes = readFileSync(target);
      check(sha256(bytes) === reviewedHash, "Staged Hosting file differs from the reviewed manifest.");
      expected.set("/" + file, sha256(gzipSync(bytes, { level: 9 })));
      return file;
    });
    const resource = await createVersion(project, { status: "CREATED" });
    const id = hostingResourceId(resource, "versions");
    const uploader = new Uploader({ version: resource, files, public: dist, cwd: workspace, projectRoot: workspace });
    await uploader.start();
    await updateVersion(project, id, { status: "FINALIZED", config });
    check(same(await versionConfig(id), config), "Finalized candidate Hosting configuration differs.");
    const [uploaded, baseline] = await Promise.all([versionFiles(id), versionFiles(rollbackVersion)]);
    check(hostingUploadMatches(uploaded, expected, baseline), "Finalized candidate differs from the reviewed upload.");
    return id;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

async function verifyPublic(build) {
  await verifyLiveAssets(build.manifest);
  const files = new Map(build.manifest.files.map(({ file, sha256: digest }) => [file, digest]));
  await Promise.all(["/", "/agenda", "/agenda/", "/agenda?inbox=1"].map(async (route) => {
    const response = await fetch(origin + route, { redirect: "error", signal: AbortSignal.timeout(12_000) });
    check(response.status === 200 && /text\/html/i.test(response.headers.get("content-type") || "")
      && /\bno-store\b/i.test(response.headers.get("cache-control") || "")
      && (route === "/" || response.headers.get("referrer-policy") === "no-referrer")
      && sha256(Buffer.from(await response.arrayBuffer())) === files.get(route === "/" ? "index.html" : "agenda.html"),
    `Live Hosting HTML or privacy headers differ at ${route}.`);
  }));
}

export function runHostingOnlySequence({ initial, inspect, verifyLock, assertSource, switchLive, verifyAssets, journal }) {
  return runReleaseSequence({
    initial, steps: [stage], inspect, verifyLock, verifyAssets, journal,
    deploy: async () => {
      await assertSource();
      check(same(await inspect(), initial), "Production drift detected just before the Hosting switch.");
      await verifyLock();
      await switchLive();
    },
  });
}

async function seal({ directory, previous, sha, verification, envDir }) {
  const config = assertCandidate(previous.plan.sha, sha);
  check(validReleaseVerification(json(verification), sha), "A passed verification receipt for the exact candidate is required.");
  const live = await readLive(previous);
  check(live.lock === "AVAILABLE" && same(live.snapshot, previous.receipt.snapshot),
    "Production differs from the previous COMPLETE publication or the release mutex is held.");
  checkPreviousHostingOwnership(previous, live);
  await verifyPublic(previous.build);
  const baselineConfig = await versionConfig(live.snapshot.hosting.version);
  const normalized = await convertConfig({ projectId: project }, {}, { config: { ...config, site: project },
    version: `sites/${project}/versions/${live.snapshot.hosting.version}` });
  check(same(ordered(normalized), baselineConfig), "The checked-in Hosting config differs from the live baseline.");

  const { env } = checkedWebEnvironment(envDir);
  check(env.VITE_FIREBASE_API_KEY === live.dedicatedApp.apiKey
    && validVapidFingerprint(env.VITE_FIREBASE_VAPID_KEY) === previous.plan.cleanerBinding.vapidFingerprint,
  "The reviewed Production Firebase environment differs.");
  mkdirSync(directory, { mode: 0o700 });
  const dist = join(directory, assetsName);
  const workspace = mkdtempSync(join(tmpdir(), "cleanflow-hosting-source-"));
  try {
    const source = execFileSync("git", ["archive", sha], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    execFileSync("tar", ["-xf", "-", "-C", workspace], { input: source, stdio: ["pipe", "ignore", "pipe"] });
    symlinkSync(join(root, "node_modules"), join(workspace, "node_modules"), "dir");
    execFileSync(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build", "--mode", "production", "--outDir", dist], {
      cwd: workspace, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env, GITHUB_SHA: sha, VITE_CLEANFLOW_CLEANER_PUSH_PILOT: "enabled",
        VITE_FIREBASE_CLEANER_MESSAGING_APP_ID: live.dedicatedApp.appId },
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
  const publicFiles = git("ls-tree", "-r", "--name-only", sha, "--", "public").split("\n").filter(Boolean).map((file) => file.slice(7));
  const binding = { buildId: sha, projectId: project, environment: "production" };
  write(join(directory, manifestName), { ...binding, files: inspectHostingBuild(dist, sha, publicFiles, binding) });
  const build = artifact(directory, sha);
  checkWorkerBytes(build, previous);
  const receipt = json(verification);
  write(join(directory, "verification.json"), receipt);
  const plan = { schema: 1, kind: "HOSTING_ONLY", project, sha, toolchain: releaseToolchain(), artifactHash: build.manifestHash,
    previous: previousBinding(previous), cleanerBinding: previous.plan.cleanerBinding, pilotRelease: previous.pilotRelease,
    hostingConfig: baselineConfig, notification: live.notification, verificationHash: hash(join(directory, "verification.json")) };
  write(join(directory, planName), plan);
  console.log(JSON.stringify({ state: "SEALED_LOCAL_ONLY", sha, planHash: hash(join(directory, planName)) }));
}

async function execute(action, { directory, previous, sha, approval, exclusiveWindow }) {
  const planFile = join(directory, planName);
  const plan = json(planFile);
  const planHash = hash(planFile);
  check(exclusiveWindow && approval === `${action}:${planHash}`, "Execution requires the exact plan approval and an exclusive window.");
  assertCandidate(previous.plan.sha, sha, action);
  check(plan.schema === 1 && plan.kind === "HOSTING_ONLY" && plan.project === project && plan.sha === sha
    && fullHash.test(plan.artifactHash || "")
    && same(plan.toolchain, releaseToolchain()) && same(plan.previous, previousBinding(previous))
    && plan.pilotRelease === previous.pilotRelease && same(plan.cleanerBinding, previous.plan.cleanerBinding)
    && Number.isInteger(plan.notification?.webAppCount)
    && plan.verificationHash === hash(join(directory, "verification.json"))
    && validReleaseVerification(json(join(directory, "verification.json")), sha),
  "The sealed Hosting plan differs from the reviewed source, evidence or baseline.");
  const candidate = artifact(directory, sha, plan.artifactHash);
  checkWorkerBytes(candidate, previous);
  const publish = action === "publish";
  const priorReceipt = publish ? previous.receipt : json(join(directory, "publish-receipt-H.json"));
  if (!publish) {
    assertHostingReceipt(priorReceipt, { sha, planHash, artifactHash: plan.artifactHash });
    verifyTransition(previous.receipt.snapshot, priorReceipt.snapshot, stage, {});
  }
  const expected = priorReceipt.snapshot;
  const live = await readLive(previous, plan.notification);
  check(live.lock === "AVAILABLE" && same(live.snapshot, expected), "Production drift or a held release mutex blocks Hosting.");
  if (publish) checkPreviousHostingOwnership(previous, live);
  else {
    assertOwnedHostingPublication({ receipt: priorReceipt, sha, planHash, artifactHash: plan.artifactHash,
      snapshot: live.snapshot, release: live.hostingRelease });
  }
  check(same(await versionConfig(expected.hosting.version), plan.hostingConfig)
    && same(await versionConfig(plan.previous.version), plan.hostingConfig), "Live or rollback Hosting config differs.");
  await verifyPublic(publish ? previous.build : candidate);

  const file = join(directory, `${action}-receipt-H.json`);
  const target = publish ? candidate : previous.build;
  const marker = hostingReleaseMarker(action, planHash);
  let lock, releaseId, switched = false, completed = false, version = plan.previous.version;
  function record(state, step, snapshot, create = false) {
    const data = { schema: 1, action, sha: target.sha, state, step, snapshot, planHash,
      artifactHash: target.manifestHash, lockUpdateTime: lock, version };
    if (create) write(file, data);
    else { write(`${file}.tmp`, data); renameSync(`${file}.tmp`, file); }
  }
  record("STARTING", null, expected, true);
  try {
    lock = await acquireReleaseLock({ action: `hosting-only-${action}`, sha, planHash });
    record("STAGING", null, expected);
    const inspect = async () => (await readLive(previous, plan.notification)).snapshot;
    const verifyLock = () => assertReleaseLock(lock);
    check(same(await inspect(), expected), "Production drift before staging Hosting.");
    await verifyLock();
    if (publish) version = await upload(candidate, plan.hostingConfig, plan.previous.version);
    record("STAGED", null, expected);
    const snapshot = await runHostingOnlySequence({
      initial: expected, inspect, verifyLock,
      assertSource: () => assertCandidate(previous.plan.sha, sha, action),
      async switchLive() {
        switched = true;
        const response = await api.post(`/v1beta1/projects/-/sites/${project}/channels/live/releases`, { message: marker }, {
          ...readOptions, queryParams: { versionName: `sites/${project}/versions/${version}` },
        });
        check(response.status === 200 && hostingResourceId(response.body.version?.name, "versions") === version
          && response.body.message === marker, "Hosting switch could not be attributed to this release.");
        releaseId = hostingResourceId(response.body.name, "releases");
      },
      async verifyAssets() {
        const { hosting } = await inspect();
        check(hosting.version === version && hostingResourceId(hosting.release, "releases") === releaseId
          && same(await versionConfig(version), plan.hostingConfig),
        "Live release, version or Hosting configuration differs after the switch.");
        await verifyPublic(target);
      },
      journal: record,
    });
    record("COMPLETE", null, snapshot);
    completed = true;
  } catch (error) {
    if (switched) throw new Error("Hosting switch requires reconciliation. The release mutex remains held.", { cause: error });
    throw error;
  } finally {
    if (lock && (completed || !switched)) await releaseReleaseLock(lock);
  }
  console.log(JSON.stringify({ state: "COMPLETE", action, sha: target.sha, planHash, version }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...args] = process.argv.slice(2);
    const { values } = parseArgs({ args, options: {
      sha: { type: "string" }, dir: { type: "string" }, "previous-dir": { type: "string" }, verification: { type: "string" },
      "env-dir": { type: "string" }, approve: { type: "string" }, "exclusive-window": { type: "boolean" },
    } });
    check(["seal", "publish", "rollback"].includes(action) && values.dir && values["previous-dir"] && fullSha.test(values.sha || ""),
      "Use seal|publish|rollback with --sha, --dir and --previous-dir.");
    check(realpathSync(process.cwd()) === root && process.versions.node.split(".")[0] === "22", "Use the exact checkout on Node 22.");
    check(!Object.keys(process.env).some((key) => process.env[key] && (
      ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_CONFIG",
        "GOOGLE_CLOUD_QUOTA_PROJECT", "CLOUDSDK_AUTH_ACCESS_TOKEN", "FIRESTORE_EMULATOR_HOST", "FUNCTIONS_EMULATOR"].includes(key)
      || /^FIREBASE_.*(?:_URL|_ORIGIN|_HOST)$/.test(key)
    )), "Use the verified CLI account without credential, endpoint or emulator overrides.");
    const directory = resolve(values.dir);
    check(relative(root, directory).startsWith(".tmp/") && realpathSync(resolve(directory, "..")) === resolve(directory, ".."),
      "Use a real review directory under .tmp.");
    const previous = previousPublication(realpathSync(resolve(values["previous-dir"])));
    if (action === "seal") {
      check(values["env-dir"] && values.verification && !existsSync(directory), "Seal needs a fresh directory, --env-dir and --verification.");
      await seal({ directory, previous, sha: values.sha, verification: values.verification, envDir: values["env-dir"] });
    } else {
      check(realpathSync(directory) === directory && lstatSync(directory).isDirectory() && (lstatSync(directory).mode & 0o077) === 0,
        "Use the private sealed review directory.");
      await execute(action, { directory, previous, sha: values.sha, approval: values.approve, exclusiveWindow: values["exclusive-window"] });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
