import assert from "node:assert/strict";
import { test } from "node:test";
import { interruptedPublishLock } from "./hosting-release.mjs";

const marker = "CleanFlow Definitive UI reviewed-plan";
const baseline = {
  hosting: { release: "sites/demo/releases/old", version: "v1" },
  functions: { callable: { revision: "initial" } },
  rules: { id: "rules-v1" },
  schedules: [],
};
const live = { ...baseline, hosting: { release: "sites/demo/releases/new", version: "v2" } };
const entry = { state: "DEPLOYING", step: "hosting", snapshot: baseline, lock: "owned-lock-timestamp" };
const release = { name: live.hosting.release, version: { name: "sites/demo/versions/v2" }, message: marker };

test("interrupted publish rollback requires its journal, exact Hosting marker and unchanged backend", () => {
  assert.equal(interruptedPublishLock(baseline, live, entry, release, marker), entry.lock);
  assert.throws(() => interruptedPublishLock(baseline, live, entry, { ...release, message: "another release" }, marker), /ownership/);
  assert.throws(() => interruptedPublishLock(baseline, live, null, release, marker), /ownership/);
  assert.throws(() => interruptedPublishLock(baseline, { ...live, rules: { id: "drift" } }, entry, release, marker), /Concurrent rules/);
  assert.throws(() => interruptedPublishLock(baseline, { ...live, functions: {} }, entry, release, marker), /Unexpected Functions/);
});
