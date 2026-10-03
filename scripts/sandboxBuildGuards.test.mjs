import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const sandboxProjectId = "cleanflow-sandbox-fixture";
const fixtureBuildId = "sandbox-build-guard-synthetic";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cleanflow-sandbox-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  // Deliberately copy only build inputs, never local .env files, credentials,
  // exports, emulator data or Firebase CLI state from the developer workspace.
  for (const directory of ["src", "public", "functions/src", "scripts"]) {
    fs.cpSync(path.join(repository, directory), path.join(root, directory), {
      recursive: true,
      filter: (source) => !path.basename(source).startsWith("."),
    });
  }
  for (const file of ["index.html", "package.json", "vite.config.js"]) {
    fs.copyFileSync(path.join(repository, file), path.join(root, file));
  }
  fs.symlinkSync(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
  return root;
}

function syntheticEnvironment(overrides = {}) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(VITE_|CLEANFLOW_|FIREBASE_|GOOGLE_|GCLOUD_|GITHUB_SHA$)/.test(key)));

  return {
    ...inherited,
    GITHUB_SHA: fixtureBuildId,
    VITE_CLEANFLOW_ENV: "sandbox",
    VITE_CLEANFLOW_SANDBOX_PROJECT_ID: sandboxProjectId,
    VITE_CLEANFLOW_SANDBOX_ORIGIN: `https://${sandboxProjectId}.web.app`,
    VITE_FIREBASE_API_KEY: "synthetic-key-not-a-credential",
    VITE_FIREBASE_AUTH_DOMAIN: `${sandboxProjectId}.firebaseapp.com`,
    VITE_FIREBASE_PROJECT_ID: sandboxProjectId,
    VITE_FIREBASE_STORAGE_BUCKET: `${sandboxProjectId}.firebasestorage.app`,
    VITE_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
    VITE_FIREBASE_APP_ID: "1:1234567890:web:synthetic",
    VITE_FIREBASE_VAPID_KEY: "",
    VITE_ONESIGNAL_APP_ID: "",
    ...overrides,
  };
}

