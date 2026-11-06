import assert from "node:assert/strict";
import test from "node:test";
import { runReleaseSequence, verifyTransition, writeReleaseModes } from "./releaseNotificationA.mjs";
import { transportFunctions, verifyBStep } from "./releaseNotificationB.mjs";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkPushTestFunction, checkTransportRelease, deploymentArgs, stepReleaseModes, previousVariant, serverScopeChanges, updateSteps, updateStepsFor,
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
  const scope = serverScopeChanges("be914086655dab7337c79e55e40a4f0f3e95e742", "c3e957b73969a0e7e69fc4693e946469e0348e61");
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

test("reconciles an attempt that stopped right after its reviewed first step", async () => {
  const { partialReconciliation } = await import("./releaseNotificationBUpdate.mjs");
  const { sha256 } = await import("./notificationReleaseCloud.mjs");
  const steps = updateStepsFor(false);
  const plan = Buffer.from(JSON.stringify({ sha: newSha, steps, previous: { sha: oldSha } }));
  const previousReceipt = { sha: oldSha, snapshot: live };
  const attempt = (overrides = {}) => Buffer.from(JSON.stringify({
    schema: 1, action: "publish", sha: newSha, planHash: sha256(plan), step: steps.publish[0].id, state: "DEPLOYING",
    snapshot: live, lockUpdateTime: "2026-11-05T00:00:00Z", ...overrides,
  }));
  const functions = { ...live.functions };
  for (const name of steps.publish[0].functions) {
    functions[name] = { ...(functions[name] || fn("pilot")), revision: "r2", cleanerPushMode: "pilot", cleanerPushPilotRelease: newSha };
  }
  const partial = { ...live, functions };
  const { record } = partialReconciliation({ attemptBytes: attempt(), attemptPlanBytes: plan, previousReceipt, live: partial });
  assert.equal(record.kind, "RELEASE_U_PARTIAL_RECONCILED");
  assert.deepEqual(record.snapshot, partial);
  assert.throws(() => partialReconciliation({ attemptBytes: attempt({ step: "hosting" }), attemptPlanBytes: plan, previousReceipt, live: partial }), /first step/);
  const drifted = { ...partial, hosting: { version: "X", release: "X" } };
  assert.throws(() => partialReconciliation({ attemptBytes: attempt(), attemptPlanBytes: plan, previousReceipt, live: drifted }), /hosting/);
});

test("an operations update moves every non-push Function and its rollback removes the new ones", async () => {
  const { operationsAdditions, operationsFunctions, scheduleFunctions } = await import("./releaseNotificationBUpdate.mjs");
  const previous = { ...live, functions: {
    ...live.functions, cleanerPushTest: fn("pilot", oldSha), publicOffer: fn(), respondToMyOffer: fn(),
    sendTodayExecutionReminder: fn(), sendTomorrowPlanningReminder: fn(),
  } };
  const steps = updateStepsFor(true, previous);
  const [operations, ...push] = steps.publish;
  assert.equal(operations.cleanerPushMode, "disabled");
  assert.deepEqual(operations.functions, operationsFunctions(previous, { includeAdditions: true }));
  for (const name of [...transportFunctions, "cleanerPushTest", ...scheduleFunctions]) assert.ok(!operations.functions.includes(name), name);
  for (const name of ["publicOffer", "respondToMyOffer", "listNotificationInbox", ...operationsAdditions]) assert.ok(operations.functions.includes(name), name);
  assert.deepEqual(push, updateStepsFor(true).publish);
  const [removal, rollbackOperations] = steps.rollback;
  assert.deepEqual(removal.delete, operationsAdditions);
  assert.ok(!rollbackOperations.functions.some((name) => operationsAdditions.includes(name)));
  assert.deepEqual(deploymentArgs(removal, steps.rollback).slice(0, 2), ["functions:delete", operationsAdditions[0]]);
  assert.throws(() => deploymentArgs(removal), /Unreviewed/);

  // A publish that created the new Functions verifies; a rollback that leaves one behind does not.
  const published = { ...previous, functions: { ...previous.functions } };
  for (const name of operations.functions) published.functions[name] = { ...(published.functions[name] || fn()), revision: "r2" };
  assert.doesNotThrow(() => verifyTransition(previous, published, operations, { inboxMode: "enabled" }));
  const partial = { ...published, functions: { ...published.functions } };
  for (const name of operationsAdditions.slice(1)) delete partial.functions[name];
  assert.throws(() => verifyTransition(published, partial, removal, { inboxMode: "enabled" }), /Unexpected/);
});

