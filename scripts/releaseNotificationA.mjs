import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync,
  rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { setTimeout } from "node:timers/promises";
import { acquireReleaseLock, assertReleaseLock, notificationProject, readNotificationProduction,
  releaseReleaseLock, sha256 } from "./notificationReleaseCloud.mjs";
import { deployGroups, expectedBranch, readPublishedAssets, validReleaseVerification } from "./preflightNotificationRelease.mjs";
import { inspectHostingBuild } from "./prepareHosting.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const releaseToolchain = () => ({ firebaseTools: require("firebase-tools/package.json").version, node: process.versions.node });
const evidenceFiles = ["verification.json", "preflight-A.json", "preflight-rollback.json"];
const recoveryEndpoints = ["listNotificationInbox", "markNotificationRead", "openNotificationInboxItem"];
const enrollment = ["redeemCleanerAccessCode", "issueCleanerAccessCode"];
const functions = (names) => ({ id: names.join(","), only: names.map((name) => `functions:${name}`).join(","), functions: names });
export const releaseSteps = {
  publish: [
    { id: "rules", only: "firestore:rules" },
    functions([...deployGroups.create, ...deployGroups.update.filter((name) => !enrollment.includes(name))]),
    ...enrollment.map((name) => functions([name])),
    { id: "hosting", only: "hosting" },
  ],
  rollback: [
    functions(recoveryEndpoints),
    { id: "hosting", only: "hosting" },
  ],
};

