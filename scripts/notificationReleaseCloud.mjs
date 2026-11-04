import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getGlobalDefaultAccount } = require("firebase-tools/lib/auth");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { Client } = require("firebase-tools/lib/apiv2");

export const notificationProject = "clean-flow-prototipo";
export const dedicatedCleanerAppName = "CleanFlow Cleaner Hub Messaging";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
    : value;
const unorderedRows = (rows) => rows.map(sortKeys)
  .sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)));

export function functionConfigurationHash(entry) {
  const normalized = sortKeys(entry);
  if (normalized.eventTrigger?.eventFilters) {
    normalized.eventTrigger.eventFilters = unorderedRows(normalized.eventTrigger.eventFilters);
  }
  if (normalized.serviceConfig?.secretEnvironmentVariables) {
    normalized.serviceConfig.secretEnvironmentVariables = unorderedRows(normalized.serviceConfig.secretEnvironmentVariables);
  }
  return sha256(JSON.stringify(normalized));
}
const projectPath = `projects/${notificationProject}`;
export const releaseApis = ["cloudfunctions", "cloudbuild", "artifactregistry", "run", "eventarc", "pubsub",
  "storage", "secretmanager", "cloudscheduler", "firestore", "firebasehosting"].map((name) => `${name}.googleapis.com`);
