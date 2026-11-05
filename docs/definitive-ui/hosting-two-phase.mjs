import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { hostname, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import {
  checkout, previous, validated, hostingConfig, normalizedConfig, versionConfig,
  inspect, inspectAssets, inspectEntryRoutes, validIosAcceptance,
} from "./hosting-release.mjs";
import { stageHosting, settleHosting } from "./hosting-two-phase-core.mjs";
import {
  acquireReleaseLock, assertReleaseLock, recoverReleaseLock, releaseReleaseLock,
  notificationProject as project, sha256,
} from "../../scripts/notificationReleaseCloud.mjs";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const { Client } = require("firebase-tools/lib/apiv2");
const { createVersion, updateVersion } = require("firebase-tools/lib/hosting/api");
const { Uploader } = require("firebase-tools/lib/deploy/hosting/uploader");
const api = new Client({ urlPrefix: "https://firebasehosting.googleapis.com" });
const site = `sites/${project}`;
const projectNumber = "470414797064";
const origin = `https://${project}.web.app`;
const readOptions = { timeout: 12000, retries: 0, skipLog: { reqBody: true, resBody: true } };
const candidateSha = "a7cdb66407a07097a3952d1197a6131e8c43f6e0";
const candidatePlanHash = "9701df75ff04adaa9840231ee0154a9a5840ec846295c8024111a734aa3974d1";
const fullReadinessChecks = [
  "exclusiveCliConsoleCi", "physicalIphoneMirroring", "managerTestSession",
  "cleanerTestSession", "legacyTestShortcut", "safariWhatsAppTestLinks", "authorizedChecklist",
];
const publicReadinessChecks = [
  "exclusiveCliConsoleCi", "physicalIphoneMirroring", "signedOutSafari", "signedOutManagerQaIcon",
];
const publicAcceptanceChecks = [
  "managerOriginalIconRetained", "managerQaIconOpensRootSignedOut",
  "agendaSafariAccessScreen", "agendaInstallSheetMatchesProduction",
  "agendaIconOpensAgendaSignedOut", "separateInstalledApps",
];
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const hash = (path) => sha256(readFileSync(path));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const report = (value) => console.log(JSON.stringify(value));
function check(value, message) {
  if (!value) throw new Error(message);
}

function syncDirectory(path) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function writeNew(path, value) {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}

function saveAtomic(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeNew(temporary, value);
  renameSync(temporary, path);
  syncDirectory(dirname(path));
}

export function validReadiness(receipt, sealHash, now, deadline, physicalScope = "full") {
  const readinessChecks = physicalScope === "public-entry" ? publicReadinessChecks : fullReadinessChecks;
  const confirmed = Date.parse(receipt?.confirmedAt);
  const exclusiveUntil = Date.parse(receipt?.exclusiveUntil);
  return receipt?.sealHash === sealHash && receipt.origin === origin
    && confirmed <= now && now - confirmed <= 30 * 60_000
    && exclusiveUntil >= deadline + 5 * 60_000
    && readinessChecks.every((key) => receipt.checks?.[key] === true);
}

export function validPublicIosAcceptance(receipt, plan) {
  return receipt?.state === "PASS_HOSTING_SMOKE" && receipt.device === "physical-iphone"
    && receipt.sha === plan.sha && receipt.manifestHash === plan.manifestHash
    && publicAcceptanceChecks.every((key) => receipt.checks?.[key] === true)
    && ["authenticatedSessions", "legacyIconLaunch", "whatsApp", "checklist"].every(
      (key) => receipt.operationalChecks?.[key] === "NOT_RUN",
    );
}

function checkedDirectory(path) {
  const directory = resolve(path);
  check(realpathSync(directory) === directory && lstatSync(directory).isDirectory(), "Use a real directory.");
  return directory;
}

function loadInputs(options) {
  check(realpathSync(process.cwd()) === root && !git("status", "--porcelain"),
    "Run from the clean tooling checkout.");
  check(!Object.keys(process.env).some((key) => process.env[key] && (
    ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT",
      "FIREBASE_CONFIG", "GOOGLE_CLOUD_QUOTA_PROJECT", "CLOUDSDK_AUTH_ACCESS_TOKEN",
      "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_HOSTING_URL",
      "FIREBASE_API_URL", "FIREBASE_AUTH_URL", "FIREBASE_HOSTING_UPLOAD_URL"].includes(key)
    || /^FIREBASE_.*(?:_URL|_ORIGIN|_HOST)$/.test(key)
  )), "Use the verified Firebase CLI account without endpoint or credential overrides.");
  const candidateRoot = checkedDirectory(options["candidate-root"]);
  const directory = checkedDirectory(options.dir);
  const operation = checkedDirectory(options["operation-dir"]);
  check(relative(candidateRoot, directory).startsWith(".tmp/") && directory !== operation,
    "Review must be under the candidate .tmp; use a separate operation directory.");
  check(relative(root, operation).startsWith(".tmp/") && (lstatSync(operation).mode & 0o077) === 0,
    "Operation directory must be private and under the tooling .tmp.");
  const head = checkout(candidateRoot);
  check(head === candidateSha && hash(join(directory, "release-plan.json")) === candidatePlanHash,
    "The exact approved application SHA and seal are required.");
  const a = previous(checkedDirectory(options["a-dir"]));
  const review = validated(directory, head, a);
  check(same(review.plan, json(join(directory, "release-plan.json"))), "Candidate seal mismatch.");
  const config = hostingConfig(head);
  check(config.public === "dist" && !config.rewrites?.some((r) => r.function?.pinTag || r.run?.pinTag),
    "Hosting config unexpectedly pins a backend deployment.");
  const seal = {
    schema: "cleanflow-hosting-two-phase-v2", toolingSha: git("rev-parse", "HEAD"),
    sourceSha: head, planHash: candidatePlanHash, manifestHash: review.plan.manifestHash,
    project, origin, scope: "hosting-only", rollbackVersion: review.plan.rollbackVersion,
    physicalAcceptance: "required-before-complete", physicalScope: options["physical-scope"],
    operatorDeadlineMinutes: [5, 20],
  };
  return { a, review, config, seal, directory, operation };
}

