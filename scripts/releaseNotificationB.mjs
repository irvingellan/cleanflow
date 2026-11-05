import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { acquireReleaseLock, assertReleaseLock, notificationProject, productionSnapshot,
  readNotificationProduction, releaseReleaseLock, sha256 } from "./notificationReleaseCloud.mjs";
import { deployGroups, liveHostingBaseline, releaseBBranch, validReleaseVerification } from "./preflightNotificationRelease.mjs";
import { releaseToolchain, runReleaseSequence, stageReleaseInputs, verifyLiveAssets,
  writeReleaseModes } from "./releaseNotificationA.mjs";
import { inspectHostingBuild } from "./prepareHosting.mjs";

const root = resolve(import.meta.dirname, "..");
const fullSha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const encode = (value) => JSON.stringify(value, null, 2) + "\n";
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const hashFile = (file) => sha256(readFileSync(file));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const inboxEndpoints = ["listNotificationInbox", "markNotificationRead", "openNotificationInboxItem"];
const [register, sender] = deployGroups.enable;
const transportFunctions = [...deployGroups.prepareB, register, sender];
const functionsStep = (names, cleanerPushMode) => ({
  id: names.join(","),
  only: names.map((name) => `functions:${name}`).join(","),
  functions: names,
  cleanerPushMode,
});
const hosting = { id: "hosting", only: "hosting" };

export const releaseBSteps = {
  publish: [
    // Same Inbox contract plus the read-only PUSH_TEST record; no transport.
    functionsStep(deployGroups.inboxUpdate, "disabled"),
    functionsStep(deployGroups.prepareB, "pilot"),
    hosting,
    functionsStep([register], "pilot"),
    functionsStep([sender], "pilot"),
  ],
  rollback: [
    functionsStep([sender], "disabled"),
    functionsStep([register], "disabled"),
    hosting,
  ],
};

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function releaseBDeploymentArgs(action, step, before) {
  requireCondition(releaseBSteps[action]?.some((reviewed) => equal(reviewed, step)), "Unreviewed Release B deploy step.");
  const config = action === "rollback" && step.id === "hosting" ? "firebase-rollback.json" : "firebase.json";
  const args = ["deploy", "--only", step.only, "--project", notificationProject, "--config", config, "--non-interactive"];
  // Pinned Firebase CLI requires force to acknowledge a *new* retry trigger.
  // Keep the acknowledgement exclusive to that exact create.
  if (action === "publish" && step.id === sender) {
    requireCondition(!Object.hasOwn(before.functions, sender), "Sender already exists; reconcile before retrying.");
    args.push("--force");
  }
  return args;
}

function assertAInbox(snapshot) {
  requireCondition(inboxEndpoints.every((name) => snapshot?.functions?.[name]?.inboxMode === "enabled")
    && !Object.hasOwn(snapshot.functions, "createAutomaticJobOffers"),
  "Release B requires the Inbox-enabled manual-offer Production baseline.");
}

export function releaseBSnapshot(report) {
  const snapshot = productionSnapshot(report);
  assertAInbox(snapshot);
  for (const row of report.functions) {
    const isTransport = transportFunctions.includes(row.id);
    requireCondition(row.automaticOffersMode === "disabled"
      && (row.cleanerPushMode === "disabled" || (isTransport && row.cleanerPushMode === "pilot" && fullSha.test(row.cleanerPushPilotRelease ?? ""))),
    "A Production Function has an unexpected automatic-offer or cleaner push mode.");
    if (isTransport) Object.assign(snapshot.functions[row.id], {
      cleanerPushMode: row.cleanerPushMode,
      cleanerPushPilotRelease: row.cleanerPushPilotRelease ?? null,
    });
  }
  return snapshot;
}

export function verifyBStep(snapshot, step, sha) {
  assertAInbox(snapshot);
  requireCondition((step.functions || []).every((name) => snapshot.functions[name]?.cleanerPushMode === step.cleanerPushMode
    && (step.cleanerPushMode !== "pilot" || snapshot.functions[name].cleanerPushPilotRelease === sha)),
    "Targeted Release B Function has an unexpected cleaner push mode.");
}

function checkTransport(snapshot, action, sha) {
  const expectedMode = (name) => action === "rollback" && [register, sender].includes(name) ? "disabled" : "pilot";
  requireCondition(transportFunctions.every((name) => snapshot.functions[name]?.cleanerPushMode === expectedMode(name)
    && (expectedMode(name) !== "pilot" || snapshot.functions[name].cleanerPushPilotRelease === sha)),
  "Release B transport modes or pilot release binding differ.");
}

