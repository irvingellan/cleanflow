import test from "node:test";
import assert from "node:assert/strict";
import { stageHosting, settleHosting } from "./hosting-two-phase-core.mjs";

function fixture() {
  let state = null;
  let time = Date.parse("2026-11-05T02:00:00Z");
  let held = null;
  let operation;
  let releaseCount = 0;
  const versions = new Map();
  const context = {
    sealHash: "a".repeat(64), attemptId: "test-attempt",
    deadline: new Date(time + 600_000).toISOString(),
    plan: {
      sha: "b".repeat(40), manifestHash: "c".repeat(64),
      rollbackVersion: "baseline", project: "clean-flow-prototipo",
    },
    baseline: {
      snapshot: {
        hosting: { version: "baseline", release: "baseline-release" },
        rules: "rules", functions: { test: "revision" }, schedules: "schedules",
      },
      notification: "FCM",
    },
  };
  const live = structuredClone(context.baseline);
  const calls = [];
  const io = {
    now: () => time,
    readState: () => structuredClone(state),
    saveState: (value) => {
      calls.push(["state", value.state, value.mutexReleased]);
      state = structuredClone(value);
    },
    inspect: () => ({ ...structuredClone(live), lock: held ? "HELD" : "AVAILABLE" }),
    acquire: (requested) => {
      assert.equal(state.state, "ACQUIRING");
      assert.equal(held, null);
      calls.push(["acquire"]);
      operation = requested;
      held = "update-time";
      return held;
    },
    recoverLock: (requested) => JSON.stringify(requested) === JSON.stringify(operation) ? held : null,
    assertLock: (token) => assert.equal(token, held),
    releaseLock: (token) => {
      assert.equal(token, held);
      assert.ok(["COMPLETE", "ROLLED_BACK", "ABORTED_BEFORE_SWITCH"].includes(state.state));
      calls.push(["unlock"]);
      held = null;
    },
    createCandidate: () => {
      assert.equal(state.state, "CREATING");
      calls.push(["create"]);
      return "candidate";
    },
    switchLive: (version, marker) => {
      assert.ok(["SWITCHING", "ROLLBACK_SWITCHING"].includes(state.state));
      calls.push(["switch", version]);
      const release = "release-" + ++releaseCount;
      versions.set(release, {
        name: release, version: { name: "sites/clean-flow-prototipo/versions/" + version },
        message: marker,
      });
      live.snapshot.hosting = { version, release };
      return release;
    },
    releaseMetadata: (name) => versions.get(name),
    verifyRollback: () => calls.push(["verifyRollback"]),
    verifyPublic: (snapshot, isCandidate) => {
      calls.push(["verify", isCandidate]);
      assert.equal(snapshot.hosting.version, isCandidate ? "candidate" : "baseline");
    },
    validIosAcceptance: (receipt, plan) =>
      receipt?.state === "PASS" && receipt.sha === plan.sha && receipt.manifestHash === plan.manifestHash,
  };
  return {
    context, io, calls, live, versions, isHeld: () => held !== null,
    expire: () => { time = Date.parse(context.deadline); },
    acceptance: () => ({
      state: "PASS", sha: context.plan.sha, manifestHash: context.plan.manifestHash,
      origin: "https://clean-flow-prototipo.web.app", hostingVersion: "candidate",
      hostingRelease: state.candidateRelease, attemptId: context.attemptId, observedAt: new Date(time).toISOString(),
    }),
  };
}

test("holds mutex after staging and releases only after verified bound iPhone receipt", async () => {
  const f = fixture();
  const pending = await stageHosting(f.context, f.io);
  assert.equal(pending.state, "PENDING_PHYSICAL");
  assert.equal(pending.candidateRelease, "release-1");
  assert.ok(f.isHeld());
  assert.deepEqual(f.calls.filter(([name]) => name === "switch"), [["switch", "candidate"]]);
  const done = await settleHosting(f.context, f.io, { acceptance: f.acceptance() });
  assert.equal(done.state, "COMPLETE");
  assert.equal(done.mutexReleased, true);
  assert.ok(!f.isHeld());
  assert.deepEqual(f.calls.slice(-3), [["state", "COMPLETE", undefined], ["unlock"], ["state", "COMPLETE", true]]);
});

test("rejects unrelated, preview, stale and expired physical receipts with the mutex held", async () => {
  const f = fixture();
  await stageHosting(f.context, f.io);
  for (const mismatch of [
    { state: "OBSERVATIONS_ONLY" }, { origin: "https://preview.web.app" }, { hostingRelease: "different-release" },
    { hostingVersion: "baseline" }, { attemptId: "different-attempt" }, { manifestHash: "different-manifest" },
    { observedAt: "2026-11-04T23:00:00Z" },
  ]) {
    await assert.rejects(settleHosting(f.context, f.io, { acceptance: { ...f.acceptance(), ...mismatch } }),
      /physical iPhone receipt/);
    assert.ok(f.isHeld());
  }
  f.expire();
  await assert.rejects(settleHosting(f.context, f.io, { acceptance: f.acceptance() }), /physical iPhone receipt/);
  const restored = await settleHosting(f.context, f.io, { rollback: true });
  assert.equal(restored.state, "ROLLED_BACK");
  assert.equal(restored.snapshot.hosting.version, "baseline");
  assert.ok(!f.isHeld());
});

test("fails before acquiring mutex on baseline or FCM drift", async () => {
  const f = fixture();
  f.live.notification = "unexpected";
  await assert.rejects(stageHosting(f.context, f.io), /Production backend or FCM/);
  assert.deepEqual(f.calls, []);
});

