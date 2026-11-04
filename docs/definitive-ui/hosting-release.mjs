import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { loadEnv } from "vite";
import {
  acquireReleaseLock, assertReleaseLock, notificationProject, readNotificationProduction, releaseReleaseLock, sha256,
} from "../../scripts/notificationReleaseCloud.mjs";
import { productionSnapshot, runReleaseSequence } from "../../scripts/releaseNotificationA.mjs";
import { readPublishedAssets, validVapidFingerprint } from "../../scripts/preflightNotificationRelease.mjs";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const { Client } = require("firebase-tools/lib/apiv2");
const { convertConfig } = require("firebase-tools/lib/deploy/hosting/convertConfig");
const { getChannel } = require("firebase-tools/lib/hosting/api");
const cli = join(root, "node_modules/firebase-tools/lib/bin/firebase.js");
const project = notificationProject;
const productionSha = "12f432dd46a6c93e45bfb78ac1993568143c3840";
const visualSha = "fc6f7467ca834569ca2724c5e36c1da81f0f4357";
const branch = "codex/definitive-ui-release";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const hash = (file) => sha256(readFileSync(file));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  }
  return value;
}
const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const check = (ok, reason) => { if (!ok) throw new Error(reason); };
const hostingStep = { id: "hosting", only: "hosting" };
const versions = () => ({ node: process.versions.node, firebase: require("firebase-tools/package.json").version });

function checkout() {
  const head = git("rev-parse", "HEAD");
  check(git("branch", "--show-current") === branch && realpathSync(process.cwd()) === root
    && !git("status", "--porcelain") && process.versions.node.split(".")[0] === "22"
    && git("merge-base", visualSha, head) === visualSha && git("merge-base", productionSha, head) === productionSha,
  "Use the clean integrated branch based on the approved Claude and Production commits.");
  const changed = git("diff", "--name-only", productionSha, head).split("\n");
  check(changed.every((path) => /^(src\/|docs\/|e2e\/definitive-ui\/|DESIGN\.md$|package(?:-lock)?\.json$)/.test(path)),
    "Candidate changes files outside the Hosting-only scope.");
  check(!git("diff", "--name-only", visualSha, head, "--", "src/index.css", "src/**/*.css", "src/styles", "src/components/shell", "DESIGN.md"),
    "Claude CSS, design contract or shell differs from the approved visual source.");
  for (const file of ["package.json", "package-lock.json"]) {
    const before = JSON.parse(git("show", `${productionSha}:${file}`));
    const after = json(join(root, file));
    delete (file === "package.json" ? after.dependencies : after.packages[""].dependencies)["@fontsource-variable/inter"];
    if (file === "package-lock.json") delete after.packages["node_modules/@fontsource-variable/inter"];
    check(same(before, after), "Dependencies outside the approved Inter font differ.");
  }
  return head;
}

function previous(dir) {
  const plan = json(join(dir, "release-plan.json"));
  const receipt = json(join(dir, "publish-receipt.json"));
  const manifestFile = join(dir, "hosting-manifest-A.json");
  const manifest = json(manifestFile);
  check(plan.project === project && plan.sha === productionSha && receipt.sha === plan.sha
    && receipt.state === "COMPLETE" && receipt.action === "publish" && receipt.planHash === hash(join(dir, "release-plan.json"))
    && plan.manifests.A === hash(manifestFile) && manifest.buildId === productionSha
    && receipt.snapshot.hosting.version === "2aa48a01a2244d34", "Exact Release A receipt is required.");
  return { receipt, manifest, hash: hash(manifestFile) };
}

async function versionConfig(version) {
  const response = await new Client({ urlPrefix: "https://firebasehosting.googleapis.com" })
    .get(`/v1beta1/sites/${project}/versions/${version}`, { timeout: 12000, skipLog: { resBody: true } });
  check(response.status === 200 && response.body.status === "FINALIZED" && response.body.config, "Hosting version or configuration is unavailable.");
  return ordered(response.body.config);
}
function hostingConfig() {
  const config = json(join(root, "firebase.json")).hosting;
  check(config.public === "dist" && !config.predeploy && !config.postdeploy && !config.target && !config.site
    && config.rewrites.every(({ run, function: fn }) => !run && !fn?.pinTag),
  "Unexpected Hosting targets, hooks or tagged rewrites.");
  return config;
}