export function verifiedBReceipt(receipt, { action, sha, planHash, artifactHash, snapshot }) {
  return receipt?.schema === 1 && receipt.state === "COMPLETE" && receipt.action === action
    && receipt.sha === sha && receipt.planHash === planHash && receipt.artifactHash === artifactHash
    && equal(receipt.snapshot, snapshot);
}

function artifact(manifestFile, dist, variant, sha, hash) {
  const manifest = json(manifestFile);
  const manifestHash = hashFile(manifestFile);
  requireCondition(fullSha.test(sha) && (!hash || hash === manifestHash)
    && manifest.buildId === sha && manifest.projectId === notificationProject && manifest.environment === "production",
  "Hosting manifest does not match the reviewed SHA or project.");
  const publicFiles = git("ls-tree", "-r", "--name-only", sha, "--", "public").split("\n")
    .filter(Boolean).map((file) => file.slice(7));
  requireCondition(equal(inspectHostingBuild(dist, sha, publicFiles, manifest, { removeFinderMetadata: false }), manifest.files),
    "Hosting asset bytes differ from the reviewed manifest.");
  const worker = readFileSync(join(dist, "cleaner-messaging-sw.js"), "utf8");
  const marker = json(join(dist, "version.json"));
  const disabledWorker = "// Cleaner push is disabled for this build.\n";
  requireCondition(variant === "baseline" ? !marker.deploymentId && worker === disabledWorker
    : marker.deploymentId === `${sha}-cleaner-push` && worker !== disabledWorker,
  "Unexpected PWA release marker or cleaner worker.");
  return { sha, manifest, manifestHash, dist, worker };
}

/** The published Definitive UI Hosting release is B's baseline and rollback build. */
function readBaseline(uiDirectory, receiptFile) {
  const receiptBytes = readFileSync(receiptFile);
  const receipt = JSON.parse(receiptBytes);
  const manifestFile = join(uiDirectory, "manifest.json");
  requireCondition(receipt.state === "COMPLETE" && receipt.mutexReleased === true && receipt.project === notificationProject
    && receipt.sha === liveHostingBaseline.sha && receipt.manifestHash === liveHostingBaseline.manifestHash
    && hashFile(manifestFile) === liveHostingBaseline.manifestHash
    && receipt.candidateVersion === liveHostingBaseline.hostingVersion
    && receipt.snapshot?.hosting?.version === liveHostingBaseline.hostingVersion,
  "Release B needs the exact COMPLETE Definitive UI Hosting receipt and its reviewed build.");
  assertAInbox(receipt.snapshot);
  requireCondition(transportFunctions.every((name) => !Object.hasOwn(receipt.snapshot.functions, name)),
    "The baseline snapshot already contains cleaner push Functions.");
  const hostingArtifact = artifact(manifestFile, join(uiDirectory, "assets"), "baseline",
    liveHostingBaseline.sha, liveHostingBaseline.manifestHash);
  return {
    baseline: receipt.snapshot,
    hashes: { receiptHash: sha256(receiptBytes), manifestHash: hostingArtifact.manifestHash },
    artifact: hostingArtifact,
  };
}

function reviewedPlan(directory, sha, previous) {
  const preflightFile = join(directory, "preflight-B.json");
  const verificationFile = join(directory, "verification.json");
  const preflight = json(preflightFile);
  const current = artifact(join(directory, "hosting-manifest-B.json"), join(directory, "assets-B"), "B", sha, preflight.manifest?.sha256);
  requireCondition(preflight.status === "DRY_RUN_READY" && preflight.stage === "B" && preflight.sha === sha
    && preflight.manifest?.sha256 === current.manifestHash
    && preflight.cleanerPushMode === "pilot" && preflight.pilotPolicy === "explicit-device-approval"
    && preflight.automaticOffersMode === "disabled"
    && preflight.production?.releaseLock?.state === "AVAILABLE" && preflight.deploymentPerformed === false
    && equal(preflight.targets?.updateBeforeHosting, deployGroups.inboxUpdate)
    && equal(preflight.targets?.createBeforeHosting, deployGroups.prepareB)
    && equal(preflight.targets?.createAfterHosting, deployGroups.enable)
    && equal(preflight.baseline, previous.hashes) && equal(releaseBSnapshot(preflight.production), previous.baseline)
    && digest.test(preflight.cleanerBinding?.appIdHash) && digest.test(preflight.cleanerBinding?.apiKeyHash)
    && digest.test(preflight.cleanerBinding?.vapidFingerprint)
    && validReleaseVerification(json(verificationFile), sha),
  "Release B needs the exact passing pilot preflight, scope and test receipt.");
  return { current, plan: {
    schema: 1,
    project: notificationProject,
    branch: releaseBBranch,
    sha,
    toolchain: releaseToolchain(),
    baseline: previous.hashes,
    artifactHash: current.manifestHash,
    cleanerBinding: preflight.cleanerBinding,
    pilotPolicy: preflight.pilotPolicy,
    physicalEvidence: preflight.physicalEvidence,
    evidence: { preflight: hashFile(preflightFile), verification: hashFile(verificationFile) },
    steps: releaseBSteps,
  } };
}

