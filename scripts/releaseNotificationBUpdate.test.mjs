import assert from "node:assert/strict";
import test from "node:test";
import { runReleaseSequence, verifyTransition } from "./releaseNotificationA.mjs";
import { transportFunctions, verifyBStep } from "./releaseNotificationB.mjs";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkPushTestFunction, checkTransportRelease, deploymentArgs, previousVariant, serverScopeChanges, updateSteps, updateStepsFor,
} from "./releaseNotificationBUpdate.mjs";

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
    "functions:getCleanerPushDeviceStatus,functions:deactivateCleanerPushDevice,functions:cleanerPushTest",
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
      for (const name of step.functions) functions[name] = { ...(functions[name] || fn("pilot")), revision: "r2", cleanerPushPilotRelease: newSha };
      state = { ...state, functions };
    },
    verifyAssets: async () => {},
    journal(phase, id, snapshot) {
      if (phase === "VERIFIED") verifyBStep(snapshot, updateSteps.publish.find((step) => step.id === id), newSha);
    },
  });
  assert.equal(exercised.length, 4);
  assert.doesNotThrow(() => checkTransportRelease(result, newSha));
  assert.doesNotThrow(() => checkPushTestFunction(result, newSha, true));
  assert.deepEqual(result.functions.listNotificationInbox, live.functions.listNotificationInbox);
});

test("the reviewed update only changes the pilot check on the server", () => {
  const scope = serverScopeChanges("4ec289ec0ac4785f56cd4e33830f152287ec1cd0", "0e36437");
  assert.ok(scope.allowed, scope.changed.join(","));
  assert.ok(scope.changed.includes("functions/src/cleanerPushPilot.js"));
});

test("an update chains from either the original B publication or an earlier update", () => {
  const make = (...files) => {
    const directory = mkdtempSync(join(tmpdir(), "cleanflow-previous-"));
    mkdirSync(directory, { recursive: true });
    for (const file of files) writeFileSync(join(directory, file), "{}");
    return directory;
  };
  assert.equal(previousVariant(make("release-plan-B.json")), "B");
  assert.equal(previousVariant(make("release-plan-U.json")), "U");
  assert.throws(() => previousVariant(make()), /exactly one/);
  assert.throws(() => previousVariant(make("release-plan-B.json", "release-plan-U.json")), /exactly one/);
});

test("the rebind update only changes device registration on the server", () => {
  const scope = serverScopeChanges("be914086655dab7337c79e55e40a4f0f3e95e742", "HEAD");
  assert.ok(scope.allowed, scope.changed.join(","));
});

test("a rollback to a release without test notices removes that Function first", async () => {
  const previousLacksTest = updateStepsFor(false).rollback;
  assert.deepEqual(previousLacksTest[0], { id: "delete:cleanerPushTest", delete: ["cleanerPushTest"] });
  assert.ok(!previousLacksTest.slice(1).some((step) => step.functions?.includes("cleanerPushTest")));
  assert.deepEqual(updateStepsFor(true).rollback, updateStepsFor(true).publish);
  assert.deepEqual(deploymentArgs(previousLacksTest[0]).slice(0, 2), ["functions:delete", "cleanerPushTest"]);
  assert.ok(deploymentArgs(previousLacksTest[0]).includes("--force"));
  assert.throws(() => deploymentArgs({ id: "delete:notifyCleanerInboxEvent", delete: ["notifyCleanerInboxEvent"] }), /Unreviewed/);

  const published = { ...live, functions: { ...live.functions, cleanerPushTest: fn("pilot", newSha) } };
  const { cleanerPushTest, ...withoutTest } = published.functions;
  assert.ok(cleanerPushTest);
  assert.doesNotThrow(() => verifyTransition(published, { ...published, functions: withoutTest }, previousLacksTest[0], { inboxMode: "enabled" }));
  assert.throws(() => verifyTransition(live, live, previousLacksTest[0], { inboxMode: "enabled" }), /did not change/);
  const alsoRemoved = { ...withoutTest };
  delete alsoRemoved.notifyCleanerInboxEvent;
  assert.throws(() => verifyTransition(published, { ...published, functions: alsoRemoved }, previousLacksTest[0], { inboxMode: "enabled" }), /Unexpected/);
  assert.doesNotThrow(() => checkPushTestFunction(live, oldSha, false));
  assert.throws(() => checkPushTestFunction(published, oldSha, false), /test notice/);
  assert.throws(() => checkPushTestFunction(published, oldSha, true), /test notice/);
});
