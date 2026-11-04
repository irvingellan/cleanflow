import assert from "node:assert/strict";
import test from "node:test";
import { deployGroups } from "./preflightNotificationRelease.mjs";
import { functionConfigurationHash } from "./notificationReleaseCloud.mjs";
import { releaseSteps, runReleaseSequence, verifyTransition } from "./releaseNotificationA.mjs";

const baseline = {
  hosting: { version: "old", release: "live1" },
  rules: { id: "r0", hash: "old", updated: "before" },
  functions: { retained: { revision: "original", hash: "a" } },
};
const rulesStep = releaseSteps.publish[0];
const functionsStep = { id: "listNotificationInbox", functions: ["listNotificationInbox"] };
const rulesApplied = { ...baseline, rules: { id: "r1", hash: "reviewed", updated: "after" } };
const inboxApplied = { ...rulesApplied, functions: {
  ...baseline.functions, listNotificationInbox: { revision: "deployed", hash: "b", inboxMode: "enabled", runtimeCompatible: true },
} };

test("Eventarc can reorder equal trigger filters without masking configuration drift", () => {
  const document = { attribute: "document", operator: "match-path-pattern", value: "example/{id}" };
  const database = { attribute: "database", value: "(default)" };
  const first = { eventTrigger: { eventFilters: [document, database] }, serviceConfig: { revision: "one" } };
  const reordered = { ...first, eventTrigger: { eventFilters: [database, document] } };
  assert.equal(functionConfigurationHash(first), functionConfigurationHash(reordered));
  reordered.eventTrigger.eventFilters[1] = { ...document, value: "different/{id}" };
  assert.notEqual(functionConfigurationHash(first), functionConfigurationHash(reordered));
  assert.notEqual(functionConfigurationHash(first),
    functionConfigurationHash({ ...first, serviceConfig: { revision: "two" } }));
});

test("Release A uses exact named targets and changes reader compatibility before enrollment", () => {
  const [rules, main, manager, redeem, issue, hosting] = releaseSteps.publish;
  assert.equal(rules.only, "firestore:rules");
  assert.equal(hosting.only, "hosting");
  assert.deepEqual(manager.functions, ["registerManagerPushDevice"]);
  assert.deepEqual(redeem.functions, ["redeemCleanerAccessCode"]);
  assert.deepEqual(issue.functions, ["issueCleanerAccessCode"]);
  assert.deepEqual([...main.functions, ...manager.functions, ...redeem.functions, ...issue.functions].sort(),
    [...deployGroups.create, ...deployGroups.update].sort());
  assert.equal(main.functions.length, 19);
  assert.ok(deployGroups.defer.every((name) => !main.functions.includes(name)));
  assert.deepEqual(releaseSteps.rollback.map(({ only }) => only), [
    "functions:listNotificationInbox,functions:markNotificationRead,functions:openNotificationInboxItem", "hosting",
  ]);
});

test("accepts only the reviewed Rules bytes, Function set and effective Inbox mode", () => {
  const context = { rulesHash: "reviewed", inboxMode: "enabled" };
  verifyTransition(baseline, rulesApplied, rulesStep, context);
  verifyTransition(rulesApplied, inboxApplied, functionsStep, context);
  assert.throws(() => verifyTransition(baseline, rulesApplied, rulesStep, { ...context, rulesHash: "drift" }), /Rules/);
  assert.throws(() => verifyTransition(rulesApplied, inboxApplied, functionsStep, { ...context, inboxMode: "disabled" }), /Inbox/);
  const drift = structuredClone(inboxApplied);
  drift.functions.retained.hash = "drift";
  assert.throws(() => verifyTransition(rulesApplied, drift, functionsStep, context), /Unexpected Functions/);
});

test("Production drift or lost lock prevents the next mutation", async () => {
  let state = baseline;
  const calls = [];
  const harness = {
    initial: baseline, steps: [rulesStep, functionsStep], rulesHash: "reviewed", inboxMode: "enabled",
    inspect: async () => state, verifyLock: async () => {}, journal: async () => {},
    deploy: async (step) => {
      calls.push(step.id);
      state = rulesApplied;
    },
  };
  await assert.rejects(runReleaseSequence({ ...harness, inspect: async () => rulesApplied }), /drift/);
  assert.deepEqual(calls, []);
  await assert.rejects(runReleaseSequence({ ...harness, verifyLock: async () => { throw new Error("lost lock"); } }), /lost lock/);
  assert.deepEqual(calls, []);
  await assert.rejects(runReleaseSequence({ ...harness, journal: async (phase) => {
    if (phase === "VERIFIED") state = { ...rulesApplied, hosting: { version: "other", release: "live2" } };
  } }), /drift/);
  assert.deepEqual(calls, ["rules"]);
});

test("unverified Hosting bytes never produce a verified journal entry", async () => {
  const calls = [];
  const step = releaseSteps.publish.at(-1);
  let state = inboxApplied;
  await assert.rejects(runReleaseSequence({
    initial: state, steps: [step], inspect: async () => state, verifyLock: async () => {},
    deploy: async () => { state = { ...state, hosting: { version: "new", release: "live2" } }; },
    verifyAssets: async () => { throw new Error("assets differ"); },
    journal: async (phase) => calls.push(phase),
  }), /assets differ/);
  assert.deepEqual(calls, ["DEPLOYING"]);
});