function siteResource(name) {
  check(typeof name === "string", "Hosting resource name is missing.");
  const resource = name.startsWith(`projects/${projectNumber}/`)
    ? name.slice(`projects/${projectNumber}/`.length) : name;
  check(resource.startsWith(site + "/"), "Unexpected Hosting project or site.");
  return resource.slice(site.length + 1);
}

export function versionId(name) {
  const match = siteResource(name).match(/^versions\/([a-f0-9]{16})$/);
  check(match, "Unexpected Hosting version ID.");
  return match[1];
}

export function releaseId(name) {
  const match = siteResource(name).match(/^(?:channels\/live\/)?releases\/(\d+)$/);
  check(match, "Unexpected live release name.");
  return match[1];
}

async function channelMatches(hosting) {
  const response = await api.get(`/v1beta1/projects/-/${site}/channels/live`, readOptions);
  const release = response.body.release;
  check(response.status === 200 && releaseId(release?.name) === releaseId(hosting.release)
    && versionId(release?.version?.name) === hosting.version, "Live channel metadata differs.");
}

function cloudAdapter(inputs) {
  const { a, review, config, operation, directory } = inputs;
  const journal = join(operation, "state.json");
  const rollback = review.plan.rollbackVersion;
  const assertConfig = async (version, candidate) => {
    const expected = candidate ? review.baseline.candidateHostingConfig : review.baseline.hostingConfig;
    check(same(await versionConfig(version), expected), "Hosting version configuration differs from the seal.");
  };
  return {
    now: Date.now,
    validIosAcceptance: inputs.seal.physicalScope === "public-entry" ? validPublicIosAcceptance : validIosAcceptance,
    readState: () => existsSync(journal) ? json(journal) : null,
    saveState: (record) => saveAtomic(journal, record),
    inspect: async () => {
      const current = await inspect();
      await channelMatches(current.snapshot.hosting);
      return current;
    },
    acquire: acquireReleaseLock,
    recoverLock: recoverReleaseLock,
    assertLock: assertReleaseLock,
    releaseLock: releaseReleaseLock,
    verifyPublic: async (snapshot, isCandidate) => {
      const manifest = isCandidate ? review.manifest : a.manifest;
      await Promise.all([
        inspectAssets(manifest), inspectEntryRoutes(manifest, isCandidate),
        assertConfig(snapshot.hosting.version, isCandidate),
      ]);
    },
    releaseMetadata: async (name) => {
      const id = releaseId(name);
      const response = await api.get(`/v1beta1/${site}/releases/${id}`, readOptions);
      check(response.status === 200 && releaseId(response.body.name) === id
        && versionId(response.body.version?.name), "Live release metadata is unavailable.");
      return { ...response.body, name };
    },
    createCandidate: async () => {
      const workspace = mkdtempSync(join(tmpdir(), "cleanflow-hosting-upload-"));
      try {
        const dist = join(workspace, "dist");
        for (const { file, sha256: expected } of review.manifest.files) {
          const target = join(dist, file);
          mkdirSync(dirname(target), { recursive: true });
          copyFileSync(join(directory, "assets", file), target);
          check(hash(target) === expected, "Staged asset differs.");
        }
        const version = await createVersion(project, { status: "CREATED" });
        const id = versionId(version);
        check(same(await normalizedConfig(config, id), review.baseline.candidateHostingConfig), "Candidate Hosting config differs.");
        const files = review.manifest.files.map(({ file }) => file);
        const uploader = new Uploader({ version, files, public: dist, cwd: workspace, projectRoot: workspace });
        await uploader.start();
        const finalized = await updateVersion(project, id, {
          status: "FINALIZED", config: review.baseline.candidateHostingConfig,
        });
        check(finalized.status === "FINALIZED" && Number(finalized.fileCount) === files.length,
          "Finalized Hosting version file count differs.");
        await assertConfig(id, true);
        const inventory = await api.get(`/v1beta1/${site}/versions/${id}/files`, {
          ...readOptions, queryParams: { status: "ACTIVE", pageSize: 1000 },
        });
        const uploaded = new Map(inventory.body.files?.map(({ path, hash }) => [path, hash]));
        check(inventory.status === 200 && !inventory.body.nextPageToken && uploaded.size === files.length
          && files.every((file) => uploaded.get("/" + file) === sha256(gzipSync(readFileSync(join(dist, file)), { level: 9 }))),
        "Finalized version files differ from the sealed upload.");
        return id;
      } finally { rmSync(workspace, { recursive: true, force: true }); }
    },
    switchLive: async (version, marker) => {
      check(/^[a-f0-9]{16}$/.test(version), "Unexpected target version.");
      const target = `${site}/versions/${version}`;
      const response = await api.post(`/v1beta1/projects/-/${site}/channels/live/releases`, { message: marker }, {
        ...readOptions, queryParams: { versionName: target },
      });
      check(response.status === 200 && versionId(response.body.version?.name) === version && response.body.message === marker,
        "Hosting switch response was not confirmed.");
      return `${site}/releases/${releaseId(response.body.name)}`;
    },
    verifyRollback: async () => assertConfig(rollback, false),
  };
}

