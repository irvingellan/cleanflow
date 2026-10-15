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

test("runtime migration must not reset externally configured service limits", async () => {
  // Importing declarations performs no requests; use only a credential-free demo identity.
  process.env.GCLOUD_PROJECT = "demo-cleanflow";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/private/tmp/cleanflow-no-credentials";
  assert.equal(fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS), false);
  const handlers = await import("../functions/src/index.js");
  const endpoints = Object.entries(handlers).filter(([, value]) => value.__endpoint);
  assert.equal(endpoints.length, 31);
  for (const [name, handler] of endpoints) {
    const endpoint = JSON.parse(JSON.stringify(handler.__endpoint));
    assert.deepEqual(endpoint.region, ["us-central1"], name);
    for (const option of ["maxInstances", "minInstances", "serviceAccountEmail", "vpc", "ingressSettings", "concurrency"]) {
      assert.equal(Object.hasOwn(endpoint, option), false, `${name} must preserve external ${option}, not emit a reset`);
    }
  }
});
