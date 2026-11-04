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
  const manager = { projectId: "demo-cleanflow", messagingSenderId: "42", apiKey: "shared-public-binding", appId: "1:42:web:aa" };
  const cleaner = { ...manager, appId: "1:42:web:bb" };
  assert.deepEqual(dedicatedCleanerConfig(manager, cleaner), cleaner);
  assert.equal(dedicatedCleanerConfig(manager, manager), null);
  assert.equal(dedicatedCleanerConfig(manager, { ...cleaner, projectId: "wrong" }), null);
  assert.equal(dedicatedCleanerConfig(manager, { ...cleaner, appId: "1:43:web:bb" }), null);
  assert.equal(dedicatedCleanerConfig(manager, { ...cleaner, apiKey: "different-binding" }), null);
});

test("release verification requires each passed suite and the exact SHA", () => {
  const suites = Object.fromEntries(["unit", "manager-rules", "hub-rules", "webkit", "chromium", "guards", "worker-browser", "pilot-visual"]
    .map((name) => [name, { exitCode: 0, passed: 1 }]));
  const receipt = { sha: "test-sha", suites };
  assert.equal(validReleaseVerification(receipt, "test-sha"), true);
  assert.equal(validReleaseVerification(receipt, "other"), false);
  const { ["pilot-visual"]: visual, ...withoutVisual } = suites;
  assert.equal(validReleaseVerification({ ...receipt, suites: withoutVisual }, "test-sha"), false);
  assert.equal(validReleaseVerification({ ...receipt, suites: { ...suites, webkit: { exitCode: 0, passed: 0 } } }, "test-sha"), false);
});

test("Release B requires observed physical delivery for both roles bound to the exact manifest", () => {
  const identity = { sha: "candidate", appId: "1:42:web:bb", vapidFingerprint: "a".repeat(64), hostingManifestSha256: "b".repeat(64),
    pilotProject: "clean-flow-sandbox-irving", pilotManifestSha256: "d".repeat(64) };
  const observations = ["manager", "cleaner"].flatMap((role) => ["ios-home-screen", "android"].map((platform) => ({
    role, platform, evidenceId: `${role}-${platform}`, permissionGranted: true, registered: true,
    providerAccepted: true, displayed: true, opened: true, inboxAvailable: true,
  })));
  const receipt = { ...identity, releaseAuthorized: true, environment: "isolated-pilot", pilotVapidFingerprint: "e".repeat(64), observations };
  assert.equal(validPhysicalVerification(receipt, identity), true);
  assert.equal(validPhysicalVerification({ ...receipt, releaseAuthorized: false }, identity), false);
  assert.equal(validPhysicalVerification({ ...receipt, observations: [...observations.slice(0, 3), observations[0]] }, identity), false);
  assert.equal(validPhysicalVerification({ ...receipt, observations: observations.map((row) => ({ ...row, displayed: false })) }, identity), false);
  assert.equal(validPhysicalVerification(receipt, { ...identity, hostingManifestSha256: "c".repeat(64) }), false);
  assert.equal(validPhysicalVerification(receipt, { ...identity, pilotManifestSha256: "c".repeat(64) }), false);
});