async function preflight(inputs, io) {
  const { review, config } = inputs;
  const current = await io.inspect();
  check(current.lock === "AVAILABLE" && same(current.snapshot, review.baseline.snapshot)
    && same(current.notification, review.baseline.notification), "Production differs from the sealed baseline or mutex is busy.");
  await Promise.all([
    io.verifyPublic(current.snapshot, false), io.verifyRollback(),
  ]);
  check(same(await normalizedConfig(config, current.snapshot.hosting.version), review.baseline.candidateHostingConfig),
    "Candidate ServingConfig does not match the reviewed Hosting config.");
  const again = await io.inspect();
  check(same(again, current), "Production changed during preflight.");
  return current.snapshot.hosting;
}

function startWorker(directory, action) {
  const worker = { pid: process.pid, host: hostname(), startedAt: new Date().toISOString() };
  const stage = join(directory, "stage-worker.json");
  if (action === "recover") {
    const prior = json(stage);
    check(prior.host === worker.host && Number.isSafeInteger(prior.pid) && prior.pid > 1, "Stage worker identity is unverified.");
    try { process.kill(prior.pid, 0); } catch (error) {
      if (error.code !== "ESRCH") throw error;
      const recovery = join(directory, "recovery-worker.json");
      writeNew(recovery, worker);
      return recovery;
    }
    throw new Error("Stage worker is still alive. Request rollback via rollback-request.json.");
  }
  writeNew(stage, worker);
}

function reportState(result) {
  report({ state: result.state, attemptId: result.attemptId,
    hosting: result.snapshot?.hosting, mutexReleased: result.mutexReleased });
}

