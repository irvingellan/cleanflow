import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "vite";
import {
  dedicatedCleanerAppName, notificationProject, productionSnapshot, readNotificationProduction, sha256,
} from "./notificationReleaseCloud.mjs";
import { dedicatedCleanerConfig, publishedReleaseASha, readPublishedAssets, validVapidFingerprint } from "./preflightNotificationRelease.mjs";

const root = resolve(import.meta.dirname, "..");
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

async function configure({ "a-dir": aDir, "env-dir": envDir, report, approve }) {
  ensure(aDir && envDir && report, "Use --a-dir, --env-dir and --report.");
  const output = resolve(report);
  ensure(relative(root, output).startsWith(".tmp/"), "Write the receipt under the ignored .tmp directory.");
  const plan = json(join(aDir, "release-plan.json"));
  const receipt = json(join(aDir, "publish-receipt.json"));
  const manifestFile = join(aDir, "hosting-manifest-A.json");
  const manifest = json(manifestFile);
  ensure(plan.project === notificationProject && plan.sha === publishedReleaseASha
    && receipt.state === "COMPLETE" && receipt.action === "publish" && receipt.sha === plan.sha
    && receipt.planHash === sha256(readFileSync(join(aDir, "release-plan.json")))
    && plan.manifests.A === sha256(readFileSync(manifestFile)) && manifest.buildId === plan.sha,
  "The exact COMPLETE Release A evidence is required.");
  const env = loadEnv("production", resolve(envDir), "VITE_");
  const fields = { appId: "APP_ID", projectId: "PROJECT_ID", apiKey: "API_KEY", authDomain: "AUTH_DOMAIN",
    storageBucket: "STORAGE_BUCKET", messagingSenderId: "MESSAGING_SENDER_ID" };
  const manager = Object.fromEntries(Object.entries(fields).map(([key, suffix]) => [key, env["VITE_FIREBASE_" + suffix]]));
  const vapid = env.VITE_FIREBASE_VAPID_KEY;
  const vapidFingerprint = validVapidFingerprint(vapid);
  const assets = await readPublishedAssets(manifest);
  const worker = assets.find((row) => row.file === "firebase-messaging-sw.js");
  ensure(manager.projectId === notificationProject && Object.values(manager).every(Boolean)
    && assets.length > 0 && assets.every((row) => row.matched) && worker
    && Object.values(manager).every((value) => worker.bytes.includes(JSON.stringify(value)))
    && vapidFingerprint && assets.some((row) => row.file.endsWith(".js") && row.bytes.includes(vapid)),
  "Production assets, manager Web binding or public VAPID do not match the reviewed Release A.");

  const inspect = async () => {
    const result = await readNotificationProduction("B", manager.appId);
    const { report: live } = result;
    ensure(JSON.stringify(productionSnapshot(live)) === JSON.stringify(receipt.snapshot)
      && live.releaseLock.state === "AVAILABLE" && live.managerAppRegistered
      && live.fcmRegistrationApi === "ENABLED" && live.fcmDeliveryApi === "ENABLED",
    "Production differs from the exact Release A receipt or FCM is unavailable.");
    ensure(["MISSING", "FOUND"].includes(live.dedicatedAppState), "Dedicated Web App inventory is ambiguous or unverified.");
    return result;
  };

  mkdirSync(resolve(root, ".tmp"), { recursive: true });
  const lock = resolve(root, ".tmp/configure-cleaner-messaging.lock");
  mkdirSync(lock, { mode: 0o700 });
  let action = "REUSED";
  try {
    let current = await inspect();
    if (current.report.dedicatedAppState === "MISSING" && approve === "create-cleaner-web-app") {
      const cli = join(root, "node_modules/firebase-tools/lib/bin/firebase.js");
      // One exact Web App registration. No Analytics, Hosting, API, billing
      // or IAM commands, and no retry when the mutation result is ambiguous.
      const result = spawnSync(process.execPath, [cli, "apps:create", "WEB", dedicatedCleanerAppName,
        "--project", notificationProject, "--non-interactive", "--json"], { cwd: root, encoding: "utf8" });
      action = result.status === 0 ? "CREATED" : "CREATE_RESULT_UNCERTAIN";
      current = await inspect();
      ensure(current.report.dedicatedAppState === "FOUND", "Web App creation could not be confirmed. Inspect inventory before retrying.");
    }
    if (current.report.dedicatedAppState === "MISSING") action = "MISSING";
    const cleaner = dedicatedCleanerConfig(manager, current.dedicatedApp);
    if (action !== "MISSING") ensure(cleaner, "The dedicated Web App exists but its public Firebase binding differs.");
    const result = { action, project: notificationProject, appName: dedicatedCleanerAppName,
      appId: cleaner?.appId ?? null, vapidFingerprint, vapidSource: "verified-live-manager-asset",
      releaseASha: plan.sha, releaseAUnchanged: true };
    writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally {
    rmdirSync(lock);
  }
}

try {
  const { values } = parseArgs({ options: {
    "a-dir": { type: "string" }, "env-dir": { type: "string" }, report: { type: "string" }, approve: { type: "string" },
  } });
  for (const key of ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT",
    "FIREBASE_CONFIG", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FUNCTIONS_EMULATOR"]) {
    ensure(!process.env[key], "Use the existing authenticated Firebase CLI session without environment overrides.");
  }
  ensure(process.versions.node.split(".")[0] === "22", "Use Node 22.");
  await configure(values);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
