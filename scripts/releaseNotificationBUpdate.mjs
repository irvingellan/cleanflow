import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  acquireReleaseLock, assertReleaseLock, notificationProject, readNotificationProduction, releaseReleaseLock, sha256,
} from "./notificationReleaseCloud.mjs";
import { checkedWebEnvironment, deployGroups, validReleaseVerification } from "./preflightNotificationRelease.mjs";
import { releaseToolchain, runReleaseSequence, stageReleaseInputs, verifyLiveAssets, writeReleaseModes } from "./releaseNotificationA.mjs";
import { releaseBSnapshot, releaseBSteps, transportFunctions, verifiedBReceipt, verifyBStep } from "./releaseNotificationB.mjs";
import { inspectHostingBuild } from "./prepareHosting.mjs";

// Updates the published Release B pilot in place: the four cleaner push
// Functions move to the new source (bound to the new SHA) and Hosting moves to
// the new build. Rollback restores the exact previous source and build, which
// is the original B publication or an earlier sealed update.

const root = resolve(import.meta.dirname, "..");
/** Reviewed update branches, in publication order. */
export const updateBranches = ["claude/cleaner-push-update", "claude/cleaner-push-rebind"];
const fullSha = /^[a-f0-9]{40}$/;
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const encode = (value) => JSON.stringify(value, null, 2) + "\n";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hashFile = (file) => sha256(readFileSync(file));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };
const disabledWorker = "// Cleaner push is disabled for this build.\n";

// Same order as the original pilot publish, without the Inbox step.
export const updateSteps = {
  publish: releaseBSteps.publish.slice(1),
  rollback: releaseBSteps.publish.slice(1),
};
/** Source files an update may change outside the client bundle. */
export const allowedServerPaths = [
  "functions/src/cleanerPushPilot.js", "functions/src/cleanerPushDevices.js", "functions/src/cleanerPush.test.js",
];

export function deploymentArgs(step) {
  requireCondition(updateSteps.publish.some((reviewed) => equal(reviewed, step)), "Unreviewed update step.");
  return ["deploy", "--only", step.only, "--project", notificationProject, "--config", "firebase.json", "--non-interactive"];
}

/** Every transport Function is in pilot mode and bound to one release SHA. */
export function checkTransportRelease(snapshot, sha) {
  requireCondition(transportFunctions.every((name) => snapshot.functions[name]?.cleanerPushMode === "pilot"
    && snapshot.functions[name].cleanerPushPilotRelease === sha), "Cleaner push Functions are not all bound to the expected release.");
}

/** Only the pilot check and its tests may differ in Functions; Rules and Hosting config must not. */
export function serverScopeChanges(previousSha, sha) {
  const changed = git("diff", "--name-only", `${previousSha}..${sha}`, "--",
    "functions", "firestore.rules", "firestore.indexes.json", "storage.rules", "firebase.json").split("\n").filter(Boolean);
  return { changed, allowed: changed.every((file) => allowedServerPaths.includes(file)) };
}

function artifact(manifestFile, dist, sha, hash) {
  const manifest = json(manifestFile);
  const manifestHash = hashFile(manifestFile);
  requireCondition(fullSha.test(sha) && (!hash || hash === manifestHash) && manifest.buildId === sha
    && manifest.projectId === notificationProject && manifest.environment === "production",
  "Hosting manifest does not match the reviewed SHA or project.");
  const publicFiles = git("ls-tree", "-r", "--name-only", sha, "--", "public").split("\n").filter(Boolean).map((file) => file.slice(7));
  requireCondition(equal(inspectHostingBuild(dist, sha, publicFiles, manifest, { removeFinderMetadata: false }), manifest.files),
    "Hosting asset bytes differ from the reviewed manifest.");
  const marker = json(join(dist, "version.json"));
  const worker = readFileSync(join(dist, "cleaner-messaging-sw.js"), "utf8");
  requireCondition(marker.deploymentId === `${sha}-cleaner-push` && worker !== disabledWorker,
    "The build is not a cleaner push pilot build.");
  return { sha, manifest, manifestHash, dist, worker };
}

