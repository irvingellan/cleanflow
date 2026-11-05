import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { ECDH } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadEnv } from "vite";
import { inspectHostingBuild } from "./prepareHosting.mjs";
import { dedicatedCleanerAppName, notificationProject, productionSnapshot, readNotificationProduction, releaseApis, sha256 } from "./notificationReleaseCloud.mjs";
import { cleanerMessagingConfig } from "../src/features/notifications/cleanerPushBinding.js";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const deployedSha = "a593daf636024d6830bf89c75bd7f6353b4b759f";
const deployedManifestHash = "ddbc29c2e86ff71e5539acb6551c4679724d323efbad502b457cfdb558c173e5";
const oldRuleset = "03de7532-ddb1-4f6e-b6d7-137d0717572d";
export const expectedBranch = "codex/release-a-claude-ux-85";
export const releaseBBranch = "claude/cleaner-push-on-definitive-ui";
export const publishedReleaseASha = "12f432dd46a6c93e45bfb78ac1993568143c3840";
// Release B is applied over the published Definitive UI Hosting release. Its
// COMPLETE two-phase receipt is the Production baseline and the rollback build.
export const liveHostingBaseline = Object.freeze({
  sha: "a7cdb66407a07097a3952d1197a6131e8c43f6e0",
  manifestHash: "c541289e54f4678802e682308480700a7a108feb632039812d19fb455b1da7cc",
  hostingVersion: "cfa94d1aac3404a2",
});
const origin = `https://${notificationProject}.web.app`;
export const deployGroups = {
  create: [
    "deactivateManagerPushDevice", "listNotificationInbox", "markNotificationRead", "openNotificationInboxItem",
  ],
  update: [
    "publicOffer", "publicChecklist", "respondToMyOffer", "issueCleanerAccessCode",
    "redeemCleanerAccessCode", "revokeCleanerHubAccess", "openMyChecklist", "syncCleanerAgendaOnJobWrite",
    "syncCleanerAgendaOnOfferWrite", "registerManagerPushDevice",
    "getManagerNotificationDiagnostics", "reportManagerNotificationHealth", "sendDeveloperTestNotification",
    "sendCurrentManagerTestNotification", "notifyManagersOperationalEvent", "notifyManagersChecklistReadyForReview",
    "sendTomorrowPlanningReminder", "sendTodayExecutionReminder",
  ],
  defer: ["createAutomaticJobOffers", "getCleanerPushDeviceStatus", "deactivateCleanerPushDevice",
    "registerCleanerPushDevice", "notifyCleanerInboxEvent"],
  // Inbox endpoints learn the PUSH_TEST record before any transport exists.
  inboxUpdate: ["listNotificationInbox", "markNotificationRead", "openNotificationInboxItem"],
  prepareB: ["getCleanerPushDeviceStatus", "deactivateCleanerPushDevice"],
  enable: ["registerCleanerPushDevice", "notifyCleanerInboxEvent"],
};
const webFields = {
  apiKey: "API_KEY", authDomain: "AUTH_DOMAIN", projectId: "PROJECT_ID",
  storageBucket: "STORAGE_BUCKET", messagingSenderId: "MESSAGING_SENDER_ID", appId: "APP_ID",
};
const optionalWebEnv = [
  "VITE_FIREBASE_VAPID_KEY", "VITE_ONESIGNAL_APP_ID", "VITE_CLEANFLOW_ENV_NAVIGATION_EMAILS",
  "VITE_CLEANFLOW_SANDBOX_ORIGIN", "VITE_CLEANFLOW_SANDBOX_PROJECT_ID",
];

export function validVapidFingerprint(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{87}$/.test(value)) return null;
  try {
    const point = Buffer.from(value, "base64url");
    if (point.length !== 65 || point[0] !== 4 || point.toString("base64url") !== value) return null;
    return ECDH.convertKey(point, "prime256v1").equals(point) ? sha256(point) : null;
  } catch { return null; }
}

export function dedicatedCleanerConfig(manager, candidate) {
  if (candidate?.projectId !== manager.projectId || candidate.messagingSenderId !== manager.messagingSenderId
    || !manager.apiKey || candidate.apiKey !== manager.apiKey) return null;
  return cleanerMessagingConfig(manager, candidate.appId);
}

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const relativeFile = /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/;
const safeHex = /^[a-f0-9]{64}$/;
const requiredSuites = ["unit", "manager-rules", "hub-rules", "webkit", "chromium", "guards", "worker-browser", "pilot-visual"];