const readProduction = () => readNotificationProduction("B");

function checkBinding({ report, dedicatedApp }, plan, current) {
  requireCondition(report.fcmRegistrationApi === "ENABLED" && report.fcmDeliveryApi === "ENABLED"
    && dedicatedApp?.projectId === notificationProject
    && dedicatedApp.appId && sha256(dedicatedApp.appId) === plan.cleanerBinding.appIdHash
    && dedicatedApp.apiKey && sha256(dedicatedApp.apiKey) === plan.cleanerBinding.apiKeyHash
    && [dedicatedApp.appId, dedicatedApp.apiKey].every((value) => current.worker.includes(JSON.stringify(value))),
  "The dedicated cleaner app or enabled Firebase Messaging APIs changed since review.");
}

function readOptionalReceipt(file) {
  try {
    return json(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

async function execute(action, directory, plan, current, previous, approval, exclusiveWindow) {
  const planFile = join(directory, "release-plan-B.json");
  requireCondition(equal(json(planFile), plan), "Release B plan or local evidence differs from the reviewed seal.");
  const planHash = hashFile(planFile);
  requireCondition(exclusiveWindow && approval === `${action}:${planHash}`,
    "Execution requires a separate exact-plan authorization and an exclusive Production release window.");
  const actionArtifact = action === "publish" ? current : previous.artifact;
  const receiptPath = join(directory, `${action}-receipt-B.json`);
  const prior = readOptionalReceipt(receiptPath);
  const production = await readProduction();
  requireCondition(production.report.releaseLock?.state === "AVAILABLE", "The Production release mutex is held or unavailable.");
  const live = releaseBSnapshot(production.report);
  const receiptIdentity = { action, sha: plan.sha, planHash, artifactHash: actionArtifact.manifestHash };
  if (prior) {
    requireCondition(verifiedBReceipt(prior, { ...receiptIdentity, snapshot: live }),
      "An incomplete or drifted Release B attempt needs explicit reconciliation.");
    checkTransport(live, action, plan.sha);
    if (action === "publish") checkBinding(production, plan, current);
    await verifyLiveAssets(actionArtifact.manifest);
    const confirmed = await readProduction();
    requireCondition(confirmed.report.releaseLock?.state === "AVAILABLE" && equal(releaseBSnapshot(confirmed.report), live),
      "Production changed during completed receipt verification.");
    if (action === "publish") checkBinding(confirmed, plan, current);
    console.log(JSON.stringify({ state: "ALREADY_COMPLETE", ...receiptIdentity }));
    return;
  }

  const completedPublish = action === "rollback" ? json(join(directory, "publish-receipt-B.json")) : null;
  if (action === "rollback") {
    requireCondition(verifiedBReceipt(completedPublish, { ...receiptIdentity, action: "publish",
      artifactHash: current.manifestHash, snapshot: live }),
    "Rollback requires the exact verified completed Release B receipt.");
    checkTransport(live, "publish", plan.sha);
  } else {
    requireCondition(equal(live, previous.baseline), "Production differs from the sealed Definitive UI baseline.");
    checkBinding(production, plan, current);
  }
  await verifyLiveAssets(action === "publish" ? previous.artifact.manifest : current.manifest);

  const workspace = mkdtempSync(join(tmpdir(), "cleanflow-release-b-"));
  let lockTime;
  let changed = false;
  let completed = false;
  let before = live;
  const record = (state, step, snapshot, create = false) => {
    const bytes = encode({ schema: 1, ...receiptIdentity, state, step, snapshot, lockUpdateTime: lockTime });
    const destination = create ? receiptPath : `${receiptPath}.tmp`;
    writeFileSync(destination, bytes, { flag: "wx", mode: 0o600 });
    if (!create) renameSync(destination, receiptPath);
  };
  const inspect = async () => {
    const fresh = await readProduction();
    if (action === "publish") checkBinding(fresh, plan, current);
    return releaseBSnapshot(fresh.report);
  };
  try {
    stageReleaseInputs(plan.sha, actionArtifact, { inboxMode: "enabled", cleanerPushMode: "disabled" }, workspace);
    if (action === "rollback") {
      // Disable transport with the B source, then restore the Definitive UI assets and Hosting
      // configuration from their original Git object.
      const original = execFileSync("git", ["show", `${actionArtifact.sha}:firebase.json`], { cwd: root });
      writeFileSync(join(workspace, "firebase-rollback.json"), original, { flag: "wx", mode: 0o600 });
    }
    record("STARTING", null, live, true);
    lockTime = await acquireReleaseLock({ action: `B-${action}`, sha: plan.sha, planHash });
    const result = await runReleaseSequence({
      initial: live,
      steps: releaseBSteps[action],
      inboxMode: "enabled",
      inspect,
      verifyLock: () => assertReleaseLock(lockTime),
      journal(state, id, snapshot) {
        if (state === "VERIFIED") verifyBStep(snapshot, releaseBSteps[action].find((step) => step.id === id), plan.sha);
        before = snapshot;
        record(state, id, snapshot);
      },
      deploy(step) {
        const args = releaseBDeploymentArgs(action, step, before);
        if (step.cleanerPushMode) {
          writeReleaseModes(workspace, { inboxMode: "enabled", cleanerPushMode: step.cleanerPushMode,
            pilotRelease: step.cleanerPushMode === "pilot" ? plan.sha : undefined });
        }
        changed = true;
        const cli = join(root, "node_modules/firebase-tools/lib/bin/firebase.js");
        const result = spawnSync(process.execPath, [cli, ...args], {
          cwd: workspace, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
        });
        requireCondition(result.status === 0, `Deploy failed in reviewed Release B step ${step.id}. Lock retained for reconciliation.`);
      },
      verifyAssets: () => verifyLiveAssets(actionArtifact.manifest),
    });
    checkTransport(result, action, plan.sha);
    record("COMPLETE", null, result);
    completed = true;
  } finally {
    try {
      if (lockTime && (completed || !changed)) await releaseReleaseLock(lockTime);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ state: "COMPLETE", ...receiptIdentity }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...args] = process.argv.slice(2);
    const { values } = parseArgs({ args, options: {
      sha: { type: "string" }, dir: { type: "string" }, "ui-dir": { type: "string" }, "baseline-receipt": { type: "string" },
      approve: { type: "string" }, "exclusive-window": { type: "boolean" },
    } });
    requireCondition(["seal", "publish", "rollback"].includes(action) && values.dir && values["ui-dir"] && values["baseline-receipt"],
      "Use seal, publish or rollback with --sha, --dir, --ui-dir and --baseline-receipt.");
    requireCondition(fullSha.test(values.sha || "") && git("rev-parse", "HEAD") === values.sha
      && git("branch", "--show-current") === releaseBBranch && realpathSync(process.cwd()) === root
      && !git("status", "--porcelain") && process.versions.node.split(".")[0] === "22",
    "Use the clean Release B worktree, requested full SHA and Node 22.");
    for (const name of ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT",
      "FIREBASE_CONFIG", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FUNCTIONS_EMULATOR"]) {
      requireCondition(!process.env[name], `Unset ${name} and use the verified Firebase CLI login.`);
    }
    const directory = realpathSync(resolve(values.dir));
    requireCondition(relative(root, directory).startsWith(".tmp/"), "Use an ignored release directory under .tmp/.");
    const previous = readBaseline(realpathSync(resolve(values["ui-dir"])), realpathSync(resolve(values["baseline-receipt"])));
    const { plan, current } = reviewedPlan(directory, values.sha, previous);
    if (action === "seal") {
      const bytes = encode(plan);
      const file = join(directory, "release-plan-B.json");
      try {
        writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        requireCondition(readFileSync(file, "utf8") === bytes, "A different Release B seal exists. Use a fresh review directory.");
      }
      console.log(JSON.stringify({ state: "SEALED_LOCAL_ONLY", sha: values.sha, planHash: sha256(bytes) }));
    } else await execute(action, directory, plan, current, previous, values.approve, values["exclusive-window"]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