function build(root, environment, label) {
  const output = path.join(root, `dist-${label}`);
  const result = spawnSync("npm", ["run", "build:sandbox", "--", "--outDir", output], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  // Build output is confined to an all-synthetic mirror, but do not echo
  // configuration values in successful test logs.
  return { ...result, output, diagnostic: `${result.stdout || ""}\n${result.stderr || ""}` };
}

test("Sandbox build binds synthetic client and messaging worker to its separate project", (t) => {
  const root = fixture(t);
  const result = build(root, syntheticEnvironment(), "positive");
  assert.equal(result.status, 0, result.diagnostic);
  const marker = JSON.parse(fs.readFileSync(path.join(result.output, "version.json"), "utf8"));
  assert.equal(marker.buildId, fixtureBuildId);
  assert.equal(marker.environment, "sandbox");
  assert.equal(marker.projectId, sandboxProjectId);
  const messagingWorker = fs.readFileSync(path.join(result.output, "firebase-messaging-sw.js"), "utf8");
  assert.ok(messagingWorker.includes(`"projectId":"${sandboxProjectId}"`));
  assert.ok(messagingWorker.includes(`"storageBucket":"${sandboxProjectId}.firebasestorage.app"`));
  const rootWorker = fs.readFileSync(path.join(result.output, "sw.js"), "utf8");
  assert.doesNotMatch(rootWorker, /addEventListener\(\s*["']fetch["']/);
});

const rejectedBindings = [
  ["production-project", { VITE_FIREBASE_PROJECT_ID: "clean-flow-prototipo" }],
  ["production-allowlist", {
    VITE_CLEANFLOW_SANDBOX_PROJECT_ID: "clean-flow-prototipo",
    VITE_FIREBASE_PROJECT_ID: "clean-flow-prototipo",
  }],
  ["production-auth", { VITE_FIREBASE_AUTH_DOMAIN: "clean-flow-prototipo.firebaseapp.com" }],
  ["production-storage", { VITE_FIREBASE_STORAGE_BUCKET: "clean-flow-prototipo.firebasestorage.app" }],
  ["production-origin", { VITE_CLEANFLOW_SANDBOX_ORIGIN: "https://clean-flow-prototipo.web.app" }],
  ["inconsistent-sender", { VITE_FIREBASE_APP_ID: "1:9999999999:web:synthetic" }],
  ["inherited-onesignal", { VITE_ONESIGNAL_APP_ID: "synthetic-production-provider-id" }],
  ["inherited-vapid", { VITE_FIREBASE_VAPID_KEY: "synthetic-production-push-key" }],
  ["missing-allowlist", { VITE_CLEANFLOW_SANDBOX_PROJECT_ID: "" }],
  ["missing-web-config", { VITE_FIREBASE_APP_ID: "" }],
];

for (const [name, overrides] of rejectedBindings) {
  test(`Sandbox build rejects ${name} before generating deployable assets`, (t) => {
    const root = fixture(t);
    const result = build(root, syntheticEnvironment(overrides), name);
    assert.notEqual(result.status, 0);
    assert.match(result.diagnostic, /sandbox|environment|configuration|firebase/i);
    assert.equal(fs.existsSync(path.join(result.output, "index.html")), false);
  });
}

test("Sandbox build cannot inherit an incomplete sandbox configuration from a production .env", (t) => {
  const root = fixture(t);
  // This is fabricated production-shaped configuration, not a copy or read of
  // the repository's actual environment file.
  fs.writeFileSync(path.join(root, ".env"), [
    "VITE_FIREBASE_API_KEY=synthetic-production-shaped-key",
    "VITE_FIREBASE_AUTH_DOMAIN=clean-flow-prototipo.firebaseapp.com",
    "VITE_FIREBASE_PROJECT_ID=clean-flow-prototipo",
    "VITE_FIREBASE_STORAGE_BUCKET=clean-flow-prototipo.firebasestorage.app",
    "VITE_FIREBASE_MESSAGING_SENDER_ID=9999999999",
    "VITE_FIREBASE_APP_ID=1:9999999999:web:synthetic",
  ].join("\n"));
  const environment = syntheticEnvironment();
  for (const key of ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_APP_ID"]) {
    delete environment[key];
  }
  const result = build(root, environment, "inherited-production");
  assert.notEqual(result.status, 0);
  assert.match(result.diagnostic, /sandbox|environment|configuration|firebase/i);
  assert.equal(fs.existsSync(path.join(result.output, "index.html")), false);
});

test("Sandbox build rejects a known production API key even with otherwise valid sandbox configuration", (t) => {
  const root = fixture(t);
  const knownProductionKey = "synthetic-production-key-for-inheritance-regression";
  fs.writeFileSync(path.join(root, ".env.production"), [
    "VITE_FIREBASE_PROJECT_ID=clean-flow-prototipo",
    `VITE_FIREBASE_API_KEY=${knownProductionKey}`,
  ].join("\n"));
  const result = build(root, syntheticEnvironment({ VITE_FIREBASE_API_KEY: knownProductionKey }), "known-production-key");
  assert.notEqual(result.status, 0);
  assert.match(result.diagnostic, /sandbox|production|configuration|firebase/i);
  assert.equal(fs.existsSync(path.join(result.output, "index.html")), false);
  assert.equal(result.diagnostic.includes(knownProductionKey), false, "Configuration guard must not echo API keys");
});

function hostingFixture(t, sandboxAlias = sandboxProjectId) {
  const root = fixture(t);
  fs.copyFileSync(path.join(repository, "firebase.json"), path.join(root, "firebase.json"));
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\ndist/\n.firebase/\n.env*\n");
  fs.writeFileSync(path.join(root, ".firebaserc"), JSON.stringify({ projects: {
    prod: "clean-flow-prototipo",
    ...(sandboxAlias ? { sandbox: sandboxAlias } : {}),
  } }));
  const environment = syntheticEnvironment();
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env: environment, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Synthetic Sandbox Fixture", "-c", "user.email=sandbox-test@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "synthetic build fixture");
  return { root, environment, sha: git("rev-parse", "HEAD") };
}

function prepare({ root, environment, sha }) {
  const result = spawnSync(process.execPath, ["scripts/prepareHosting.mjs", sha, "sandbox"], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { ...result, diagnostic: `${result.stdout || ""}\n${result.stderr || ""}` };
}

test("Existing Hosting preparation produces an isolated synthetic Sandbox manifest without deploying", (t) => {
  const input = hostingFixture(t);
  const result = prepare(input);
  assert.equal(result.status, 0, result.diagnostic);
  assert.match(result.diagnostic, /No deployment performed/);
  const manifest = JSON.parse(fs.readFileSync(path.join(input.root, ".firebase", "hosting-prepared-manifest.json"), "utf8"));
  const marker = JSON.parse(fs.readFileSync(path.join(input.root, "dist", "version.json"), "utf8"));
  for (const data of [manifest, marker]) {
    assert.equal(data.buildId, input.sha);
    assert.equal(data.environment, "sandbox");
    assert.equal(data.projectId, sandboxProjectId);
  }
  assert.ok(manifest.files.length > 0);
  assert.deepEqual(manifest.files.map(entry => entry.file), manifest.files.map(entry => entry.file).sort());
  for (const entry of manifest.files) {
    assert.doesNotMatch(entry.file, /DS_Store|fixture|harness|\.tmp|\.temp/);
    const content = fs.readFileSync(path.join(input.root, "dist", entry.file));
    assert.equal(entry.sha256, crypto.createHash("sha256").update(content).digest("hex"));
  }
});

for (const [name, alias] of [["missing", ""], ["production", "clean-flow-prototipo"]]) {
  test(`Sandbox Hosting preparation rejects ${name} sandbox alias before building`, (t) => {
    const input = hostingFixture(t, alias);
    const result = prepare(input);
    assert.notEqual(result.status, 0);
    assert.match(result.diagnostic, /sandbox|alias|production/i);
    assert.equal(fs.existsSync(path.join(input.root, ".firebase", "hosting-prepared-manifest.json")), false);
    assert.equal(fs.existsSync(path.join(input.root, "dist", "index.html")), false);
  });
}