const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const encode = (value) => JSON.stringify(value, null, 2) + "\n";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shaFormat = /^[a-f0-9]{40}$/;
const digestFormat = /^[a-f0-9]{64}$/;
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function productionSnapshot(report) {
  requireCondition(report?.functionsComplete && report.noPendingFunctionOperations && report.iam?.ok
    && report.hostingVersion && report.hostingRelease && report.ruleset && report.rulesUpdated
    && digestFormat.test(report.firestoreRulesSha256)
    && report.functions.filter((row) => ["sendTomorrowPlanningReminder", "sendTodayExecutionReminder"].includes(row.id))
      .every((row) => row.managerFcm === true)
    && report.functions.every((row) => row.state === "ACTIVE" && row.runtime === "nodejs22" && row.maxInstances === 20
      && row.region === "us-central1" && row.revision && digestFormat.test(row.configurationHash)),
  "Production inventory is incomplete, unavailable or busy.");
  return {
    hosting: { version: report.hostingVersion, release: report.hostingRelease },
    rules: { id: report.ruleset, hash: report.firestoreRulesSha256, updated: report.rulesUpdated },
    functions: Object.fromEntries(report.functions.map((row) => [row.id, {
      revision: row.revision, hash: row.configurationHash,
      secretBindingHash: row.secretBindingHash, runtimeCompatible: row.runtimeCompatible,
      ...(row.inboxMode ? { inboxMode: row.inboxMode } : {}),
    }]).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function verifyTransition(before, after, step, { rulesHash, inboxMode }) {
  const unchanged = (part) => requireCondition(equal(before[part], after[part]), `Concurrent ${part} change detected.`);
  if (step.id === "rules") {
    requireCondition(after.rules.hash === rulesHash && before.rules.id !== after.rules.id,
      "Deployed Firestore Rules do not match the reviewed file.");
  } else unchanged("rules");
  if (step.id === "hosting") {
    requireCondition(before.hosting.release !== after.hosting.release && before.hosting.version !== after.hosting.version,
      "Expected a new Hosting release.");
  } else unchanged("hosting");
  const changed = [...new Set([...Object.keys(before.functions), ...Object.keys(after.functions)])]
    .filter((name) => !equal(before.functions[name], after.functions[name])).sort();
  requireCondition(equal(changed, [...(step.functions || [])].sort()), "Unexpected Functions changed or did not change.");
  for (const name of changed) {
    const result = after.functions[name];
    requireCondition(result && result.revision !== before.functions[name]?.revision,
      "A reviewed Function is absent or did not advance its revision.");
    requireCondition(result.runtimeCompatible && (!before.functions[name]
      || result.secretBindingHash === before.functions[name].secretBindingHash),
    "A targeted Function changed its reviewed runtime configuration or secret bindings.");
    requireCondition(!recoveryEndpoints.includes(name) || result.inboxMode === inboxMode,
      "An Inbox endpoint has an unexpected effective mode.");
  }
}

export async function runReleaseSequence({ initial, steps, rulesHash, inboxMode, inspect, verifyLock, deploy, verifyAssets, journal }) {
  let expected = initial;
  for (const step of steps) {
    requireCondition(equal(await inspect(), expected), "Production drift detected before deploy.");
    await verifyLock();
    await journal("DEPLOYING", step.id, expected);
    await deploy(step);
    const after = await inspect();
    verifyTransition(expected, after, step, { rulesHash, inboxMode });
    await verifyLock();
    if (step.id === "hosting") {
      await verifyAssets();
      requireCondition(equal(await inspect(), after), "Production changed during public verification.");
      await verifyLock();
    }
    expected = after;
    await journal("VERIFIED", step.id, expected);
  }
  return expected;
}

function assertCheckout(sha) {
  requireCondition(shaFormat.test(sha || "") && git("rev-parse", "HEAD") === sha
    && git("branch", "--show-current") === expectedBranch && realpathSync(process.cwd()) === root
    && !git("status", "--porcelain") && process.versions.node.split(".")[0] === "22",
  "Use the clean Issue #85 checkout, requested full SHA and Node 22.");
}

function verifiedArtifact(directory, variant, sha, hash) {
  const manifestFile = join(directory, `hosting-manifest-${variant}.json`);
  const bytes = readFileSync(manifestFile);
  const manifest = JSON.parse(bytes);
  requireCondition(!hash || hash === sha256(bytes), "Hosting manifest hash differs from the sealed plan.");
  requireCondition(manifest.buildId === sha && manifest.environment === "production" && manifest.projectId === notificationProject,
    "Hosting manifest project or SHA is incorrect.");
  const publicFiles = git("ls-files", "public").split("\n").filter(Boolean).map((path) => path.slice(7));
  const dist = join(directory, `assets-${variant}`);
  requireCondition(equal(inspectHostingBuild(dist, sha, publicFiles, manifest), manifest.files),
    "Hosting assets differ from the reviewed manifest.");
  const marker = json(join(dist, "version.json"));
  requireCondition((marker.deploymentId ?? sha) === (variant === "rollback" ? `${sha}-inbox-off` : sha)
    && readFileSync(join(dist, "cleaner-messaging-sw.js"), "utf8") === "// Cleaner push is disabled for this build.\n",
  "Unexpected Hosting variant or cleaner push mode.");
  return { manifest, dist, hash: sha256(bytes) };
}

function seal(directory, sha) {
  const publish = verifiedArtifact(directory, "A", sha);
  const rollback = verifiedArtifact(directory, "rollback", sha);
  requireCondition(publish.hash !== rollback.hash, "The rollback variant must be distinct.");
  const preflight = json(join(directory, "preflight-A.json"));
  const recovery = json(join(directory, "preflight-rollback.json"));
  for (const [report, artifact, isRollback] of [[preflight, publish, false], [recovery, rollback, true]]) {
    requireCondition(report.status === "DRY_RUN_READY" && report.stage === "A" && report.sha === sha
      && report.compatibility === isRollback && report.manifest?.sha256 === artifact.hash
      && report.cleanerPushMode === "disabled" && report.automaticOffersMode === "disabled"
      && report.production?.releaseLock?.state === "AVAILABLE" && report.deploymentPerformed === false
      && equal(report.targets?.functions, { create: deployGroups.create, update: deployGroups.update }),
    "Release A needs passing preflights for both exact build variants.");
  }
  requireCondition(validReleaseVerification(json(join(directory, "verification.json")), sha), "Exact-SHA test gate is missing.");
  const baseline = productionSnapshot(preflight.production);
  requireCondition(equal(baseline, productionSnapshot(recovery.production)), "Production changed between preflights.");
  requireCondition(deployGroups.update.every((name) => baseline.functions[name]?.runtimeCompatible),
    "Unreviewed runtime configuration is present on a targeted Function.");
  const plan = {
    schema: 1, project: notificationProject, sha, branch: expectedBranch, baseline,
    toolchain: releaseToolchain(),
    rulesHash: sha256(readFileSync(join(root, "firestore.rules"))),
    manifests: { A: publish.hash, rollback: rollback.hash },
    evidence: Object.fromEntries(evidenceFiles.map((file) => [file, sha256(readFileSync(join(directory, file)))])),
    scope: deployGroups,
    steps: releaseSteps,
  };
  const bytes = encode(plan);
  writeFileSync(join(directory, "release-plan.json"), bytes, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ state: "SEALED_LOCAL_ONLY", sha, planHash: sha256(bytes) }));
}

function validatePlan(plan, sha, directory) {
  requireCondition(plan.schema === 1 && plan.project === notificationProject && plan.sha === sha
    && plan.branch === expectedBranch && equal(plan.scope, deployGroups) && equal(plan.steps, releaseSteps)
    && equal(plan.toolchain, releaseToolchain())
    && evidenceFiles.every((file) => plan.evidence?.[file] === sha256(readFileSync(join(directory, file))))
    && plan.rulesHash === sha256(readFileSync(join(root, "firestore.rules"))),
  "Release plan differs from the approved project, SHA or scope.");
}

function stageInputs(sha, artifact, action, workspace) {
  const source = execFileSync("git", ["archive", sha, "firebase.json", "firestore.rules", "firestore.indexes.json", "functions"], {
    cwd: root, maxBuffer: 16 * 1024 * 1024,
  });
  execFileSync("tar", ["-xf", "-", "-C", workspace], { input: source, stdio: ["pipe", "pipe", "pipe"] });
  const localDeps = join(root, "functions/node_modules");
  symlinkSync(localDeps, join(workspace, "functions/node_modules"), "dir");
  const inboxMode = action === "publish" ? "enabled" : "disabled";
  writeFileSync(join(workspace, "functions", `.env.${notificationProject}`),
    `DEV_CENTER_SANDBOX_PROJECT_ID=\nMANAGER_REMINDER_PROVIDER=fcm\nAUTOMATIC_OFFERS_MODE=disabled\nCLEANER_PUSH_MODE=disabled\nNOTIFICATION_INBOX_MODE=${inboxMode}\n`,
    { flag: "wx", mode: 0o600 });
  for (const { file, sha256: hash } of artifact.manifest.files) {
    const dest = join(workspace, "dist", file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(artifact.dist, file), dest);
    requireCondition(sha256(readFileSync(dest)) === hash, "Staged Hosting file differs from reviewed bytes.");
  }
  return inboxMode;
}

async function verifyLiveAssets(manifest) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const assets = await readPublishedAssets(manifest);
    if (assets.length && assets.every((row) => row.matched)) return;
    if (attempt < 4) await setTimeout(5_000);
  }
  throw new Error("Public Hosting assets do not yet match the reviewed manifest.");
}

