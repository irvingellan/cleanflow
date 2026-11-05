const terminal = new Set(["COMPLETE", "ROLLED_BACK", "ABORTED_BEFORE_SWITCH"]);
const beforeSwitch = new Set(["ACQUIRING", "CREATING", "READY"]);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const check = (ok, message) => { if (!ok) throw new Error(message); };

function binding({ sealHash, plan, baseline, attemptId, deadline }) {
  check(/^[a-f0-9]{64}$/.test(sealHash) && /^[a-zA-Z0-9-]{1,80}$/.test(attemptId)
    && Number.isFinite(Date.parse(deadline)) && baseline.snapshot.hosting.version === plan.rollbackVersion,
  "Invalid release attempt binding.");
  return {
    sealHash, attemptId, deadline, sha: plan.sha, manifestHash: plan.manifestHash,
    project: plan.project, rollbackVersion: plan.rollbackVersion, baseline,
    stageMarker: `CleanFlow Definitive UI stage ${sealHash} ${attemptId}`,
    rollbackMarker: `CleanFlow Definitive UI rollback ${sealHash} ${attemptId}`,
  };
}

function lockOperation(record) {
  return {
    action: "definitive-ui-stage", sha: record.sha,
    planHash: record.sealHash, attemptId: record.attemptId, deadline: record.deadline,
  };
}

function checkBinding(record, expected) {
  check(Object.entries(expected).every(([key, value]) => same(record[key], value)),
    "Local attempt does not match the sealed release.");
}

async function save(io, record, changes) {
  const next = { ...record, ...changes };
  await io.saveState(next);
  return next;
}

function hostingIndependent(snapshot) {
  const { hosting: _hosting, ...backend } = snapshot;
  return backend;
}

async function inspect(io, record) {
  const live = await io.inspect();
  check(same(live.notification, record.baseline.notification)
    && same(hostingIndependent(live.snapshot), hostingIndependent(record.baseline.snapshot)),
  "Production backend or FCM differs from the sealed baseline.");
  return live;
}

async function inspectOwned(io, record) {
  const live = await inspect(io, record);
  check(live.lock === "HELD" && record.lock, "The attempt does not hold the Production mutex.");
  await io.assertLock(record.lock);
  return live.snapshot;
}

function checkBaseline(record, snapshot) {
  check(same(record.baseline.snapshot, snapshot), "The exact baseline release is not active.");
}

async function verifyStable(io, record, snapshot, isCandidate) {
  await io.verifyPublic(snapshot, isCandidate);
  check(same(await inspectOwned(io, record), snapshot), "Production changed during public verification.");
}

async function markedRelease(io, record, snapshot, version, marker, expectedRelease) {
  const hosting = snapshot.hosting;
  check(hosting.version === version && hosting.release !== record.baseline.snapshot.hosting.release
    && (!expectedRelease || hosting.release === expectedRelease),
  "Live Hosting does not match the expected release. The mutex remains held.");
  const metadata = await io.releaseMetadata(hosting.release);
  check(metadata?.name === hosting.release && metadata.message === marker
    && metadata.version?.name?.endsWith(`/versions/${version}`),
  "Live Hosting cannot be attributed to this attempt. The mutex remains held.");
  return hosting.release;
}

async function markPending(io, record, expectedRelease) {
  const snapshot = await inspectOwned(io, record);
  const candidateRelease = await markedRelease(io, record, snapshot, record.candidateVersion,
    record.stageMarker, expectedRelease);
  await verifyStable(io, record, snapshot, true);
  return save(io, record, {
    state: "PENDING_PHYSICAL", candidateRelease, snapshot,
    stagedAt: new Date(io.now()).toISOString(),
  });
}

async function finishUnlock(io, record) {
  if (record.mutexReleased) return record;
  const live = await inspect(io, record);
  check(same(live.snapshot, record.snapshot), "Production changed after the terminal receipt.");
  if (live.lock === "HELD") {
    check(record.lock, "The terminal receipt does not identify its mutex.");
    await io.assertLock(record.lock);
    await io.releaseLock(record.lock);
  } else {
    check(live.lock === "AVAILABLE", "The Production mutex could not be read.");
  }
  return save(io, record, { mutexReleased: true });
}

async function recoverLock(io, record) {
  const lock = await io.recoverLock?.(lockOperation(record));
  check(lock, "The attempted mutex acquisition is unresolved. Do not retry the write.");
  return save(io, record, { lock });
}

