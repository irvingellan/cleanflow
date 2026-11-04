import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getGlobalDefaultAccount } = require("firebase-tools/lib/auth");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { Client } = require("firebase-tools/lib/apiv2");

export const notificationProject = "clean-flow-prototipo";
export const dedicatedCleanerAppName = "CleanFlow Cleaner Hub Messaging";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const projectPath = `projects/${notificationProject}`;
const hosts = {
  firebase: "https://firebase.googleapis.com",
  hosting: "https://firebasehosting.googleapis.com",
  rules: "https://firebaserules.googleapis.com",
  functions: "https://cloudfunctions.googleapis.com",
  iam: "https://iam.googleapis.com",
  resources: "https://cloudresourcemanager.googleapis.com",
  services: "https://serviceusage.googleapis.com",
};

async function query(host, path, body) {
  const client = new Client({ urlPrefix: hosts[host] });
  const options = { timeout: 15_000, skipLog: { reqBody: true, resBody: true }, resolveOnHTTPError: true };
  const response = body ? await client.post(path, body, options) : await client.get(path, options);
  if (response.status !== 200) return { error: response.status };
  return response.body;
}

async function attempt(task) {
  try { return await task(); } catch { return { error: "UNAVAILABLE" }; }
}

const { TARGET_PERMISSIONS } = require("firebase-tools/lib/deploy");
const basePermissions = [...TARGET_PERMISSIONS.hosting, ...TARGET_PERMISSIONS.functions, "serviceusage.services.use"];
const permissionsA = [...new Set([...basePermissions, ...TARGET_PERMISSIONS.storage,
  "cloudfunctions.functions.setIamPolicy", "firebaserules.releases.get"])];
const permissionsB = basePermissions;

async function inspectIam(stage, functions) {
  const permissions = stage === "A" ? permissionsA : permissionsB;
  const project = await attempt(() => query("resources", `/v1/${projectPath}:testIamPermissions`, { permissions }));
  const identities = [...new Set(functions.map((entry) => entry.serviceConfig?.serviceAccountEmail).filter(Boolean))];
  const results = await Promise.all(identities.map((identity) => attempt(() => query("iam",
    `/v1/projects/-/serviceAccounts/${encodeURIComponent(identity)}:testIamPermissions`,
    { permissions: ["iam.serviceAccounts.actAs"] }))));
  return {
    projectProbe: project.error || "OK",
    missingProjectPermissions: permissions.filter((name) => !project.permissions?.includes(name)),
    runtimeIdentitiesChecked: identities.length,
    runtimeActAsVerified: results.filter((row) => row.permissions?.includes("iam.serviceAccounts.actAs")).length,
    ok: !project.error && permissions.every((name) => project.permissions?.includes(name))
      && identities.length > 0 && results.every((row) => row.permissions?.includes("iam.serviceAccounts.actAs")),
  };
}

export async function readNotificationProduction(stage, managerAppId) {
  const account = getGlobalDefaultAccount();
  await requireAuth({ project: notificationProject, ...account });
  const [apps, hosting, rules, functions, registrationApi, deliveryApi] = await Promise.all([
    attempt(() => query("firebase", `/v1beta1/${projectPath}/webApps?pageSize=100`)),
    attempt(() => query("hosting", `/v1beta1/sites/${notificationProject}/releases?pageSize=1`)),
    attempt(() => query("rules", `/v1/${projectPath}/releases/cloud.firestore`)),
    attempt(() => query("functions", `/v2/${projectPath}/locations/-/functions?pageSize=100`)),
    attempt(() => query("services", `/v1/${projectPath}/services/fcmregistrations.googleapis.com`)),
    attempt(() => query("services", `/v1/${projectPath}/services/fcm.googleapis.com`)),
  ]);
  const webApps = apps.apps || [];
  const dedicated = webApps.filter((entry) => entry.displayName === dedicatedCleanerAppName && entry.state !== "DELETED");
  const selected = dedicated.length === 1 && !apps.nextPageToken ? dedicated[0] : null;
  const [config, ruleset, iam] = await Promise.all([
    selected && attempt(() => query("firebase", `/v1beta1/${projectPath}/webApps/${encodeURIComponent(selected.appId)}/config`)),
    rules.rulesetName && attempt(() => query("rules", `/v1/${rules.rulesetName}`)),
    inspectIam(stage, functions.functions || []),
  ]);
  const rows = (functions.functions || []).map((entry) => ({
    id: entry.name.split("/").at(-1),
    region: entry.name.split("/").at(-3),
    state: entry.state,
    runtime: entry.buildConfig?.runtime,
    revision: entry.serviceConfig?.revision || null,
    maxInstances: entry.serviceConfig?.maxInstanceCount,
    ...(/\/(sendTodayExecutionReminder|sendTomorrowPlanningReminder)$/.test(entry.name)
      ? { managerFcm: (entry.serviceConfig?.environmentVariables?.MANAGER_REMINDER_PROVIDER || "fcm") === "fcm" } : {}),
    ...(entry.name.endsWith("/notifyCleanerInboxEvent") || entry.name.endsWith("/registerCleanerPushDevice")
      ? { cleanerPushEnabled: entry.serviceConfig?.environmentVariables?.CLEANER_PUSH_MODE === "enabled" } : {}),
  })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    dedicatedApp: config && !config.error ? {
      appId: config.appId, projectId: config.projectId, messagingSenderId: config.messagingSenderId,
    } : null,
    report: {
      webAppCount: apps.error || apps.nextPageToken ? null : webApps.length,
      managerAppRegistered: webApps.some((entry) => entry.appId === managerAppId && entry.state !== "DELETED"),
      dedicatedAppState: apps.error || apps.nextPageToken ? "UNVERIFIED"
        : dedicated.length > 1 ? "AMBIGUOUS" : !selected ? "MISSING"
          : config?.error ? "CONFIG_UNVERIFIED" : "FOUND",
      hostingVersion: hosting.releases?.[0]?.version?.name?.split("/").at(-1) || null,
      ruleset: rules.rulesetName?.split("/").at(-1) || null,
      firestoreRulesSha256: ruleset?.source?.files?.find((entry) => entry.name === "firestore.rules")
        ? sha256(ruleset.source.files.find((entry) => entry.name === "firestore.rules").content) : null,
      functionsComplete: !functions.error && !functions.nextPageToken && !functions.unreachable?.length && rows.length > 0,
      functions: rows,
      fcmRegistrationApi: registrationApi.state || "UNVERIFIED",
      fcmDeliveryApi: deliveryApi.state || "UNVERIFIED",
      iam,
    },
  };
}