const hosts = {
  firebase: "https://firebase.googleapis.com",
  hosting: "https://firebasehosting.googleapis.com",
  rules: "https://firebaserules.googleapis.com",
  functions: "https://cloudfunctions.googleapis.com",
  iam: "https://iam.googleapis.com",
  resources: "https://cloudresourcemanager.googleapis.com",
  services: "https://serviceusage.googleapis.com",
  firestore: "https://firestore.googleapis.com",
  secrets: "https://secretmanager.googleapis.com",
  scheduler: "https://cloudscheduler.googleapis.com",
  artifacts: "https://artifactregistry.googleapis.com",
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
const basePermissions = [...TARGET_PERMISSIONS.hosting, ...TARGET_PERMISSIONS.functions,
  "serviceusage.services.use", "run.services.getIamPolicy", "run.services.setIamPolicy",
  "cloudscheduler.jobs.get", "cloudscheduler.jobs.update"];
const permissionsA = [...new Set([...basePermissions, ...TARGET_PERMISSIONS.storage,
  "cloudfunctions.functions.setIamPolicy", "firebaserules.releases.get"])];
const permissionsB = [...new Set([...basePermissions, "cloudfunctions.functions.setIamPolicy", "firebaserules.releases.get"])];
const database = `${projectPath}/databases/(default)`;
const releaseLockName = `${database}/documents/cleanflowReleaseControl/production`;
const lockPermissions = ["datastore.entities.get", "datastore.entities.create", "datastore.entities.delete"];
const managedEnv = new Set(["FIREBASE_CONFIG", "GCLOUD_PROJECT", "EVENTARC_CLOUD_EVENT_SOURCE", "FUNCTION_TARGET",
  "FUNCTION_SIGNATURE_TYPE", "FUNCTION_REGION", "LOG_EXECUTION_ID"]);
const developerSecret = "DEV_CENTER_DEVELOPER_UIDS";
const defaultEnv = {
  DEV_CENTER_SANDBOX_PROJECT_ID: [""],
  MANAGER_REMINDER_PROVIDER: ["fcm"],
  AUTOMATIC_OFFERS_MODE: ["disabled"],
  CLEANER_PUSH_MODE: ["disabled"],
  NOTIFICATION_INBOX_MODE: ["enabled", "disabled"],
};

function compatibleRuntime({ environmentVariables = {}, secretEnvironmentVariables = [], secretVolumes = [] }, secretVersion, allowCleanerPush = false) {
  return Object.entries(environmentVariables).every(([key, value]) =>
    managedEnv.has(key) || (allowCleanerPush && key === "CLEANER_PUSH_MODE" && value === "enabled")
    || Object.hasOwn(defaultEnv, key) && defaultEnv[key].includes(value))
    && secretVolumes.length === 0
    && secretEnvironmentVariables.every((ref) => ref.key === developerSecret && ref.secret === developerSecret
      && secretVersion.state === "ENABLED" && ref.version === secretVersion.name?.split("/").at(-1));
}
const lockDocument = () => query("firestore", `/v1/${releaseLockName}`);
const commitLock = (write) => query("firestore", `/v1/${database}/documents:commit`, { writes: [write] });

export function createLockWrite(name, operation) {
  const fields = Object.fromEntries(Object.entries(operation).map(([key, value]) => [key, { stringValue: value }]));
  return { update: { name, fields }, currentDocument: { exists: false } };
}

export function deleteLockWrite(name, updateTime) {
  return { delete: name, currentDocument: { updateTime } };
}

export async function acquireReleaseLock(operation) {
  const response = await commitLock(createLockWrite(releaseLockName, operation));
  const updateTime = response.writeResults?.[0]?.updateTime;
  if (!updateTime) {
    throw new Error("Production release lock unavailable. Verify its state before retrying.");
  }
  return updateTime;
}

export async function assertReleaseLock(updateTime) {
  const response = await lockDocument();
  if (response.updateTime !== updateTime) {
    throw new Error("Production release lock ownership changed.");
  }
}

export async function releaseReleaseLock(updateTime) {
  const response = await commitLock(deleteLockWrite(releaseLockName, updateTime));
  if (!response.commitTime) throw new Error("Release lock could not be removed conditionally.");
}

async function inspectIam(stage, functions) {
  const permissions = [...(stage === "A" ? permissionsA : permissionsB), ...lockPermissions];
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

async function inspectDeploymentPrerequisites() {
  const [project, policy, repository, ...apis] = await Promise.all([
    attempt(() => query("firebase", `/v1beta1/${projectPath}`)),
    attempt(() => query("resources", `/v1/${projectPath}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } })),
    attempt(() => query("artifacts", `/v1/${projectPath}/locations/us-central1/repositories/gcf-artifacts`)),
    ...releaseApis.map((api) => attempt(() => query("services", `/v1/${projectPath}/services/${api}`))),
  ]);
  return {
    unavailableApis: releaseApis.filter((_, index) => apis[index].state !== "ENABLED"),
    artifactCleanupConfigured: Object.keys(repository.cleanupPolicies || {}).length > 0,
    existingServiceAgents: Boolean(project.projectNumber) && ["pubsub", "eventarc"].every((service) =>
      policy.bindings?.some((entry) => entry.role === `roles/${service}.serviceAgent` && !entry.condition
        && entry.members?.includes(`serviceAccount:service-${project.projectNumber}@gcp-sa-${service}.iam.gserviceaccount.com`))),
  };
}

async function inspectReminderSchedules() {
  const expected = [["sendTomorrowPlanningReminder", "0 19 * * *"], ["sendTodayExecutionReminder", "0 7 * * *"]];
  const rows = await Promise.all(expected.map(async ([id, cron]) => {
    const path = `/v1/${projectPath}/locations/us-central1/jobs/firebase-schedule-${id}-us-central1`;
    const { state, schedule, timeZone, attemptDeadline, retryConfig, httpTarget } = await attempt(() => query("scheduler", path));
    return {
      id,
      compatible: state === "ENABLED" && schedule === cron && timeZone === "America/Los_Angeles"
        && attemptDeadline === "180s" && Boolean(httpTarget?.uri),
      hash: sha256(JSON.stringify(sortKeys({ state, schedule, timeZone, attemptDeadline, retryConfig, httpTarget }))),
    };
  }));
  return rows;
}

export async function readNotificationProduction(stage, managerAppId) {
  const account = getGlobalDefaultAccount();
  await requireAuth({ project: notificationProject, ...account });
  const [apps, hosting, rules, functions, registrationApi, deliveryApi, operations, lock, secretVersion, prerequisites, schedules] = await Promise.all([
    attempt(() => query("firebase", `/v1beta1/${projectPath}/webApps?pageSize=100`)),
    attempt(() => query("hosting", `/v1beta1/sites/${notificationProject}/releases?pageSize=1`)),
    attempt(() => query("rules", `/v1/${projectPath}/releases/cloud.firestore`)),
    attempt(() => query("functions", `/v2/${projectPath}/locations/-/functions?pageSize=100`)),
    attempt(() => query("services", `/v1/${projectPath}/services/fcmregistrations.googleapis.com`)),
    attempt(() => query("services", `/v1/${projectPath}/services/fcm.googleapis.com`)),
    attempt(() => query("functions", `/v2/${projectPath}/locations/us-central1/operations?filter=done%3Dfalse&pageSize=100`)),
    attempt(lockDocument),
    attempt(() => query("secrets", `/v1/${projectPath}/secrets/${developerSecret}/versions/latest`)),
    inspectDeploymentPrerequisites(),
    inspectReminderSchedules(),
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
    configurationHash: functionConfigurationHash(entry),
    runtimeCompatible: compatibleRuntime(entry.serviceConfig || {}, secretVersion,
      stage === "B" && /\/(registerCleanerPushDevice|notifyCleanerInboxEvent)$/.test(entry.name)),
    cleanerPushMode: entry.serviceConfig?.environmentVariables?.CLEANER_PUSH_MODE ?? "disabled",
    automaticOffersMode: entry.serviceConfig?.environmentVariables?.AUTOMATIC_OFFERS_MODE ?? "disabled",
    secretBindingHash: sha256(JSON.stringify(unorderedRows(entry.serviceConfig?.secretEnvironmentVariables || []))),
    maxInstances: entry.serviceConfig?.maxInstanceCount,
    ...(/\/(listNotificationInbox|markNotificationRead|openNotificationInboxItem)$/.test(entry.name)
      ? { inboxMode: entry.serviceConfig?.environmentVariables?.NOTIFICATION_INBOX_MODE || "default" } : {}),
    ...(/\/(sendTodayExecutionReminder|sendTomorrowPlanningReminder)$/.test(entry.name)
      ? { managerFcm: (entry.serviceConfig?.environmentVariables?.MANAGER_REMINDER_PROVIDER || "fcm") === "fcm" } : {}),
    ...(entry.name.endsWith("/notifyCleanerInboxEvent") || entry.name.endsWith("/registerCleanerPushDevice")
      ? { cleanerPushEnabled: entry.serviceConfig?.environmentVariables?.CLEANER_PUSH_MODE === "enabled" } : {}),
  })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    dedicatedApp: config && !config.error ? {
      appId: config.appId, projectId: config.projectId, messagingSenderId: config.messagingSenderId, apiKey: config.apiKey,
    } : null,
    report: {
      webAppCount: apps.error || apps.nextPageToken ? null : webApps.length,
      managerAppRegistered: webApps.some((entry) => entry.appId === managerAppId && entry.state !== "DELETED"),
      dedicatedAppState: apps.error || apps.nextPageToken ? "UNVERIFIED"
        : dedicated.length > 1 ? "AMBIGUOUS" : !selected ? "MISSING"
          : config?.error ? "CONFIG_UNVERIFIED" : "FOUND",
      hostingVersion: hosting.releases?.[0]?.version?.name?.split("/").at(-1) || null,
      hostingRelease: hosting.releases?.[0]?.name || null,
      ruleset: rules.rulesetName?.split("/").at(-1) || null,
      rulesUpdated: rules.updateTime || null,
      firestoreRulesSha256: ruleset?.source?.files?.find((entry) => entry.name === "firestore.rules")
        ? sha256(ruleset.source.files.find((entry) => entry.name === "firestore.rules").content) : null,
      functionsComplete: !functions.error && !functions.nextPageToken && !functions.unreachable?.length && rows.length > 0,
      functions: rows,
      fcmRegistrationApi: registrationApi.state || "UNVERIFIED",
      fcmDeliveryApi: deliveryApi.state || "UNVERIFIED",
      noPendingFunctionOperations: !operations.error && !operations.nextPageToken
        && !operations.operations?.some((operation) => !operation.done),
      releaseLock: { state: lock.error === 404 ? "AVAILABLE" : lock.updateTime ? "HELD" : "UNVERIFIED" },
      deploymentPrerequisites: prerequisites,
      reminderSchedules: schedules,
      iam,
    },
  };
}

function snapshotCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function productionSnapshot(report) {
  snapshotCondition(report?.functionsComplete && report.noPendingFunctionOperations && report.iam?.ok
    && report.deploymentPrerequisites?.existingServiceAgents && report.deploymentPrerequisites.unavailableApis.length === 0
    && report.deploymentPrerequisites.artifactCleanupConfigured
    && report.reminderSchedules?.length === 2 && report.reminderSchedules.every((schedule) => schedule.compatible)
    && report.hostingVersion && report.hostingRelease && report.ruleset && report.rulesUpdated
    && /^[a-f0-9]{64}$/.test(report.firestoreRulesSha256)
    && report.functions.filter((row) => ["sendTomorrowPlanningReminder", "sendTodayExecutionReminder"].includes(row.id))
      .every((row) => row.managerFcm === true)
    && report.functions.every((row) => row.state === "ACTIVE" && row.runtime === "nodejs22" && row.maxInstances === 20
      && row.region === "us-central1" && row.revision && /^[a-f0-9]{64}$/.test(row.configurationHash)),
  "Production inventory is incomplete, unavailable or busy.");
  return {
    hosting: { version: report.hostingVersion, release: report.hostingRelease },
    rules: { id: report.ruleset, hash: report.firestoreRulesSha256, updated: report.rulesUpdated },
    schedules: report.reminderSchedules,
    functions: Object.fromEntries(report.functions.map((row) => [row.id, {
      revision: row.revision, hash: row.configurationHash,
      secretBindingHash: row.secretBindingHash, runtimeCompatible: row.runtimeCompatible,
      ...(row.inboxMode ? { inboxMode: row.inboxMode } : {}),
    }]).sort(([a], [b]) => a.localeCompare(b))),
  };
}
