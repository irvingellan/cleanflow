import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { assertReleaseLock, readNotificationProduction, releaseReleaseLock, sha256 } from "./notificationReleaseCloud.mjs";
import { deployGroups, effectiveBaselineReceipt, liveHostingBaseline, releaseBBranch } from "./preflightNotificationRelease.mjs";
import { releaseBSnapshot, releaseBSteps } from "./releaseNotificationB.mjs";

// Reconciles a Release B attempt that stopped after its Inbox step verified in
// Production but before any transport Function was deployed. It writes the
// live state as a new baseline record and releases the attempt's own mutex.

const root = resolve(import.meta.dirname, "..");
const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Pure check: the attempt stopped at the Inbox step and the live state is that step's outcome. */
export function reconciliationRecord({ attemptBytes, originalBytes, live }) {
  const attempt = JSON.parse(attemptBytes);
  const original = JSON.parse(originalBytes);
  const inboxStep = releaseBSteps.publish[0];
  requireCondition(sha256(originalBytes) === liveHostingBaseline.receiptHash, "The original Definitive UI receipt differs.");
  requireCondition(attempt.schema === 1 && attempt.action === "publish" && attempt.step === inboxStep.id
    && ["DEPLOYING", "VERIFIED"].includes(attempt.state) && equal(attempt.snapshot, original.snapshot)
    && typeof attempt.lockUpdateTime === "string",
  "Only an attempt stopped at the Inbox step on the original baseline can be reconciled.");
  for (const name of [...deployGroups.prepareB, ...deployGroups.enable]) {
    requireCondition(!Object.hasOwn(live.functions, name), "A transport Function exists; use the Release B executor instead.");
  }
  const record = {
    schema: 1, kind: "RELEASE_B_PARTIAL_RECONCILED", attemptSha: attempt.sha, attemptPlanHash: attempt.planHash,
    attemptReceiptHash: sha256(attemptBytes), stoppedStep: inboxStep.id,
    originalBase64: Buffer.from(originalBytes).toString("base64"), snapshot: live, lockReleased: true,
  };
  requireCondition(effectiveBaselineReceipt(Buffer.from(JSON.stringify(record))),
    "Live Production differs from the original baseline beyond the reviewed Inbox endpoints.");
  return { record, lockUpdateTime: attempt.lockUpdateTime };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      dir: { type: "string" }, "baseline-receipt": { type: "string" }, out: { type: "string" }, approve: { type: "string" },
    } });
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    requireCondition(values.dir && values["baseline-receipt"] && values.out && git("branch", "--show-current") === releaseBBranch
      && !git("status", "--porcelain") && process.versions.node.split(".")[0] === "22",
    "Use the clean Release B worktree on Node 22 with --dir, --baseline-receipt and --out.");
    const directory = realpathSync(resolve(values.dir));
    const attemptFile = join(directory, "publish-receipt-B.json");
    const attemptBytes = readFileSync(attemptFile);
    const originalBytes = readFileSync(realpathSync(resolve(values["baseline-receipt"])));
    const production = await readNotificationProduction("B");
    requireCondition(production.report.releaseLock?.state === "HELD", "The release mutex is not held by a stopped attempt.");
    const { record, lockUpdateTime } = reconciliationRecord({
      attemptBytes, originalBytes, live: releaseBSnapshot(production.report),
    });
    await assertReleaseLock(lockUpdateTime);
    const required = `reconcile:${sha256(attemptBytes)}`;
    if (values.approve !== required) {
      console.log(JSON.stringify({ state: "DRY_RUN_READY", requiredApproval: required, changed: deployGroups.inboxUpdate }));
    } else {
      await releaseReleaseLock(lockUpdateTime);
      const after = await readNotificationProduction("B");
      requireCondition(after.report.releaseLock?.state === "AVAILABLE" && equal(releaseBSnapshot(after.report), record.snapshot),
        "Production changed while the mutex was released. Inspect before continuing.");
      const out = resolve(values.out);
      writeFileSync(out, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      renameSync(attemptFile, join(directory, `publish-receipt-B.stopped-${Date.now()}.json`));
      console.log(JSON.stringify({ state: "RECONCILED", baseline: out, baselineHash: sha256(readFileSync(out)) }));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