export async function stageHosting(context, io) {
  const expected = binding(context);
  let record = await io.readState();
  if (record) {
    checkBinding(record, expected);
    if (record.state === "PENDING_PHYSICAL") {
      const snapshot = await inspectOwned(io, record);
      check(same(snapshot, record.snapshot), "The provisional release changed.");
      return record;
    }
    if (record.state === "SWITCHING") return markPending(io, record);
    check(["ACQUIRING", "READY"].includes(record.state), "This release attempt cannot be staged again.");
    if (record.state === "ACQUIRING" && !record.lock) record = await recoverLock(io, record);
  } else {
    check(io.now() < Date.parse(expected.deadline), "The physical acceptance window expired.");
    const live = await inspect(io, expected);
    check(live.lock === "AVAILABLE", "The Production mutex is unavailable.");
    checkBaseline(expected, live.snapshot);
    await io.verifyPublic(live.snapshot, false);
    record = await save(io, expected, { state: "ACQUIRING" });
    let lock;
    try {
      lock = await io.acquire(lockOperation(record));
    } catch {
      record = await recoverLock(io, record);
    }
    if (lock) record = await save(io, record, { lock });
  }

  check(io.now() < Date.parse(record.deadline), "The physical acceptance window expired.");
  checkBaseline(record, await inspectOwned(io, record));
  if (record.state === "ACQUIRING") {
    record = await save(io, record, { state: "CREATING" });
    const candidateVersion = await io.createCandidate();
    check(/^[a-zA-Z0-9-]+$/.test(candidateVersion) && candidateVersion !== context.plan.rollbackVersion,
      "The finalized candidate version is invalid.");
    record = await save(io, record, { state: "READY", candidateVersion });
  }

  await io.verifyRollback();
  checkBaseline(record, await inspectOwned(io, record));
  check(io.now() < Date.parse(record.deadline), "The physical acceptance window expired.");
  record = await save(io, record, { state: "SWITCHING" });
  let switchedRelease;
  try {
    switchedRelease = await io.switchLive(record.candidateVersion, record.stageMarker);
  } catch {
    // The write may have reached Hosting. Reconcile a visible, owned release without retrying.
  }
  return markPending(io, record, switchedRelease);
}

async function rollbackHosting(context, io, record) {
  if (beforeSwitch.has(record.state)) {
    if (!record.lock) record = await recoverLock(io, record);
    const snapshot = await inspectOwned(io, record);
    checkBaseline(record, snapshot);
    await verifyStable(io, record, snapshot, false);
    return finishUnlock(io, await save(io, record, { state: "ABORTED_BEFORE_SWITCH", snapshot }));
  }

  check(["SWITCHING", "PENDING_PHYSICAL", "ROLLBACK_SWITCHING"].includes(record.state),
    "This release attempt cannot be rolled back.");
  let switchedRelease;
  if (record.state !== "ROLLBACK_SWITCHING") {
    const candidate = await inspectOwned(io, record);
    const candidateRelease = await markedRelease(io, record, candidate, record.candidateVersion,
      record.stageMarker, record.candidateRelease);
    await io.verifyRollback();
    check(same(await inspectOwned(io, record), candidate), "The live candidate changed before rollback.");
    record = await save(io, record, { state: "ROLLBACK_SWITCHING", candidateRelease });
    try {
      switchedRelease = await io.switchLive(context.plan.rollbackVersion, record.rollbackMarker);
    } catch {
      // An already restored release can still be verified below. Never submit a second write.
    }
  }

  const snapshot = await inspectOwned(io, record);
  await markedRelease(io, record, snapshot, context.plan.rollbackVersion, record.rollbackMarker, switchedRelease);
  await verifyStable(io, record, snapshot, false);
  return finishUnlock(io, await save(io, record, { state: "ROLLED_BACK", snapshot }));
}

export async function settleHosting(context, io, { acceptance, rollback = false } = {}) {
  const record = await io.readState();
  check(record, "There is no local release attempt to settle.");
  checkBinding(record, binding(context));
  if (terminal.has(record.state)) return finishUnlock(io, record);
  if (rollback) return rollbackHosting(context, io, record);

  check(record.state === "PENDING_PHYSICAL", "The candidate has not been verified on the live channel.");
  const observedAt = Date.parse(acceptance?.observedAt);
  const deadline = Date.parse(record.deadline);
  const now = io.now();
  check(io.validIosAcceptance(acceptance, context.plan) && acceptance.origin === `https://${record.project}.web.app`
    && acceptance.hostingVersion === record.candidateVersion && acceptance.hostingRelease === record.candidateRelease
    && acceptance.attemptId === record.attemptId && observedAt >= Date.parse(record.stagedAt)
    && observedAt <= now && now < deadline,
  "The physical iPhone receipt does not match the active attempt or acceptance window.");

  const snapshot = await inspectOwned(io, record);
  check(same(snapshot, record.snapshot), "The live candidate changed after staging.");
  await markedRelease(io, record, snapshot, record.candidateVersion, record.stageMarker, record.candidateRelease);
  await verifyStable(io, record, snapshot, true);
  check(io.now() < deadline, "The physical acceptance window expired during verification.");
  const complete = await save(io, record, { state: "COMPLETE", observedAt: acceptance.observedAt, snapshot });
  return finishUnlock(io, complete);
}