async function execute(action, directory, sha, approval, exclusiveWindow) {
  const bytes = readFileSync(join(directory, "release-plan.json"));
  const planHash = sha256(bytes);
  const plan = JSON.parse(bytes);
  validatePlan(plan, sha, directory);
  const publish = verifiedArtifact(directory, "A", sha, plan.manifests.A);
  const recovery = verifiedArtifact(directory, "rollback", sha, plan.manifests.rollback);
  requireCondition(approval === `${action}:${planHash}` && exclusiveWindow,
    "Execution requires the exact reviewed plan hash and an exclusive Production release window.");
  for (const name of ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT",
    "FIREBASE_CONFIG", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FUNCTIONS_EMULATOR"]) {
    requireCondition(!process.env[name], `Unset ${name} and use the verified Firebase CLI login.`);
  }

  const read = async () => (await readNotificationProduction("A")).report;
  const live = await read();
  const receiptFile = join(directory, `${action}-receipt.json`);
  const publishReceipt = action === "rollback" ? json(join(directory, "publish-receipt.json")) : null;
  requireCondition(action === "publish" || publishReceipt?.state === "COMPLETE" && publishReceipt.planHash === planHash,
    "Rollback requires the verified completed publication receipt for this plan.");
  const initial = action === "publish" ? plan.baseline : publishReceipt.snapshot;
  requireCondition(live.releaseLock?.state === "AVAILABLE" && equal(productionSnapshot(live), initial),
    "Production differs from the approved starting state or another release is in progress.");

  const artifact = action === "publish" ? publish : recovery;
  const workspace = mkdtempSync(join(tmpdir(), "cleanflow-notification-release-"));
  let updateTime;
  let mutationStarted = false;
  let completed = false;
  const record = (state, step, snapshot, create = false) => {
    const data = encode({ schema: 1, action, sha, planHash, state, step, snapshot, lockUpdateTime: updateTime });
    if (create) writeFileSync(receiptFile, data, { flag: "wx", mode: 0o600 });
    else {
      const temporary = `${receiptFile}.tmp`;
      writeFileSync(temporary, data, { flag: "wx", mode: 0o600 });
      renameSync(temporary, receiptFile);
    }
  };
  try {
    const inboxMode = stageInputs(sha, artifact, action, workspace);
    record("STARTING", null, initial, true);
    updateTime = await acquireReleaseLock({ action, sha, planHash });
    const snapshot = await runReleaseSequence({
      initial, steps: releaseSteps[action], rulesHash: plan.rulesHash, inboxMode,
      inspect: async () => productionSnapshot(await read()),
      verifyLock: () => assertReleaseLock(updateTime),
      journal: (state, step, expected) => record(state, step, expected),
      deploy(step) {
        mutationStarted = true;
        const cli = join(root, "node_modules/firebase-tools/lib/bin/firebase.js");
        const result = spawnSync(process.execPath, [cli, "deploy", "--only", step.only,
          "--project", notificationProject, "--config", "firebase.json", "--non-interactive"], {
          cwd: workspace, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
        });
        requireCondition(result.status === 0, `Deploy failed in reviewed step ${step.id}. Lock retained for reconciliation.`);
      },
      verifyAssets: () => verifyLiveAssets(artifact.manifest),
    });
    record("COMPLETE", null, snapshot);
    completed = true;
  } finally {
    try {
      if (updateTime && (completed || !mutationStarted)) await releaseReleaseLock(updateTime);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ state: "COMPLETE", action, sha, planHash }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...args] = process.argv.slice(2);
    const { values } = parseArgs({ args, options: {
      sha: { type: "string" }, dir: { type: "string" }, approve: { type: "string" }, "exclusive-window": { type: "boolean" },
    } });
    requireCondition(["seal", "publish", "rollback"].includes(action) && values.dir, "Use seal, publish or rollback with --sha and --dir.");
    assertCheckout(values.sha);
    const directory = realpathSync(resolve(values.dir));
    requireCondition(relative(root, directory).startsWith(".tmp/"), "Use an ignored release directory under .tmp/.");
    if (action === "seal") seal(directory, values.sha);
    else await execute(action, directory, values.sha, values.approve, values["exclusive-window"]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
