import assert from "node:assert/strict";
import test from "node:test";
import { runReleaseSequence } from "./releaseNotificationA.mjs";
import { releaseBDeploymentArgs, releaseBSnapshot, releaseBSteps, verifiedBReceipt, verifyBStep } from "./releaseNotificationB.mjs";

const inboxNames = ["listNotificationInbox", "markNotificationRead", "openNotificationInboxItem"];
const row = (id, fields = {}) => ({
  id, revision: "initial", state: "ACTIVE", region: "us-central1", runtime: "nodejs22", maxInstances: 20,
  configurationHash: "a".repeat(64), secretBindingHash: "b".repeat(64), runtimeCompatible: true,
  automaticOffersMode: "disabled", cleanerPushMode: "disabled", ...fields,
});
const report = {
  functionsComplete: true, noPendingFunctionOperations: true, iam: { ok: true },
  deploymentPrerequisites: { existingServiceAgents: true, unavailableApis: [], artifactCleanupConfigured: true },
  reminderSchedules: [{ compatible: true }, { compatible: true }],
  hostingVersion: "A", hostingRelease: "live-A", ruleset: "rule-A", rulesUpdated: "original",
  firestoreRulesSha256: "c".repeat(64),
  functions: [
    ...inboxNames.map((name) => row(name, { inboxMode: "enabled" })),
    row("sendTomorrowPlanningReminder", { managerFcm: true }),
    row("sendTodayExecutionReminder", { managerFcm: true }),
  ],
};
const baseline = releaseBSnapshot(report);

test("publishes four exact transport Functions and keeps the sender last", () => {
  assert.deepEqual(releaseBSteps.publish.map((step) => step.only), [
    "functions:getCleanerPushDeviceStatus,functions:deactivateCleanerPushDevice",
    "hosting",
    "functions:registerCleanerPushDevice",
    "functions:notifyCleanerInboxEvent",
  ]);
  assert.deepEqual(releaseBSteps.rollback.map((step) => step.only), [
    "functions:notifyCleanerInboxEvent",
    "functions:registerCleanerPushDevice",
    "hosting",
  ]);
  assert.ok(releaseBSteps.rollback.filter((step) => step.functions).every((step) => step.cleanerPushMode === "disabled"));
  assert.deepEqual(releaseBDeploymentArgs("rollback", releaseBSteps.rollback.at(-1), baseline).slice(-3),
    ["--config", "firebase-rollback.json", "--non-interactive"]);
});

test("explicitly acknowledges new retry policy only for the absent sender", () => {
  const sender = releaseBSteps.publish.at(-1);
  const disabledSender = releaseBSteps.rollback[0];
  assert.ok(releaseBDeploymentArgs("publish", sender, baseline).includes("--force"));
  for (const step of releaseBSteps.publish.slice(0, -1)) {
    assert.ok(!releaseBDeploymentArgs("publish", step, baseline).includes("--force"));
  }
  assert.ok(!releaseBDeploymentArgs("rollback", disabledSender, baseline).includes("--force"));
  const alreadyCreated = { functions: { notifyCleanerInboxEvent: {} } };
  assert.throws(() => releaseBDeploymentArgs("publish", sender, alreadyCreated), /reconcile/);
  assert.throws(() => releaseBDeploymentArgs("publish", { ...sender, only: "functions" }, baseline), /Unreviewed/);
});

test("rejects A rollback state, #86 drift and unrelated cleaner-push enablement", () => {
  for (const fields of [{ inboxMode: "disabled" }, { automaticOffersMode: "enabled" }, { cleanerPushMode: "enabled" }]) {
    const drift = { ...report, functions: [row(inboxNames[0], { inboxMode: "enabled", ...fields }), ...report.functions.slice(1)] };
    assert.throws(() => releaseBSnapshot(drift), /Inbox-enabled|unexpected/);
  }
  const newSender = row("notifyCleanerInboxEvent", { cleanerPushMode: "enabled" });
  assert.equal(releaseBSnapshot({ ...report, functions: [...report.functions, newSender] })
    .functions.notifyCleanerInboxEvent.cleanerPushMode, "enabled");
  assert.throws(() => releaseBSnapshot({ ...report, functions: [...report.functions, row("createAutomaticJobOffers")] }),
    /manual-offer/);
});