/** Which sealed publication a review directory holds: the original B or an earlier update. */
export function previousVariant(directory) {
  const update = existsSync(join(directory, "release-plan-U.json"));
  const original = existsSync(join(directory, "release-plan-B.json"));
  requireCondition(update !== original, "The previous directory must hold exactly one sealed publication.");
  return update ? "U" : "B";
}

/** The live publication: its sealed plan, COMPLETE receipt and reviewed build. */
function readPrevious(directory) {
  const variant = previousVariant(directory);
  const planFile = join(directory, `release-plan-${variant}.json`);
  const plan = json(planFile);
  const planHash = hashFile(planFile);
  const receiptFile = join(directory, `publish-receipt-${variant}.json`);
  const receipt = json(receiptFile);
  requireCondition(receipt.state === "COMPLETE" && receipt.action === "publish" && receipt.sha === plan.sha
    && receipt.planHash === planHash && receipt.artifactHash === plan.artifactHash,
  "The previous publication needs its exact COMPLETE receipt.");
  requireCondition(variant === "B" || (plan.kind === "RELEASE_B_UPDATE" && updateBranches.includes(plan.branch)),
    "The previous update plan is not a reviewed update.");
  const build = artifact(join(directory, `hosting-manifest-${variant}.json`), join(directory, `assets-${variant}`), plan.sha, plan.artifactHash);
  checkTransportRelease(receipt.snapshot, plan.sha);
  return { plan, planHash, receipt, receiptHash: hashFile(receiptFile), build };
}

function checkBinding(production, plan, build) {
  const app = production.dedicatedApp;
  requireCondition(production.report.fcmRegistrationApi === "ENABLED" && production.report.fcmDeliveryApi === "ENABLED"
    && app?.projectId === notificationProject && sha256(app.appId || "") === plan.cleanerBinding.appIdHash
    && sha256(app.apiKey || "") === plan.cleanerBinding.apiKeyHash
    && [app.appId, app.apiKey].every((value) => build.worker.includes(JSON.stringify(value))),
  "The dedicated cleaner app or Firebase Messaging APIs differ from the reviewed binding.");
}