test("an operations update may change Functions source but never Rules, indexes or deploy config", () => {
  const scope = serverScopeChanges("c3e957b73969a0e7e69fc4693e946469e0348e61", "HEAD", { operations: true });
  assert.ok(scope.allowed, scope.changed.join(","));
  assert.ok(!scope.changed.some((file) => ["firestore.rules", "firestore.indexes.json", "storage.rules", "firebase.json"].includes(file)));
  assert.equal(serverScopeChanges("c3e957b73969a0e7e69fc4693e946469e0348e61", "HEAD").allowed, false);
});

test("every reviewed operations step writes valid runtime modes", () => {
  const sha = "a".repeat(40);
  const snapshot = { functions: { publicOffer: {}, cleanerPushTest: {}, sendTodayExecutionReminder: {} } };
  const plan = updateStepsFor(true, snapshot);
  for (const step of [...plan.publish, ...plan.rollback].filter((candidate) => candidate.cleanerPushMode)) {
    const workspace = mkdtempSync(join(tmpdir(), "modes-"));
    mkdirSync(join(workspace, "functions"));
    assert.doesNotThrow(() => writeReleaseModes(workspace, stepReleaseModes(step, sha), "wx"), step.id);
  }
  assert.deepEqual(stepReleaseModes({ cleanerPushMode: "disabled" }, sha), { inboxMode: "enabled", cleanerPushMode: "disabled" });
  assert.equal(stepReleaseModes({ cleanerPushMode: "pilot" }, sha).pilotRelease, sha);
});

test("only the operations step that creates Functions deploys with --force", () => {
  const snapshot = { functions: { publicOffer: {}, cleanerPushTest: {}, sendTodayExecutionReminder: {} } };
  const plan = updateStepsFor(true, snapshot);
  const reviewed = [...plan.publish, ...plan.rollback];
  const forced = reviewed.filter((step) => !step.delete && deploymentArgs(step, reviewed).includes("--force"));
  assert.deepEqual(forced, [plan.publish[0]]);
  assert.ok(plan.publish[0].functions.includes("syncCleanerAgendaOnChecklistStart"));
  assert.throws(() => deploymentArgs({ ...plan.rollback[1], force: true }, reviewed), /Unreviewed/);
});

test("an operations attempt that changed nothing only releases the mutex", async () => {
  const { partialReconciliation } = await import("./releaseNotificationBUpdate.mjs");
  const { sha256 } = await import("./notificationReleaseCloud.mjs");
  const previousReceipt = { sha: oldSha, snapshot: live };
  const steps = updateStepsFor(false, live);
  const plan = Buffer.from(JSON.stringify({ sha: newSha, steps, operations: true, previousHasTest: false, previous: { sha: oldSha } }));
  const attempt = Buffer.from(JSON.stringify({
    schema: 1, action: "publish", sha: newSha, planHash: sha256(plan), step: steps.publish[0].id, state: "DEPLOYING",
    snapshot: live, lockUpdateTime: "2026-11-06T00:00:00Z",
  }));
  const { record, lockUpdateTime } = partialReconciliation({ attemptBytes: attempt, attemptPlanBytes: plan, previousReceipt, live });
  assert.equal(record.unchanged, true);
  assert.equal(lockUpdateTime, "2026-11-06T00:00:00Z");
  const drifted = { ...live, hosting: { version: "X", release: "X" } };
  assert.throws(() => partialReconciliation({ attemptBytes: attempt, attemptPlanBytes: plan, previousReceipt, live: drifted }));
});
