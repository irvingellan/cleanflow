import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getRuntimeChoice } = require("firebase-tools/lib/deploy/functions/runtimes/node/parseRuntimeAndValidateSDK.js");
const root = path.resolve(import.meta.dirname, "..");

test("Firebase deployment consumer selects Node22 for this Functions source", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "firebase.json")));
  assert.equal(getRuntimeChoice(path.join(root, config.functions.source), config.functions.runtime), "nodejs22");
});

test("Policy B emits explicit20 while preserving all other external service options", async () => {
  // Importing declarations performs no requests; use only a credential-free demo identity.
  process.env.GCLOUD_PROJECT = "demo-cleanflow";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/private/tmp/cleanflow-no-credentials";
  assert.equal(fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS), false);
  const handlers = await import("../functions/src/index.js");
  const endpoints = Object.entries(handlers).filter(([, value]) => value.__endpoint);
  assert.equal(endpoints.length, 55);
  for (const [name, handler] of endpoints) {
    const endpoint = JSON.parse(JSON.stringify(handler.__endpoint));
    assert.deepEqual(endpoint.region, ["us-central1"], name);
    assert.equal(endpoint.maxInstances, 20, `${name} must declare the approved numeric maximum`);
    if (name === "publicChecklist") assert.equal(endpoint.timeoutSeconds, 60, "Multi-Photo upload deadline must survive Policy B");
    for (const option of ["minInstances", "serviceAccountEmail", "vpc", "ingressSettings", "concurrency"]) {
      assert.equal(Object.hasOwn(endpoint, option), false, `${name} must preserve external ${option}, not emit a reset`);
    }
  }
});

test("all 55 candidate declarations produce explicit20 in actual CLI JSON and update masks without invoking handlers", async () => {
  process.env.GCLOUD_PROJECT = "demo-cleanflow";
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "demo-cleanflow" });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/private/tmp/cleanflow-no-credentials";
  assert.equal(fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS), false);
  const sdkRoot = path.join(root, "functions/node_modules/firebase-functions");
  const { loadStack } = require(path.join(sdkRoot, "lib/runtime/loader.js"));
  const { stackToWire } = require(path.join(sdkRoot, "lib/runtime/manifest.js"));
  const { buildFromV1Alpha1 } = require("firebase-tools/lib/deploy/functions/runtimes/discovery/v1alpha1");
  const build = require("firebase-tools/lib/deploy/functions/build");
  const gcf = require("firebase-tools/lib/gcp/cloudfunctionsv2");
  const { Client } = require("firebase-tools/lib/apiv2");
  const wire = stackToWire(await loadStack(path.join(root, "functions")));
  const candidate = buildFromV1Alpha1(wire, "demo-cleanflow", "us-central1", "nodejs22");
  const expected = ["abandonChecklistRunAndCompleteJob", "approveChecklistRun", "assignCleanerDirectly", "clearDevCenterData", "completeJobWithoutChecklist", "createAutomaticJobOffers", "createChecklistRun", "createClientReport", "deactivateManagerPushDevice", "generateDevCenterScenario", "getChecklistCapability", "getChecklistEvidence", "getChecklistRun", "getClientReportCapability", "getDevCenterAccess", "getManagerNotificationDiagnostics", "issueChecklistCapability", "previewManagerReminder", "registerManagerPushDevice", "reportManagerNotificationHealth", "rescheduleJob", "revokeChecklistCapability", "revokeClientReport", "sendCurrentManagerTestNotification", "sendDeveloperTestNotification", "submitFeedback", "notifyManagersChecklistReadyForReview", "notifyManagersOperationalEvent", "publicChecklist", "publicClientReport", "publicOffer", "sendTodayExecutionReminder", "sendTomorrowPlanningReminder", "issueCleanerAccessCode", "redeemCleanerAccessCode", "revokeCleanerHubAccess", "openMyChecklist", "respondToMyOffer", "syncCleanerAgendaOnJobWrite", "syncCleanerAgendaOnAssignmentWrite", "syncCleanerAgendaOnOfferWrite",
    "listNotificationInbox", "markNotificationRead", "openNotificationInboxItem",
    "registerCleanerPushDevice", "deactivateCleanerPushDevice", "getCleanerPushDeviceStatus", "notifyCleanerInboxEvent", "cleanerPushTest", "syncCleanerAgendaOnChecklistRunWrite", "syncCleanerAgendaOnChecklistStart", "getMyJobAccess", "submitChecklistRunForReview", "setReportPhotoVisibility", "getJobPhotoCounts"].sort();
  const resolved = await build.resolveBackend({ build: candidate, firebaseConfig: { projectId: "demo-cleanflow" }, userEnvs: { DEV_CENTER_SANDBOX_PROJECT_ID: "", MANAGER_REMINDER_PROVIDER: "fcm" }, nonInteractive: true, isEmulator: true });
  const endpoints = Object.values(resolved.backend.endpoints).flatMap(region => Object.values(region));
  assert.deepEqual(endpoints.map(endpoint => endpoint.id).sort(), expected);
  const original = Client.prototype.request;
  const captured = [];
  Client.prototype.request = async function (options) { captured.push(options); return { body: { name: "synthetic-operation" } }; };
  try {
    for (const endpoint of endpoints) await gcf.updateFunction(gcf.functionFromEndpoint(endpoint));
  } finally { Client.prototype.request = original; }
  assert.equal(captured.length, expected.length);
  for (const request of captured) {
    const body = JSON.parse(JSON.stringify(request.body));
    assert.equal(request.method, "PATCH");
    assert.equal(body.serviceConfig.maxInstanceCount, 20, body.name);
    assert.equal(body.buildConfig.runtime, "nodejs22", body.name);
    if (body.name.endsWith("/publicChecklist")) assert.equal(body.serviceConfig.timeoutSeconds, 60);
    assert(request.queryParams.updateMask.split(",").includes("serviceConfig.maxInstanceCount"), body.name);
  }
});