async function prepare({ directory, previousDir, envDir, verification }) {
  const sha = git("rev-parse", "HEAD");
  const previous = readPrevious(previousDir);
  requireCondition(validReleaseVerification(json(verification), sha), "The test receipt must pass for this exact SHA.");
  const scope = serverScopeChanges(previous.plan.sha, sha);
  requireCondition(scope.allowed, `Server-side change outside the reviewed update scope: ${scope.changed.join(", ")}`);
  const production = await readNotificationProduction("B");
  const live = releaseBSnapshot(production.report);
  requireCondition(production.report.releaseLock?.state === "AVAILABLE", "The Production release mutex is held.");
  requireCondition(verifiedBReceipt(previous.receipt, { action: "publish", sha: previous.plan.sha, planHash: previous.planHash,
    artifactHash: previous.plan.artifactHash, snapshot: live }), "Production differs from the previous COMPLETE receipt.");
  requireCondition(production.report.iam?.ok && production.report.noPendingFunctionOperations
    && production.report.functions.filter(({ id }) => transportFunctions.includes(id)).every(({ runtimeCompatible }) => runtimeCompatible),
  "IAM, pending Function operations or transport runtime configuration need review.");
  checkBinding(production, previous.plan, previous.build);
  await verifyLiveAssets(previous.build.manifest);

  const { env } = checkedWebEnvironment(envDir);
  env.VITE_FIREBASE_CLEANER_MESSAGING_APP_ID = production.dedicatedApp.appId;
  env.VITE_CLEANFLOW_CLEANER_PUSH_PILOT = "enabled";
  execFileSync("npm", ["run", "hosting:prepare", "--", sha, "production"], { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const manifestFile = join(directory, "hosting-manifest-U.json");
  const dist = join(directory, "assets-U");
  requireCondition(!existsSync(manifestFile) && !existsSync(dist), "Use a fresh update review directory.");
  cpSync(join(root, ".firebase/hosting-prepared-manifest.json"), manifestFile);
  cpSync(join(root, "dist"), dist, { recursive: true });
  const build = artifact(manifestFile, dist, sha);
  requireCondition(readFileSync(join(dist, "firebase-messaging-sw.js")).equals(readFileSync(join(previous.build.dist, "firebase-messaging-sw.js"))),
    "The manager worker must keep the published bytes.");
  checkBinding(production, previous.plan, build);
  const plan = {
    schema: 1, kind: "RELEASE_B_UPDATE", project: notificationProject, branch: git("branch", "--show-current"), sha,
    toolchain: releaseToolchain(), artifactHash: build.manifestHash,
    previous: { sha: previous.plan.sha, planHash: previous.planHash, receiptHash: previous.receiptHash, artifactHash: previous.plan.artifactHash },
    cleanerBinding: previous.plan.cleanerBinding, serverChanges: scope.changed,
    evidence: { verification: hashFile(verification) }, steps: updateSteps,
  };
  const bytes = encode(plan);
  writeFileSync(join(directory, "release-plan-U.json"), bytes, { flag: "wx", mode: 0o600 });
  cpSync(verification, join(directory, "verification.json"));
  console.log(JSON.stringify({ state: "SEALED_LOCAL_ONLY", sha, planHash: sha256(bytes), files: build.manifest.files.length }));
}

async function execute(action, { directory, previousDir, approval, exclusiveWindow }) {
  const planFile = join(directory, "release-plan-U.json");
  const plan = json(planFile);
  const planHash = hashFile(planFile);
  requireCondition(exclusiveWindow && approval === `${action}:${planHash}`, "Execution needs the exact plan approval and an exclusive window.");
  requireCondition(git("rev-parse", "HEAD") === plan.sha && git("branch", "--show-current") === plan.branch,
    "Run from the sealed update SHA and branch.");
  const previous = readPrevious(previousDir);
  requireCondition(equal(plan.previous, { sha: previous.plan.sha, planHash: previous.planHash, receiptHash: previous.receiptHash,
    artifactHash: previous.plan.artifactHash }), "The previous publication differs from the sealed plan.");
  const current = artifact(join(directory, "hosting-manifest-U.json"), join(directory, "assets-U"), plan.sha, plan.artifactHash);
  const target = action === "publish" ? current : previous.build;
  const fromSha = action === "publish" ? previous.plan.sha : plan.sha;
  const receiptPath = join(directory, `${action}-receipt-U.json`);
  requireCondition(!existsSync(receiptPath), "A receipt for this action exists; reconcile before retrying.");

  const read = async () => {
    const production = await readNotificationProduction("B");
    checkBinding(production, previous.plan, target);
    return { production, snapshot: releaseBSnapshot(production.report) };
  };
  const { production, snapshot: live } = await read();
  requireCondition(production.report.releaseLock?.state === "AVAILABLE", "The Production release mutex is held.");
  if (action === "publish") {
    requireCondition(verifiedBReceipt(previous.receipt, { action: "publish", sha: previous.plan.sha, planHash: previous.planHash,
      artifactHash: previous.plan.artifactHash, snapshot: live }), "Production differs from the previous COMPLETE receipt.");
  } else {
    const published = json(join(directory, "publish-receipt-U.json"));
    requireCondition(published.state === "COMPLETE" && equal(published.snapshot, live), "Rollback needs the exact COMPLETE update receipt.");
  }
  checkTransportRelease(live, fromSha);
  await verifyLiveAssets(action === "publish" ? previous.build.manifest : current.manifest);

  const workspace = mkdtempSync(join(tmpdir(), "cleanflow-release-u-"));
  let lockTime;
  let changed = false;
  let completed = false;
  const record = (state, step, snapshot, create = false) => {
    const bytes = encode({ schema: 1, action, sha: target.sha, planHash, artifactHash: target.manifestHash, state, step, snapshot, lockUpdateTime: lockTime });
    if (create) writeFileSync(receiptPath, bytes, { flag: "wx", mode: 0o600 });
    else { writeFileSync(`${receiptPath}.tmp`, bytes, { flag: "wx", mode: 0o600 }); renameSync(`${receiptPath}.tmp`, receiptPath); }
  };
  try {
    stageReleaseInputs(target.sha, target, { inboxMode: "enabled", cleanerPushMode: "disabled" }, workspace);
    record("STARTING", null, live, true);
    lockTime = await acquireReleaseLock({ action: `B-update-${action}`, sha: plan.sha, planHash });
    const result = await runReleaseSequence({
      initial: live,
      steps: updateSteps[action],
      inboxMode: "enabled",
      inspect: async () => (await read()).snapshot,
      verifyLock: () => assertReleaseLock(lockTime),
      journal(state, id, snapshot) {
        if (state === "VERIFIED") verifyBStep(snapshot, updateSteps[action].find((step) => step.id === id), target.sha);
        record(state, id, snapshot);
      },
      deploy(step) {
        if (step.cleanerPushMode) writeReleaseModes(workspace, { inboxMode: "enabled", cleanerPushMode: step.cleanerPushMode, pilotRelease: target.sha });
        changed = true;
        const cli = join(root, "node_modules/firebase-tools/lib/bin/firebase.js");
        const run = spawnSync(process.execPath, [cli, ...deploymentArgs(step)], { cwd: workspace, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        requireCondition(run.status === 0, `Deploy failed in update step ${step.id}. Lock retained for reconciliation.`);
      },
      verifyAssets: () => verifyLiveAssets(target.manifest),
    });
    checkTransportRelease(result, target.sha);
    record("COMPLETE", null, result);
    completed = true;
  } finally {
    try {
      if (lockTime && (completed || !changed)) await releaseReleaseLock(lockTime);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ state: "COMPLETE", action, sha: target.sha, planHash }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...args] = process.argv.slice(2);
    const { values } = parseArgs({ args, options: {
      dir: { type: "string" }, "previous-dir": { type: "string" }, "env-dir": { type: "string" }, verification: { type: "string" },
      approve: { type: "string" }, "exclusive-window": { type: "boolean" },
    } });
    requireCondition(["seal", "publish", "rollback"].includes(action) && values.dir && values["previous-dir"],
      "Use seal|publish|rollback with --dir and --previous-dir.");
    requireCondition(updateBranches.includes(git("branch", "--show-current")) && !git("status", "--porcelain")
      && realpathSync(process.cwd()) === root && process.versions.node.split(".")[0] === "22",
    "Use the clean update worktree on Node 22.");
    for (const name of ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT",
      "FIREBASE_CONFIG", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FUNCTIONS_EMULATOR"]) {
      requireCondition(!process.env[name], `Unset ${name} and use the verified Firebase CLI login.`);
    }
    const directory = resolve(values.dir);
    requireCondition(relative(root, directory).startsWith(".tmp/"), "Use an ignored directory under .tmp/.");
    const previousDir = realpathSync(resolve(values["previous-dir"]));
    if (action === "seal") {
      requireCondition(values["env-dir"] && values.verification, "Seal needs --env-dir and --verification.");
      await prepare({ directory, previousDir, envDir: values["env-dir"], verification: realpathSync(resolve(values.verification)) });
    } else {
      await execute(action, { directory: realpathSync(directory), previousDir, approval: values.approve, exclusiveWindow: values["exclusive-window"] });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