test("rejects a replacement live release even when it references the same version", async () => {
  const f = fixture();
  await stageHosting(f.context, f.io);
  f.live.snapshot.hosting.release = "foreign-release";
  await assert.rejects(settleHosting(f.context, f.io, { acceptance: f.acceptance() }), /changed after staging/);
  await assert.rejects(settleHosting(f.context, f.io, { rollback: true }), /expected release/);
  assert.ok(f.isHeld());
  assert.deepEqual(f.calls.filter(([name]) => name === "switch"), [["switch", "candidate"]]);
});

test("recovers an acquired mutex after response loss only when exact attempt fields match", async () => {
  const f = fixture();
  const acquire = f.io.acquire;
  f.io.acquire = (operation) => {
    acquire(operation);
    throw new Error("response lost");
  };
  assert.equal((await stageHosting(f.context, f.io)).state, "PENDING_PHYSICAL");
  assert.ok(f.isHeld());
});

test("ambiguous stage with baseline still live holds mutex and never retries live POST", async () => {
  const f = fixture();
  let writes = 0;
  f.io.switchLive = () => {
    writes++;
    throw new Error("request outcome unavailable");
  };
  await assert.rejects(stageHosting(f.context, f.io), /expected release/);
  await assert.rejects(stageHosting(f.context, f.io), /expected release/);
  await assert.rejects(settleHosting(f.context, f.io, { rollback: true }), /expected release/);
  assert.equal(writes, 1);
  assert.ok(f.isHeld());
  assert.equal(f.io.readState().state, "SWITCHING");
});

test("stage response loss reconciles exact version and unique marker", async () => {
  const f = fixture();
  const switchLive = f.io.switchLive;
  f.io.switchLive = (...args) => {
    switchLive(...args);
    throw new Error("response lost");
  };
  assert.equal((await stageHosting(f.context, f.io)).state, "PENDING_PHYSICAL");
  const restored = await settleHosting(f.context, f.io, { rollback: true });
  assert.equal(restored.state, "ROLLED_BACK");
  assert.equal(restored.snapshot.hosting.release, "release-2");
  assert.ok(!f.isHeld());
});

test("asset failure leaves a marked stage eligible for verified rollback", async () => {
  const f = fixture();
  const verifyPublic = f.io.verifyPublic;
  f.io.verifyPublic = (snapshot, candidate) => {
    verifyPublic(snapshot, candidate);
    if (candidate) throw new Error("candidate bytes do not match");
  };
  await assert.rejects(stageHosting(f.context, f.io), /candidate bytes/);
  assert.equal(f.io.readState().state, "SWITCHING");
  assert.ok(f.isHeld());
  assert.equal((await settleHosting(f.context, f.io, { rollback: true })).state, "ROLLED_BACK");
  assert.ok(!f.isHeld());
});

test("ambiguous rollback retains mutex until restored release can be proven, without retry", async () => {
  const f = fixture();
  await stageHosting(f.context, f.io);
  const switchLive = f.io.switchLive;
  let rollbackWrites = 0;
  f.io.switchLive = () => {
    rollbackWrites++;
    throw new Error("response lost");
  };
  await assert.rejects(settleHosting(f.context, f.io, { rollback: true }), /expected release/);
  await assert.rejects(settleHosting(f.context, f.io, { rollback: true }), /expected release/);
  assert.ok(f.isHeld());
  assert.equal(rollbackWrites, 1);
  switchLive("baseline", f.io.readState().rollbackMarker);
  assert.equal((await settleHosting(f.context, f.io, { rollback: true })).state, "ROLLED_BACK");
  assert.ok(!f.isHeld());
});

test("upload failure aborts only after verifying the exact baseline remains live", async () => {
  const f = fixture();
  f.io.createCandidate = () => { throw new Error("upload failed"); };
  await assert.rejects(stageHosting(f.context, f.io), /upload failed/);
  assert.ok(f.isHeld());
  assert.equal((await settleHosting(f.context, f.io, { rollback: true })).state, "ABORTED_BEFORE_SWITCH");
  assert.deepEqual(f.calls.filter(([name]) => name === "switch"), []);
  assert.ok(!f.isHeld());
});

test("terminal receipt is durable before unlock and retries a completed unlock without a second delete", async () => {
  const f = fixture();
  await stageHosting(f.context, f.io);
  const releaseLock = f.io.releaseLock;
  f.io.releaseLock = (token) => {
    releaseLock(token);
    throw new Error("response lost");
  };
  await assert.rejects(settleHosting(f.context, f.io, { acceptance: f.acceptance() }), /response lost/);
  assert.equal(f.io.readState().state, "COMPLETE");
  assert.equal((await settleHosting(f.context, f.io)).mutexReleased, true);
  assert.equal(f.calls.filter(([name]) => name === "unlock").length, 1);
});

test("unavailable rollback blocks both stage and rollback without moving live", async () => {
  const beforeStage = fixture();
  beforeStage.io.verifyRollback = () => { throw new Error("rollback unavailable"); };
  await assert.rejects(stageHosting(beforeStage.context, beforeStage.io), /rollback unavailable/);
  assert.equal(beforeStage.io.readState().state, "READY");
  assert.ok(beforeStage.isHeld());
  assert.deepEqual(beforeStage.calls.filter(([name]) => name === "switch"), []);

  const beforeRollback = fixture();
  await stageHosting(beforeRollback.context, beforeRollback.io);
  beforeRollback.io.verifyRollback = beforeStage.io.verifyRollback;
  await assert.rejects(settleHosting(beforeRollback.context, beforeRollback.io, { rollback: true }),
    /rollback unavailable/);
  assert.equal(beforeRollback.io.readState().state, "PENDING_PHYSICAL");
  assert.ok(beforeRollback.isHeld());
  assert.deepEqual(beforeRollback.calls.filter(([name]) => name === "switch"), [["switch", "candidate"]]);
});