async function watch(context, io, directory) {
  const acceptancePath = join(directory, "ios-live-acceptance.json");
  let lastError;
  let stop = false;
  const interrupt = () => { stop = true; };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    while (!stop && Date.now() < Date.parse(context.deadline) && !existsSync(join(directory, "rollback-request.json"))) {
      if (existsSync(acceptancePath)) {
        try {
          return await settleHosting(context, io, { acceptance: json(acceptancePath) });
        } catch (error) {
          if (io.readState()?.state !== "PENDING_PHYSICAL") throw error;
          if (lastError !== error.message) console.error(error.message);
          lastError = error.message;
        }
      }
      await delay(2000);
    }
    return await settleHosting(context, io, { rollback: true });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  const { values } = parseArgs({ args, options: {
    "candidate-root": { type: "string" }, dir: { type: "string" }, "a-dir": { type: "string" },
    "operation-dir": { type: "string" }, approve: { type: "string" }, "exclusive-window": { type: "boolean" },
    readiness: { type: "string" }, "physical-scope": { type: "string", default: "full" },
    minutes: { type: "string", default: "15" },
  } });
  check(["seal", "preflight", "stage", "recover"].includes(action)
    && ["candidate-root", "dir", "a-dir", "operation-dir"].every((name) => values[name]), "Missing command or required directory.");
  check(["full", "public-entry"].includes(values["physical-scope"]), "Unknown physical acceptance scope.");
  const inputs = loadInputs(values);
  const sealFile = join(inputs.operation, "operational-seal.json");
  if (action === "seal") {
    writeNew(sealFile, inputs.seal);
    report({ state: "SEALED_LOCAL_ONLY", sealHash: hash(sealFile), ...inputs.seal });
    return;
  }
  check(same(json(sealFile), inputs.seal), "Operational seal differs from the tooling checkout or candidate.");
  const sealHash = hash(sealFile);
  const io = cloudAdapter(inputs);
  const { plan, baseline } = inputs.review;
  if (action === "recover") {
    check(values["exclusive-window"] && values.approve === `stage:${sealHash}`, "The sealed exclusive operation is required.");
    const state = io.readState();
    check(state, "No durable operation journal to recover.");
    const worker = startWorker(inputs.operation, action);
    try {
      reportState(await settleHosting({ sealHash, plan, baseline, attemptId: state.attemptId, deadline: state.deadline },
        io, { rollback: true }));
    } finally {
      rmSync(worker);
      syncDirectory(inputs.operation);
    }
    return;
  }
  const minutes = Number(values.minutes);
  check(Number.isInteger(minutes) && minutes >= 5 && minutes <= 20, "Use a window of 5–20 minutes.");
  const readiness = values.readiness ? json(values.readiness) : null;
  if (action === "preflight") {
    const hosting = await preflight(inputs, io);
    const now = Date.now();
    const ready = validReadiness(readiness, sealHash, now, now + minutes * 60_000, inputs.seal.physicalScope);
    report({ state: ready ? "PREFLIGHT_READY" : "PREFLIGHT_BLOCKED_READINESS", sealHash, hosting });
    if (!ready) process.exitCode = 2;
    return;
  }
  check(values["exclusive-window"] && values.approve === `stage:${sealHash}`, "The sealed exclusive operation is required.");
  const now = Date.now();
  const deadline = new Date(now + minutes * 60_000).toISOString();
  check(validReadiness(readiness, sealHash, now, Date.parse(deadline), inputs.seal.physicalScope), "Physical test fixtures and exclusive window are unconfirmed.");
  check(!["state.json", "ios-live-acceptance.json", "rollback-request.json"].some((file) => existsSync(join(inputs.operation, file))),
    "Use a fresh operation directory.");
  await preflight(inputs, io);
  startWorker(inputs.operation, action);
  const context = { sealHash, plan, baseline, attemptId: randomUUID(), deadline };
  try {
    const pending = await stageHosting(context, io);
    report({ state: pending.state, attemptId: context.attemptId, deadline, origin,
      hostingVersion: pending.candidateVersion, hostingRelease: pending.candidateRelease });
  } catch (error) {
    console.error(error.message);
    if (io.readState()) reportState(await settleHosting(context, io, { rollback: true }));
    process.exitCode = 1;
    return;
  }
  const result = await watch(context, io, inputs.operation);
  reportState(result);
  if (result.state !== "COMPLETE") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