async function inspect() {
  const { report, dedicatedApp } = await readNotificationProduction("A");
  const notification = { dedicatedApp, dedicatedAppState: report.dedicatedAppState, webAppCount: report.webAppCount,
    registrationApi: report.fcmRegistrationApi, deliveryApi: report.fcmDeliveryApi };
  check(notification.dedicatedAppState === "FOUND" && notification.dedicatedApp?.projectId === project
    && notification.registrationApi === "ENABLED" && notification.deliveryApi === "ENABLED"
    && report.functions.every((row) => !row.cleanerPushEnabled), "Live FCM configuration or push mode is unexpected.");
  return { lock: report.releaseLock.state, snapshot: productionSnapshot(report), notification };
}

async function inspectAssets(manifest) {
  const rows = await readPublishedAssets(manifest);
  check(rows.length === manifest.files.length && rows.every((row) => row.matched), "Live Hosting bytes differ from the reviewed manifest.");
  return rows;
}

function filesAt(directory, subdirectory = "") {
  return readdirSync(join(directory, subdirectory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(subdirectory, entry.name);
    check(!entry.isSymbolicLink(), "Symlink rejected in reviewed Hosting assets.");
    return entry.isDirectory() ? filesAt(directory, path) : [path];
  }).sort();
}

async function build(dir, head, a, envDir) {
  check(envDir, "Supply the approved Production environment directory.");
  const initial = await inspect();
  check(initial.lock === "AVAILABLE" && same(initial.snapshot, a.receipt.snapshot), "Production drift or release lock prevents preparation.");
  const old = await inspectAssets(a.manifest);
  const version = initial.snapshot.hosting.version;
  const config = await versionConfig(version);
  const liveChannel = await getChannel("-", project, "live");
  check(liveChannel?.release?.version?.name?.endsWith(`/versions/${version}`), "Live channel version differs.");
  const normalized = await convertConfig({ projectId: project }, {}, {
    version: `sites/${project}/versions/${version}`, config: { ...hostingConfig(), site: project },
  });
  check(same(ordered(normalized), config), "Normalized candidate Hosting configuration differs from live.");
  const fields = ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"];
  const optional = ["VITE_FIREBASE_VAPID_KEY", "VITE_ONESIGNAL_APP_ID", "VITE_CLEANFLOW_ENV_NAVIGATION_EMAILS",
    "VITE_CLEANFLOW_SANDBOX_ORIGIN", "VITE_CLEANFLOW_SANDBOX_PROJECT_ID"];
  for (const key of Object.keys(process.env)) if (key.startsWith("VITE_")) delete process.env[key];
  const source = loadEnv("production", resolve(envDir), "VITE_");
  const names = [...fields.map((field) => "VITE_FIREBASE_" + field), ...optional];
  const env = Object.fromEntries(names.map((name) => [name, source[name] || ""]));
  const manager = old.find((row) => row.file === "firebase-messaging-sw.js");
  check(env.VITE_FIREBASE_PROJECT_ID === project && fields.every((field) => {
    const value = env["VITE_FIREBASE_" + field];
    return value && manager.bytes.includes(JSON.stringify(value));
  }) && validVapidFingerprint(env.VITE_FIREBASE_VAPID_KEY)
    && old.some((row) => row.file.endsWith(".js") && row.bytes.includes(env.VITE_FIREBASE_VAPID_KEY)),
  "Manager Firebase binding or public VAPID differs from the published assets.");
  const dist = join(dir, "assets");
  execFileSync("npm", ["run", "build", "--", "--outDir", dist], { cwd: root, stdio: "inherit", env: {
    ...process.env, ...env, GITHUB_SHA: head, VITE_CLEANFLOW_ENV: "production", VITE_USE_FIREBASE_EMULATORS: "false",
    VITE_CLEANFLOW_PRIVATE_EMULATOR_ORIGIN: "", VITE_NOTIFICATION_INBOX_MODE: "enabled",
    VITE_AUTOMATIC_OFFERS_MODE: "disabled", VITE_FIREBASE_CLEANER_MESSAGING_APP_ID: "",
  } });
  const required = old.filter(({ file }) => !/^assets\/index-/.test(file));
  for (const { file, bytes } of required) {
    const actual = readFileSync(join(dist, file));
    if (file === "index.html" || file === "version.json") continue;
    const expected = file === "sw.js" ? Buffer.from(bytes.toString().replaceAll(productionSha, head)) : bytes;
    check(actual.equals(expected), `Unreviewed change to ${file}.`);
  }
  const marker = json(join(dist, "version.json"));
  check(marker.buildId === head && marker.projectId === project && marker.environment === "production"
    && !marker.deploymentId, "Unexpected build marker or notification variant.");
  const whitelist = new Set(required.map(({ file }) => file));
  const fontDir = dirname(require.resolve("@fontsource-variable/inter/package.json"));
  const files = filesAt(dist).map((file) => {
    if (!whitelist.has(file) && !/^assets\/index-[A-Za-z0-9_-]+\.(js|css)$/.test(file)) {
      const font = /^assets\/(inter-[a-z0-9-]+-wght-normal)-[A-Za-z0-9_-]{8,}\.woff2$/.exec(file);
      check(font && hash(join(dist, file)) === hash(join(fontDir, "files", font[1] + ".woff2")),
        `Unexpected or unverified Hosting asset ${file}.`);
    }
    return { file, sha256: hash(join(dist, file)) };
  });
  check(files.some(({ file }) => file.endsWith(".woff2")), "The reviewed Inter font is missing.");
  write(join(dir, "manifest.json"), { buildId: head, projectId: project, environment: "production", files });
  write(join(dir, "production-baseline.json"), { snapshot: initial.snapshot, hostingConfig: config,
    priorManifestHash: a.hash, toolchain: versions(), notification: initial.notification });
  console.log(JSON.stringify({ state: "BUILD_READY_REVIEW_PENDING", sha: head, files: files.length, manifestHash: hash(join(dir, "manifest.json")) }));
}

