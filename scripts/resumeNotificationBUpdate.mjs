// Resumes a sealed update publish that stopped after a deploy because reading
// Production failed (busy). It proves the stopped step reached its reviewed
// state (or did not start), then runs only the remaining reviewed steps under
// the same mutex. Usage: node scripts/resumeNotificationBUpdate.mjs --dir <review dir> [--approve resume:<receipt sha256>]
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { assertReleaseLock, readNotificationProduction, releaseReleaseLock, sha256 } from "./notificationReleaseCloud.mjs";
import { runReleaseSequence, stageReleaseInputs, verifyLiveAssets, verifyTransition, writeReleaseModes } from "./releaseNotificationA.mjs";
import { releaseBSnapshot, verifyBStep } from "./releaseNotificationB.mjs";
import { checkPushTestFunction, checkTransportRelease, deploymentArgs, stepReleaseModes } from "./releaseNotificationBUpdate.mjs";

const root = resolve(import.meta.dirname, "..");
const dirArgument = process.argv[process.argv.indexOf("--dir") + 1];
if (!process.argv.includes("--dir") || !dirArgument) throw new Error("Use --dir <review directory under .tmp/>.");
const dir = resolve(dirArgument);
const must = (ok, message) => { if (!ok) throw new Error(message); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const planBytes = readFileSync(join(dir, "release-plan-U.json"));
const plan = JSON.parse(planBytes);
const receiptPath = join(dir, "publish-receipt-U.json");
const receiptBytes = readFileSync(receiptPath);
const receipt = JSON.parse(receiptBytes);
must(git("rev-parse", "HEAD") === plan.sha && !git("status", "--porcelain"), "Run from the clean sealed SHA.");
must(receipt.action === "publish" && receipt.state === "DEPLOYING" && receipt.planHash === sha256(planBytes)
  && receipt.sha === plan.sha && typeof receipt.lockUpdateTime === "string", "Only a stopped DEPLOYING publish of this plan can resume.");
const steps = plan.steps.publish;
const index = steps.findIndex((step) => step.id === receipt.step);
must(index >= 0, "The stopped step is not in the sealed plan.");

async function read() {
  for (let attempt = 0; ; attempt++) {
    try {
      const production = await readNotificationProduction("B");
      must(production.report.noPendingFunctionOperations, "Function operations are pending.");
      return { production, snapshot: releaseBSnapshot(production.report) };
    } catch (error) {
      if (attempt >= 8) throw error;
      await sleep(15_000);
    }
  }
}

const { production, snapshot: live } = await read();
must(production.report.releaseLock?.state === "HELD", "The mutex is not held by the stopped attempt.");
await assertReleaseLock(receipt.lockUpdateTime);
let start = index;
if (!equal(live, receipt.snapshot)) {
  verifyTransition(receipt.snapshot, live, steps[index], { inboxMode: "enabled" });
  verifyBStep(live, steps[index], plan.sha);
  start = index + 1;
}
const remaining = steps.slice(start);
const required = `resume:${sha256(receiptBytes)}`;
const approval = process.argv[process.argv.indexOf("--approve") + 1];
if (!process.argv.includes("--approve") || approval !== required) {
  console.log(JSON.stringify({ state: "DRY_RUN_READY", requiredApproval: required, stoppedStep: receipt.step, stepApplied: start > index, remaining: remaining.map((s) => s.id) }));
  process.exit(0);
}

const record = (state, step, snapshot) => {
  writeFileSync(`${receiptPath}.tmp`, JSON.stringify({ ...receipt, state, step, snapshot, resumedFrom: receipt.step }), { flag: "wx", mode: 0o600 });
  renameSync(`${receiptPath}.tmp`, receiptPath);
};
const manifest = JSON.parse(readFileSync(join(dir, "hosting-manifest-U.json"), "utf8"));
const workspace = mkdtempSync(join(tmpdir(), "cleanflow-release-resume-"));
try {
  stageReleaseInputs(plan.sha, { manifest, dist: join(dir, "assets-U") }, { inboxMode: "enabled", cleanerPushMode: "disabled" }, workspace);
  const result = await runReleaseSequence({
    initial: live, steps: remaining, inboxMode: "enabled",
    inspect: async () => (await read()).snapshot,
    verifyLock: () => assertReleaseLock(receipt.lockUpdateTime),
    journal(state, id, snapshot) {
      if (state === "VERIFIED") verifyBStep(snapshot, steps.find((step) => step.id === id), plan.sha);
      record(state, id, snapshot);
    },
    deploy(step) {
      if (step.cleanerPushMode) writeReleaseModes(workspace, stepReleaseModes(step, plan.sha));
      const cli = join(root, "node_modules/firebase-tools/lib/bin/firebase.js");
      const run = spawnSync(process.execPath, [cli, ...deploymentArgs(step, [...plan.steps.publish, ...plan.steps.rollback])],
        { cwd: workspace, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (run.status !== 0) console.error(`${run.stdout || ""}\n${run.stderr || ""}`.split("\n").slice(-40).join("\n"));
      must(run.status === 0, `Deploy failed in resumed step ${step.id}. Lock retained.`);
    },
    verifyAssets: () => verifyLiveAssets(manifest),
  });
  checkTransportRelease(result, plan.sha);
  checkPushTestFunction(result, plan.sha, true);
  record("COMPLETE", null, result);
  await releaseReleaseLock(receipt.lockUpdateTime);
  console.log(JSON.stringify({ state: "COMPLETE", action: "publish", sha: plan.sha, resumedFrom: receipt.step }));
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