export function validReleaseVerification(receipt, sha) {
  return receipt?.sha === sha && requiredSuites.every((name) => receipt.suites?.[name]?.exitCode === 0
    && Number.isSafeInteger(receipt.suites[name].passed) && receipt.suites[name].passed > 0);
}

export function validPhysicalVerification(receipt, { sha, appId, vapidFingerprint, hostingManifestSha256, pilotProject, pilotManifestSha256 }) {
  if (!appId || !safeHex.test(vapidFingerprint) || !safeHex.test(hostingManifestSha256)
    || !pilotProject || pilotProject === notificationProject || !safeHex.test(pilotManifestSha256)
    || receipt?.pilotProject !== pilotProject || receipt.pilotManifestSha256 !== pilotManifestSha256
    || !safeHex.test(receipt.pilotVapidFingerprint) || receipt.pilotVapidFingerprint === vapidFingerprint
    || receipt?.sha !== sha || receipt.appId !== appId || receipt.vapidFingerprint !== vapidFingerprint
    || receipt.hostingManifestSha256 !== hostingManifestSha256 || receipt.environment !== "isolated-pilot"
    || receipt.releaseAuthorized !== true || !Array.isArray(receipt.observations)
    || receipt.observations.length !== 4) return false;
  const expected = new Set(["manager:ios-home-screen", "manager:android", "cleaner:ios-home-screen", "cleaner:android"]);
  return receipt.observations.every((row) => row && expected.delete(`${row.role}:${row.platform}`)
    && /^[a-zA-Z0-9_-]{1,100}$/.test(row.evidenceId ?? "")
    && ["permissionGranted", "registered", "providerAccepted", "displayed", "opened", "inboxAvailable"]
      .every((field) => row[field] === true));
}

export function baselineEvidence(receiptBytes, manifestBytes, manifest) {
  let receipt;
  try { receipt = JSON.parse(receiptBytes); } catch { return null; }
  const binding = { receiptHash: sha256(receiptBytes), manifestHash: sha256(manifestBytes) };
  if (receipt?.state !== "COMPLETE" || receipt.mutexReleased !== true || receipt.project !== notificationProject
    || receipt.sha !== liveHostingBaseline.sha || receipt.manifestHash !== liveHostingBaseline.manifestHash
    || binding.manifestHash !== liveHostingBaseline.manifestHash
    || receipt.candidateVersion !== liveHostingBaseline.hostingVersion
    || receipt.snapshot?.hosting?.version !== liveHostingBaseline.hostingVersion
    || manifest.buildId !== liveHostingBaseline.sha || manifest.projectId !== notificationProject
    || manifest.environment !== "production" || !receipt.snapshot.functions) return null;
  return { ...binding, snapshot: receipt.snapshot };
}

export async function readPublishedAssets(manifest) {
  if (manifest.projectId !== notificationProject || manifest.environment !== "production"
    || !Array.isArray(manifest.files) || manifest.files.length > 60
    || new Set(manifest.files.map((row) => row.file)).size !== manifest.files.length
    || manifest.files.some(({ file, sha256: hash }) => !relativeFile.test(file)
      || file.split("/").some((part) => part.startsWith(".")) || !safeHex.test(hash))) {
    throw new Error("Previous Hosting manifest is invalid.");
  }
  const rows = await Promise.all(manifest.files.map(async ({ file, sha256: hash }) => {
    try {
      const response = await fetch(new URL(file, origin + "/"), { redirect: "error", signal: AbortSignal.timeout(12_000) });
      if (!response.ok) return { file, matched: false };
      const bytes = Buffer.from(await response.arrayBuffer());
      return { file, matched: sha256(bytes) === hash, bytes };
    } catch { return { file, matched: false }; }
  }));
  return rows;
}

function checkedWebEnvironment(directory) {
  // A release uses one explicit, local environment source. Shell VITE overrides
  // could otherwise make the manifest refer to a different Firebase app.
  for (const name of Object.keys(process.env)) if (name.startsWith("VITE_")) delete process.env[name];
  const source = loadEnv("production", resolve(directory), "VITE_");
  const names = [...Object.values(webFields).map((key) => "VITE_FIREBASE_" + key), ...optionalWebEnv];
  const env = Object.fromEntries(names.map((name) => [name, source[name] || ""]));
  env.VITE_FIREBASE_CLEANER_MESSAGING_APP_ID = "";
  env.VITE_AUTOMATIC_OFFERS_MODE = "disabled";
  env.VITE_NOTIFICATION_INBOX_MODE = "enabled";
  env.VITE_USE_FIREBASE_EMULATORS = "false";
  env.VITE_CLEANFLOW_PRIVATE_EMULATOR_ORIGIN = "";
  env.VITE_CLEANFLOW_ENV = "production";
  const manager = Object.fromEntries(Object.entries(webFields).map(([key, suffix]) => [key, env["VITE_FIREBASE_" + suffix]]));
  return { env, manager };
}

