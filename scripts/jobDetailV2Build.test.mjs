import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repository = fileURLToPath(new URL("../", import.meta.url));
// Compile only an all-synthetic mirror. Never load developer .env or initialize Firebase.
for (const mode of ["production", "sandbox"]) test(`${mode} bundle isolates Job Detail F1 correctly`, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cleanflow-f1-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ["src", "public", "functions/src", "scripts", "design-system"]) fs.cpSync(path.join(repository, directory), path.join(root, directory), { recursive: true, filter: source => !path.basename(source).startsWith(".") });
  for (const file of ["index.html", "package.json", "vite.config.js"]) fs.copyFileSync(path.join(repository, file), path.join(root, file));
  fs.symlinkSync(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
  const project = mode === "production" ? "clean-flow-prototipo" : "cleanflow-sandbox-fixture";
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(VITE_|CLEANFLOW_|FIREBASE_|GOOGLE_|GCLOUD_|GITHUB_SHA$)/.test(key)));
  Object.assign(env, {
    GITHUB_SHA: "f1-synthetic-build-proof", VITE_CLEANFLOW_ENV: mode,
    VITE_CLEANFLOW_SANDBOX_PROJECT_ID: "cleanflow-sandbox-fixture",
    VITE_FIREBASE_API_KEY: "synthetic-not-a-credential", VITE_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
    VITE_FIREBASE_PROJECT_ID: project, VITE_FIREBASE_STORAGE_BUCKET: `${project}.firebasestorage.app`,
    VITE_FIREBASE_MESSAGING_SENDER_ID: "1234567890", VITE_FIREBASE_APP_ID: "1:1234567890:web:synthetic",
    VITE_FIREBASE_VAPID_KEY: "", VITE_ONESIGNAL_APP_ID: "",
  });
  const result = spawnSync("npm", ["run", mode === "sandbox" ? "build:sandbox" : "build"], { cwd: root, env, encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(root, "dist");
  const marker = JSON.parse(fs.readFileSync(path.join(output, "version.json"), "utf8"));
  assert.equal(marker.environment, mode); assert.equal(marker.projectId, project);
  const assets = fs.readdirSync(path.join(output, "assets"));
  const source = assets.filter(name => /\.(js|css)$/.test(name)).map(name => fs.readFileSync(path.join(output, "assets", name), "utf8")).join("\n");
  if (mode === "production") {
    assert.doesNotMatch(source, /job-detail-v2|job-v2-decision|job-v2-comparison/);
    assert.equal(assets.some(name => name.startsWith("JobDetailV2Pilot")), false);
  } else assert.match(source, /job-v2-decision/);
  assert.equal(fs.existsSync(path.join(output, "e2e")), false);
  assert.doesNotMatch(source, /__f1Calls|synthetic-archived|Local synthetic scenario/);
});
