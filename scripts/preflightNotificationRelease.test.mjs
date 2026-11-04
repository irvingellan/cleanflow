import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import test from "node:test";
import { dedicatedCleanerConfig, validPhysicalVerification, validReleaseVerification, validVapidFingerprint } from "./preflightNotificationRelease.mjs";

test("VAPID preflight accepts a canonical public P-256 point and rejects malformed points", () => {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from([1]));
  const key = ecdh.getPublicKey().toString("base64url");
  assert.match(validVapidFingerprint(key), /^[a-f0-9]{64}$/);
  for (const value of [key + "=", key.slice(1), Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString("base64url")]) {
    assert.equal(validVapidFingerprint(value), null);
  }
});

test("messaging app requires a distinct Web app in the same project and sender", () => {
  const manager = { projectId: "demo-cleanflow", messagingSenderId: "42", appId: "1:42:web:aa" };
  const cleaner = { ...manager, appId: "1:42:web:bb" };
  assert.deepEqual(dedicatedCleanerConfig(manager, cleaner), cleaner);
  assert.equal(dedicatedCleanerConfig(manager, manager), null);
  assert.equal(dedicatedCleanerConfig(manager, { ...cleaner, projectId: "wrong" }), null);
  assert.equal(dedicatedCleanerConfig(manager, { ...cleaner, appId: "1:43:web:bb" }), null);
});

test("release verification requires each passed suite and the exact SHA", () => {
  const suites = Object.fromEntries(["unit", "manager-rules", "hub-rules", "webkit", "chromium", "guards", "worker-browser"]
    .map((name) => [name, { exitCode: 0, passed: 1 }]));
  const receipt = { sha: "test-sha", suites };
  assert.equal(validReleaseVerification(receipt, "test-sha"), true);
  assert.equal(validReleaseVerification(receipt, "other"), false);
  assert.equal(validReleaseVerification({ ...receipt, suites: { ...suites, webkit: { exitCode: 0, passed: 0 } } }, "test-sha"), false);
});

test("Release B requires physical observations and approval bound to the configuration", () => {
  const identity = { sha: "candidate", appId: "1:42:web:bb", vapidFingerprint: "hash" };
  const receipt = { ...identity, releaseAuthorized: true, iosHomeScreenObserved: true, androidObserved: true };
  assert.equal(validPhysicalVerification(receipt, identity), true);
  assert.equal(validPhysicalVerification({ ...receipt, releaseAuthorized: false }, identity), false);
  assert.equal(validPhysicalVerification(receipt, { ...identity, vapidFingerprint: "different" }), false);
});