function verifyFunctions(stage, cloud, candidateNames) {
  const names = cloud.functions.map(({ id }) => id).sort();
  const expected = candidateNames.filter((name) => !deployGroups.defer.includes(name)
    && (stage !== "A" || !deployGroups.create.includes(name)));
  return cloud.functionsComplete && JSON.stringify(names) === JSON.stringify(expected)
    && cloud.functions.every(({ state, runtime, region, revision, maxInstances }) =>
      state === "ACTIVE" && runtime === "nodejs22" && region === "us-central1" && revision && maxInstances === 20)
    && cloud.functions.filter(({ id }) => ["sendTodayExecutionReminder", "sendTomorrowPlanningReminder"].includes(id))
      .every(({ managerFcm }) => managerFcm === true)
    && (stage === "A" || cloud.functions.filter(({ id }) =>
      ["listNotificationInbox", "markNotificationRead", "openNotificationInboxItem"].includes(id))
      .every(({ inboxMode }) => inboxMode === "enabled"))
    && cloud.noPendingFunctionOperations;
}

function declaredFunctions() {
  const sdk = resolve(root, "functions/node_modules/firebase-functions/lib/runtime/loader.js");
  return require(sdk).loadStack(resolve(root, "functions"));
}

async function preflight(options) {
  const { stage, sha, "env-dir": envDir, "previous-manifest": previousManifest, verification, build } = options;
  const compatibility = options.compatibility === true;
  if (compatibility && (stage !== "A" || !build)) throw new Error("Compatibility mode requires a Release A build.");
  if (!["A", "B"].includes(stage) || !/^[a-f0-9]{40}$/.test(sha || "") || !envDir || !previousManifest) {
    throw new Error("Use --stage A|B --sha <40-character SHA> --env-dir <local path> --previous-manifest <verified prior manifest>.");
  }
  const blockers = [];
  const checks = {};
  function check(name, ok, reason) {
    checks[name] = Boolean(ok);
    if (!ok) blockers.push(reason);
  }
  const head = git("rev-parse", "HEAD");
  const branch = git("branch", "--show-current");
  check("worktree", head === sha && branch === (stage === "A" ? expectedBranch : releaseBBranch) && git("rev-parse", "--show-toplevel") === root
    && resolve(process.cwd()) === root && !git("status", "--porcelain"),
  "Use the clean Issue 85 worktree at the requested SHA.");
  check("runtime", process.versions.node.split(".")[0] === "22"
    && JSON.parse(readFileSync(resolve(root, "functions/package.json"), "utf8")).engines.node === "22",
  "Node 22 is required for the candidate and Functions.");
  const sdkVersion = require("firebase/package.json").version;
  const messagingVersion = require("@firebase/messaging/package.json").version;
  const { env, manager } = checkedWebEnvironment(envDir);
  if (compatibility) env.VITE_NOTIFICATION_INBOX_MODE = "disabled";
  const localVapid = env.VITE_FIREBASE_VAPID_KEY;
  const vapidFingerprint = validVapidFingerprint(localVapid);
  const previousBytes = readFileSync(resolve(previousManifest));
  const previous = JSON.parse(previousBytes);
  const baseline = stage === "B" && options["baseline-receipt"]
    ? baselineEvidence(readFileSync(resolve(options["baseline-receipt"])), previousBytes, previous) : null;
  check("previousManifest", stage === "A"
    ? previous.buildId === deployedSha && sha256(previousBytes) === deployedManifestHash
    : baseline, "Supply the recorded Hub manifest for A, or the COMPLETE Definitive UI Hosting receipt and its manifest for B.");

  // SDK discovery imports declarations only, under a demo identity.
  process.env.GCLOUD_PROJECT = "demo-cleanflow";
  const stack = await declaredFunctions();
  const declarations = Object.keys(stack.endpoints).sort();
  check("functionAllowlist", [...deployGroups.create, ...deployGroups.update].every((name) => declarations.includes(name))
    && new Set([...deployGroups.create, ...deployGroups.update]).size === deployGroups.create.length + deployGroups.update.length,
  "A named Function is missing or repeated.");
  const [staticAssets, production] = await Promise.all([
    readPublishedAssets(previous),
    readNotificationProduction(stage, manager.appId).catch(() => null),
  ]);
  const cloud = production?.report;
  const staticMatches = staticAssets.filter((row) => row.matched).length;
  check("publishedFiles", staticMatches > 0 && staticMatches === staticAssets.length,
    "Public Hosting bytes differ from the previous manifest.");
  const previousWorker = staticAssets.find((row) => row.file === "firebase-messaging-sw.js" && row.matched)?.bytes;
  const managerConfigMatch = manager.projectId === notificationProject && Boolean(previousWorker)
    && Object.values(manager).every((value) => value && previousWorker.includes(JSON.stringify(value)));
  check("managerFirebaseBinding", managerConfigMatch && cloud?.managerAppRegistered,
    "The local manager Firebase binding must match the verified published worker and registered Web app.");
  check("productionHosting", Boolean(cloud?.hostingVersion) && (stage === "B" || cloud.hostingVersion === "53fd5625bddc1d95"),
    "Authenticated Hosting release metadata is unavailable or different.");
  const expectedRules = execFileSync("git", ["show", `${stage === "A" ? deployedSha : publishedReleaseASha}:firestore.rules`], { cwd: root });
  check("productionRules", cloud?.firestoreRulesSha256 === sha256(expectedRules)
    && (stage === "B" || cloud.ruleset === oldRuleset), "Live Firestore Rules differ or could not be verified.");
  check("productionFunctions", cloud && verifyFunctions(stage, cloud, declarations), "Live Functions inventory, runtime, or cleaner mode differs.");
  check("iam", cloud?.iam.ok, "The caller's scoped deployment permissions could not be verified.");
  check("deploymentPrerequisites", (stack.requiredAPIs || []).every(({ api }) => releaseApis.includes(api))
    && cloud?.deploymentPrerequisites.existingServiceAgents && cloud.deploymentPrerequisites.artifactCleanupConfigured
    && cloud.deploymentPrerequisites.unavailableApis.length === 0,
  "A deploy API, established service agent or artifact cleanup policy is unavailable.");
  check("reminderSchedules", cloud?.reminderSchedules.length === 2
    && cloud.reminderSchedules.every(({ compatible }) => compatible), "Published reminder schedules differ.");
  check("runtimeConfiguration", cloud?.functions.filter(({ id }) => deployGroups.update.includes(id))
    .every(({ runtimeCompatible }) => runtimeCompatible), "A targeted Function has unreviewed environment or secret version drift.");
  check("releaseLock", cloud?.releaseLock.state === "AVAILABLE",
    "The Production release mutex is held or unavailable.");
  check("managerVapid", vapidFingerprint && staticAssets.some((row) => row.matched && row.file.endsWith(".js") && row.bytes.includes(localVapid)),
    "The local public VAPID key must match a verified live asset and be a valid P-256 point.");
  check("fcmApis", cloud?.fcmRegistrationApi === "ENABLED" && cloud.fcmDeliveryApi === "ENABLED",
    "FCM Registration or Delivery API is unavailable.");
  const cleaner = dedicatedCleanerConfig(manager, production?.dedicatedApp);
  const oldCleanerWorker = staticAssets.find((row) => row.file === "cleaner-messaging-sw.js" && row.matched)?.bytes;
  if (stage === "B") {
    const version = staticAssets.find((row) => row.file === "version.json" && row.matched)?.bytes;
    const versionInfo = version && JSON.parse(version);
    check("baselineLive", oldCleanerWorker?.toString() === "// Cleaner push is disabled for this build.\n"
      && versionInfo?.buildId === liveHostingBaseline.sha && !versionInfo.deploymentId,
    "Release B requires the live Definitive UI build and its disabled cleaner worker.");
    let matchesBaseline = false;
    try {
      matchesBaseline = Boolean(baseline && JSON.stringify(productionSnapshot(cloud)) === JSON.stringify(baseline.snapshot));
    } catch { /* incomplete inventory fails closed */ }
    check("baselineDrift", matchesBaseline, "Live Hosting, Rules, schedules or Functions differ from the COMPLETE Definitive UI receipt.");
    check("dedicatedCleanerApp", cleaner, "A distinct registered Web app with the same project, sender and public API binding is required.");
    check("consoleVapidAttestation", vapidFingerprint && options["vapid-console-sha256"] === vapidFingerprint,
      "Compare the public VAPID key fingerprint from Firebase Console before Release B.");
  }
  const receipt = verification && JSON.parse(readFileSync(resolve(verification), "utf8"));
  check("candidateVerification", validReleaseVerification(receipt, sha),
    "Supply the final test receipt bound to the candidate SHA.");

  let manifest = null;
  const buildGates = ["worktree", "runtime", "previousManifest", "managerFirebaseBinding", "managerVapid"];
  if (stage === "B") buildGates.push("previousManifest", "baselineLive", "baselineDrift", "dedicatedCleanerApp", "consoleVapidAttestation");
  if (build && buildGates.every((name) => checks[name])) {
    if (stage === "B") {
      env.VITE_FIREBASE_CLEANER_MESSAGING_APP_ID = cleaner.appId;
      env.VITE_CLEANFLOW_CLEANER_PUSH_PILOT = "enabled";
    }
    execFileSync("npm", ["run", "hosting:prepare", "--", sha, "production"], {
      cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"],
    });
    const dist = resolve(root, "dist");
    const publicFiles = git("ls-files", "public").split("\n").filter(Boolean).map((file) => file.slice(7));
    const current = inspectHostingBuild(dist, sha, publicFiles, { environment: "production", projectId: notificationProject });
    const preparedBytes = readFileSync(resolve(root, ".firebase/hosting-prepared-manifest.json"));
    const worker = readFileSync(resolve(dist, "cleaner-messaging-sw.js"), "utf8");
    const managerWorker = readFileSync(resolve(dist, "firebase-messaging-sw.js"), "utf8");
    if (stage === "B") {
      check("managerWorkerUnchanged", previousWorker?.toString() === managerWorker,
        "Release B must preserve the deployed manager worker bytes.");
      const agenda = JSON.parse(readFileSync(resolve(dist, "agenda.webmanifest"), "utf8"));
      const hosting = JSON.parse(readFileSync(resolve(root, "firebase.json"), "utf8")).hosting;
      const headers = hosting.headers.find((row) => row.source === "/cleaner-messaging-sw.js")?.headers;
      check("cleanerPilotHosting", agenda.id === "/agenda" && agenda.start_url === "/agenda"
        && agenda.scope === "/" && agenda.display === "standalone"
        && headers?.some((row) => row.key === "Service-Worker-Allowed" && row.value === "/cleaner-messaging-push/")
        && headers.some((row) => row.key === "Cache-Control" && row.value.includes("no-store")),
      "Cleaner manifest or scoped worker Hosting headers differ.");
    }
    check("managerWorker", managerWorker.includes(`firebasejs/${sdkVersion}/`)
      && Object.values(manager).every((value) => managerWorker.includes(JSON.stringify(value))),
    "The built manager worker has a different Firebase binding or SDK.");
    execFileSync(process.execPath, ["--check", resolve(dist, "cleaner-messaging-sw.js")], { stdio: "ignore" });
    const workerMatches = stage === "A" ? worker === "// Cleaner push is disabled for this build.\n"
      : worker.includes(JSON.stringify(cleaner.appId)) && worker.includes(`firebasejs/${sdkVersion}/`);
    check("cleanerWorker", workerMatches, "The built cleaner worker does not match the selected release stage.");
    check("manifest", JSON.stringify(current) === JSON.stringify(JSON.parse(preparedBytes).files),
      "Prepared Hosting manifest does not match the built files.");
    const version = JSON.parse(readFileSync(resolve(dist, "version.json"), "utf8"));
    const expectedVariant = compatibility ? `${sha}-inbox-off` : stage === "B" ? `${sha}-cleaner-push` : undefined;
    check("buildVariant", version.deploymentId === expectedVariant,
      "The Hosting update marker does not match the selected build variant.");
    manifest = { sha256: sha256(preparedBytes), files: current.length };
  }
  if (!manifest) check("manifest", false, "A stage-specific build manifest is required.");
  let physicalEvidence = null;
  if (stage === "B" && (options["physical-verification"] || options["pilot-manifest"])) {
    const physicalBytes = options["physical-verification"] && readFileSync(resolve(options["physical-verification"]));
    const pilotBytes = options["pilot-manifest"] && readFileSync(resolve(options["pilot-manifest"]));
    const pilot = pilotBytes && JSON.parse(pilotBytes);
    const sandbox = JSON.parse(readFileSync(resolve(root, ".firebaserc"), "utf8")).projects?.sandbox;
    const validPilotManifest = sandbox && sandbox !== notificationProject && pilot?.buildId === sha
      && pilot.environment === "sandbox" && pilot.projectId === sandbox
      && Array.isArray(pilot.files) && pilot.files.some(({ file, sha256: hash }) =>
        file === "cleaner-messaging-sw.js" && safeHex.test(hash)
        && hash !== sha256("// Cleaner push is disabled for this build.\n"));
    check("sandboxPilotManifest", validPilotManifest, "Supply the enabled-worker manifest from the authorized isolated Sandbox pilot at the candidate SHA.");
    const passed = validPhysicalVerification(physicalBytes && JSON.parse(physicalBytes), {
      sha, appId: cleaner?.appId, vapidFingerprint, hostingManifestSha256: manifest?.sha256,
      pilotProject: sandbox, pilotManifestSha256: validPilotManifest ? sha256(pilotBytes) : null,
    });
    check("physicalAuthorizationReceipt", passed,
      "Release B requires an authorized isolated pilot with observed manager and cleaner push on iPhone and Android, bound to the pilot and Production manifests.");
    if (passed) physicalEvidence = { receiptHash: sha256(physicalBytes), pilotManifestHash: sha256(pilotBytes) };
  }
  return {
    status: blockers.length ? "BLOCKED" : "DRY_RUN_READY",
    stage, sha, branch, compatibility, sdkVersion, messagingVersion, checks, blockers, manifest,
    ...(stage === "B" ? {
      baseline: baseline && { receiptHash: baseline.receiptHash, manifestHash: baseline.manifestHash },
      cleanerBinding: cleaner && vapidFingerprint
        ? { appIdHash: sha256(cleaner.appId), apiKeyHash: sha256(cleaner.apiKey), vapidFingerprint } : null,
      managerVapidFingerprint: vapidFingerprint,
      physicalEvidence,
      pilotPolicy: "explicit-device-approval",
      physicalAcceptance: physicalEvidence ? "SANDBOX_OBSERVED" : "PENDING",
    } : {}),
    production: cloud || null, publicHostingFiles: { matched: staticMatches, total: staticAssets.length },
    targets: stage === "A" ? { rules: ["firestore.rules"], hosting: true, functions: { create: deployGroups.create, update: deployGroups.update } }
      : { rules: [], hosting: true, updateBeforeHosting: deployGroups.inboxUpdate,
        createBeforeHosting: deployGroups.prepareB, createAfterHosting: deployGroups.enable },
    automaticOffersMode: "disabled",
    cleanerPushMode: stage === "A" ? "disabled" : "pilot",
    relevantSourceFiles: git("diff", "--name-only", `${deployedSha}..HEAD`, "--",
      "firebase.json", "firestore.rules", "functions/src", "vite.config.js").split("\n").filter(Boolean),
    setupAction: cloud?.dedicatedAppState === "MISSING" ? ["firebase", "apps:create", "WEB", dedicatedCleanerAppName,
      "--project", notificationProject] : null,
    rollback: { previousHostingVersion: cloud?.hostingVersion || null, previousRuleset: cloud?.ruleset || null,
      preserveMultiSessionCompatibility: true, disableCleanerPushFirst: stage === "B" },
    deploymentPerformed: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      stage: { type: "string" }, sha: { type: "string" }, "env-dir": { type: "string" },
      "previous-manifest": { type: "string" }, verification: { type: "string" },
      "pilot-manifest": { type: "string" },
      "baseline-receipt": { type: "string" },
      "vapid-console-sha256": { type: "string" }, "physical-verification": { type: "string" }, report: { type: "string" },
      build: { type: "boolean" }, compatibility: { type: "boolean" },
    } });
    const reportPath = resolve(root, values.report || `.tmp/notification-preflight-${values.stage}.json`);
    if (!relative(root, reportPath).startsWith(".tmp/")) throw new Error("Write the report under the ignored .tmp directory.");
    const report = await preflight(values);
    const serialized = JSON.stringify(report, null, 2) + "\n";
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, serialized);
    console.log(JSON.stringify({ status: report.status, stage: report.stage, blockers: report.blockers, reportPath }));
    if (report.blockers.length) process.exitCode = 2;
  } catch {
    console.error("Notification preflight could not complete. Check arguments, the checkout and the local evidence paths.");
    process.exitCode = 1;
  }
}