test("only an exact completed receipt can confirm an idempotent repeat", () => {
  const expected = { action: "publish", sha: "sha", planHash: "plan", artifactHash: "assets", snapshot: baseline };
  const receipt = { schema: 1, state: "COMPLETE", ...expected };
  assert.ok(verifiedBReceipt(receipt, expected));
  for (const change of [
    { state: "DEPLOYING" }, { action: "rollback" }, { sha: "another" }, { planHash: "another" },
    { artifactHash: "another" }, { snapshot: { ...baseline, hosting: { version: "drift" } } },
  ]) assert.ok(!verifiedBReceipt({ ...receipt, ...change }, expected));
});

test("release sequence stops before enrollment on unverified Hosting or target mode drift", async () => {
  const exercised = [];
  const setup = async ({ hosted = true, driftMode = false } = {}) => {
    let state = baseline;
    return runReleaseSequence({
      initial: baseline, steps: releaseBSteps.publish, inboxMode: "enabled",
      inspect: async () => state, verifyLock: async () => {},
      deploy: async (step) => {
        exercised.push(step.id);
        if (step.id === "hosting") {
          state = { ...state, hosting: { version: "B", release: "live-B" } };
          return;
        }
        const functions = { ...state.functions };
        for (const name of step.functions) {
          functions[name] = { runtimeCompatible: true, revision: "new", hash: "reviewed",
            cleanerPushMode: driftMode ? "enabled" : step.cleanerPushMode };
        }
        state = { ...state, functions };
      },
      verifyAssets: async () => { if (!hosted) throw new Error("Unverified Hosting bytes"); },
      journal(phase, id, snapshot) {
        if (phase === "VERIFIED") verifyBStep(snapshot, releaseBSteps.publish.find((step) => step.id === id));
      },
    });
  };
  const [prepare, hosting, registration, sender] = releaseBSteps.publish.map((step) => step.id);
  await assert.rejects(setup({ hosted: false }), /Unverified Hosting/);
  assert.deepEqual(exercised.splice(0), [prepare, hosting]);
  await assert.rejects(setup({ driftMode: true }), /unexpected cleaner push mode/);
  assert.deepEqual(exercised.splice(0), [prepare]);
  await setup();
  assert.deepEqual(exercised, [prepare, hosting, registration, sender]);
});

test("rollback disables both transport Functions and retains Inbox and all four Functions", async () => {
  const transport = releaseBSteps.publish.flatMap((step) => step.functions || []);
  const enabled = new Set(["registerCleanerPushDevice", "notifyCleanerInboxEvent"]);
  const initial = {
    ...baseline,
    hosting: { version: "B", release: "live-B" },
    functions: {
      ...baseline.functions,
      ...Object.fromEntries(transport.map((name) => [name, { revision: "B", hash: "enabled",
        secretBindingHash: "none", runtimeCompatible: true, cleanerPushMode: enabled.has(name) ? "enabled" : "disabled" }])),
    },
  };
  let state = initial;
  let assetsChecked = false;
  const result = await runReleaseSequence({
    initial, steps: releaseBSteps.rollback, inboxMode: "enabled",
    inspect: async () => state, verifyLock: async () => {},
    deploy: async (step) => {
      if (step.id === "hosting") {
        assert.ok(transport.every((name) => state.functions[name].cleanerPushMode === "disabled"));
        state = { ...state, hosting: { version: "A-restored", release: "live-A-restored" } };
        return;
      }
      const [name] = step.functions;
      const next = { ...state.functions[name], revision: "rollback", hash: "disabled", cleanerPushMode: step.cleanerPushMode };
      state = { ...state, functions: { ...state.functions, [name]: next } };
    },
    verifyAssets: async () => { assetsChecked = true; },
    journal(phase, id, snapshot) {
      if (phase === "VERIFIED") verifyBStep(snapshot, releaseBSteps.rollback.find((step) => step.id === id));
    },
  });
  assert.ok(assetsChecked);
  assert.deepEqual(Object.keys(result.functions), Object.keys(initial.functions));
  for (const name of [...inboxNames, "getCleanerPushDeviceStatus", "deactivateCleanerPushDevice"]) {
    assert.deepEqual(result.functions[name], initial.functions[name]);
  }
  assert.deepEqual(result.rules, initial.rules);
  assert.deepEqual(result.schedules, initial.schedules);
});