function validated(dir, head, a) {
  const manifest = json(join(dir, "manifest.json"));
  const evidence = json(join(dir, "gate.json"));
  const baseline = json(join(dir, "production-baseline.json"));
  const actual = filesAt(join(dir, "assets")).map((file) => ({ file, sha256: hash(join(dir, "assets", file)) }));
  check(manifest.buildId === head && manifest.projectId === project && manifest.environment === "production"
    && same(actual, manifest.files) && same(baseline.snapshot, a.receipt.snapshot) && baseline.priorManifestHash === a.hash
    && same(baseline.toolchain, versions()), "Review artifacts, toolchain or baseline differ.");
  const required = ["unit", "security", "hubSecurity", "definitiveFlows", "legacyE2E", "hubE2E", "visualParity", "authenticatedAcceptance"];
  check(evidence.sha === head && required.every((gate) => evidence.checks?.[gate] === "PASS"), "Required release gates are not all PASS.");
  return { manifest, baseline, plan: { sha: head, project, hostingOnly: true, branch, toolchain: versions(),
    manifestHash: hash(join(dir, "manifest.json")), gateHash: hash(join(dir, "gate.json")),
    baselineHash: hash(join(dir, "production-baseline.json")), hostingConfigHash: sha256(JSON.stringify(baseline.hostingConfig)),
    rollbackVersion: a.receipt.snapshot.hosting.version, priorManifestHash: a.hash } };
}

