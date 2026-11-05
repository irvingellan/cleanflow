import assert from "node:assert/strict";
import test from "node:test";
import { runReleaseSequence } from "./releaseNotificationA.mjs";
import { transportFunctions, verifyBStep } from "./releaseNotificationB.mjs";
import { checkTransportRelease, deploymentArgs, serverScopeChanges, updateSteps } from "./releaseNotificationBUpdate.mjs";

const oldSha = "a".repeat(40);
const newSha = "b".repeat(40);
const fn = (mode, release) => ({ revision: "r1", hash: "h", secretBindingHash: "s", runtimeCompatible: true,
  ...(mode ? { cleanerPushMode: mode, cleanerPushPilotRelease: release } : {}) });
const live = {
  hosting: { version: "B", release: "B" }, rules: { id: "r" }, schedules: [],
  functions: {
    ...Object.fromEntries(["listNotificationInbox", "markNotificationRead", "openNotificationInboxItem"]
      .map((name) => [name, { ...fn(), inboxMode: "enabled" }])),
    ...Object.fromEntries(transportFunctions.map((name) => [name, fn("pilot", oldSha)])),
  },
};

test("updates the four transport Functions around Hosting and keeps the sender last", () => {
  assert.deepEqual(updateSteps.publish.map((step) => step.only), [
    "functions:getCleanerPushDeviceStatus,functions:deactivateCleanerPushDevice",
    "hosting",
    "functions:registerCleanerPushDevice",
    "functions:notifyCleanerInboxEvent",
  ]);
  assert.ok(updateSteps.publish.filter((step) => step.functions).every((step) => step.cleanerPushMode === "pilot"));
  assert.ok(!deploymentArgs(updateSteps.publish.at(-1)).includes("--force"));
  assert.throws(() => deploymentArgs({ id: "rules", only: "firestore:rules" }), /Unreviewed/);
});

test("every transport Function must carry the same pilot release", () => {
  assert.doesNotThrow(() => checkTransportRelease(live, oldSha));
  assert.throws(() => checkTransportRelease(live, newSha), /not all bound/);
  const mixed = { ...live, functions: { ...live.functions, notifyCleanerInboxEvent: fn("pilot", newSha) } };
  assert.throws(() => checkTransportRelease(mixed, oldSha), /not all bound/);
});

test("the update sequence advances revisions and rebinds the release", async () => {
  let state = live;
  const exercised = [];
  const result = await runReleaseSequence({
    initial: live, steps: updateSteps.publish, inboxMode: "enabled",
    inspect: async () => state, verifyLock: async () => {},
    deploy: async (step) => {
      exercised.push(step.id);
      if (step.id === "hosting") { state = { ...state, hosting: { version: "U", release: "U" } }; return; }
      const functions = { ...state.functions };
      for (const name of step.functions) functions[name] = { ...functions[name], revision: "r2", cleanerPushPilotRelease: newSha };
      state = { ...state, functions };
    },
    verifyAssets: async () => {},
    journal(phase, id, snapshot) {
      if (phase === "VERIFIED") verifyBStep(snapshot, updateSteps.publish.find((step) => step.id === id), newSha);
    },
  });
  assert.equal(exercised.length, 4);
  assert.doesNotThrow(() => checkTransportRelease(result, newSha));
  assert.deepEqual(result.functions.listNotificationInbox, live.functions.listNotificationInbox);
});

test("the reviewed update only changes the pilot check on the server", () => {
  const scope = serverScopeChanges("4ec289ec0ac4785f56cd4e33830f152287ec1cd0", "0e36437");
  assert.ok(scope.allowed, scope.changed.join(","));
  assert.ok(scope.changed.includes("functions/src/cleanerPushPilot.js"));
});