async function apply(action, dir, a, review, approve, exclusive) {
  const file = join(dir, "release-plan.json");
  const planHash = hash(file);
  check(same(json(file), review.plan) && exclusive && approve === `${action}:${planHash}`,
    "The exact reviewed seal and exclusive release authorization are required.");
  const live = await inspect();
  const rollback = action === "rollback";
  const receipt = rollback && json(join(dir, "publish-receipt.json"));
  const expected = rollback ? receipt.snapshot : a.receipt.snapshot;
  check(live.lock === "AVAILABLE" && same(live.snapshot, expected)
    && same(live.notification, review.baseline.notification)
    && (!rollback || (receipt.state === "COMPLETE" && receipt.planHash === planHash)),
  "Production differs from the reviewed starting state.");
  await inspectAssets(rollback ? review.manifest : a.manifest);
  check(same(await versionConfig(live.snapshot.hosting.version), review.baseline.hostingConfig), "Hosting config drift.");
  check(same(await versionConfig(review.plan.rollbackVersion), review.baseline.hostingConfig), "Rollback version config drift.");
  const channel = await getChannel("-", project, "live");
  check(channel?.release?.version?.name?.endsWith(`/versions/${live.snapshot.hosting.version}`), "Live channel version differs.");
  const workspace = mkdtempSync(join(tmpdir(), "cleanflow-definitive-hosting-"));
  let lock;
  let started = false;
  let complete = false;
  const journal = join(dir, `${action}-journal.jsonl`);
  writeFileSync(journal, "", { flag: "wx", mode: 0o600 });
  try {
    write(join(workspace, "firebase.json"), { hosting: hostingConfig() });
    if (!rollback) for (const { file, sha256: expectedHash } of review.manifest.files) {
      const target = join(workspace, "dist", file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(dir, "assets", file), target);
      check(hash(target) === expectedHash, "Staged asset differs.");
    }
    lock = await acquireReleaseLock({ action: `definitive-ui-${action}`, sha: review.plan.sha, planHash });
    const snapshot = await runReleaseSequence({
      initial: expected, steps: [hostingStep], inspect: async () => {
        const state = await inspect();
        check(same(state.notification, review.baseline.notification), "Concurrent FCM configuration change detected.");
        return state.snapshot;
      },
      verifyLock: () => assertReleaseLock(lock),
      journal: (state, step, current) => writeFileSync(journal, JSON.stringify({ state, step, snapshot: current, lock }) + "\n", { flag: "a" }),
      deploy: () => {
        started = true;
        const args = rollback ? ["hosting:clone", `${project}@${review.plan.rollbackVersion}`, `${project}:live`]
          : ["deploy", "--only", "hosting", "--config", "firebase.json"];
        execFileSync(process.execPath, [cli, ...args, "--project", project, "--non-interactive"], { cwd: workspace, stdio: "inherit" });
      },
      verifyAssets: async () => {
        await inspectAssets(rollback ? a.manifest : review.manifest);
        const after = await inspect();
        check(!rollback || after.snapshot.hosting.version === review.plan.rollbackVersion, "Rollback did not restore the exact version.");
        check(same(await versionConfig(after.snapshot.hosting.version), review.baseline.hostingConfig), "Published Hosting config differs.");
      },
    });
    write(join(dir, `${action}-receipt.json`), { state: "COMPLETE", planHash, snapshot });
    complete = true;
  } finally {
    try { if (lock && (complete || !started)) await releaseReleaseLock(lock); }
    finally { rmSync(workspace, { recursive: true, force: true }); }
  }
}

try {
  const [action, ...args] = process.argv.slice(2);
  const { values } = parseArgs({ args, options: {
    dir: { type: "string" }, "a-dir": { type: "string" }, "env-dir": { type: "string" },
    approve: { type: "string" }, "exclusive-window": { type: "boolean" },
  } });
  check(["build", "seal", "publish", "rollback"].includes(action) && values.dir && values["a-dir"], "Use build, seal, publish or rollback with --dir and --a-dir.");
  check(!["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT",
    "FIREBASE_CONFIG", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"].some((key) => process.env[key]),
  "Use the verified Firebase CLI login without environment overrides.");
  const head = checkout();
  const directory = resolve(values.dir);
  check(relative(root, directory).startsWith(".tmp/"), "Review directory must be under .tmp.");
  const a = previous(resolve(values["a-dir"]));
  if (action === "build") {
    mkdirSync(directory, { mode: 0o700 });
    await build(directory, head, a, values["env-dir"]);
  } else {
    check(realpathSync(directory) === directory, "Review directory must not be a symlink.");
    const review = validated(directory, head, a);
    if (action === "seal") {
      write(join(directory, "release-plan.json"), review.plan);
      console.log(JSON.stringify({ state: "SEALED_LOCAL_ONLY", sha: head, planHash: hash(join(directory, "release-plan.json")) }));
    } else await apply(action, directory, a, review, values.approve, values["exclusive-window"]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
