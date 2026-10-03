import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectHostingBuild } from "./prepareHosting.mjs";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hosting-hygiene-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of ["index.html", "sw.js", "firebase-messaging-sw.js"]) fs.writeFileSync(path.join(dir, file), "synthetic");
  fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify({ buildId: "expected" }));
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets/index-demo.js"), "synthetic");
  return dir;
}
test("root and nested DS_Store are removed and never enter stable deployable manifest", t => {
  const dir = fixture(t);
  for (const file of [".DS_Store", "assets/.DS_Store"]) fs.writeFileSync(path.join(dir, file), "Finder");
  const manifest = inspectHostingBuild(dir, "expected", []);
  assert.equal(manifest.some(entry => entry.file.includes("DS_Store")), false);
  assert.equal(fs.existsSync(path.join(dir, ".DS_Store")), false);
  assert.deepEqual(inspectHostingBuild(dir, "expected", []), manifest);
});
test("unexpected temporary or harness files fail closed", t => {
  const dir = fixture(t);
  for (const file of ["upload.tmp", "test.html", "assets/.hidden"]) {
    fs.writeFileSync(path.join(dir, file), "unexpected");
    assert.throws(() => inspectHostingBuild(dir, "expected", []), /Unexpected|artifact/);
    fs.unlinkSync(path.join(dir, file));
  }
});
test("wrong build SHA, missing public assets and symlinks fail closed", t => {
  const dir = fixture(t);
  assert.throws(() => inspectHostingBuild(dir, "other", []), /build ID/);
  assert.throws(() => inspectHostingBuild(dir, "expected", ["icon.png"]), /Missing/);
  fs.symlinkSync(path.join(dir, "index.html"), path.join(dir, "linked.html"));
  assert.throws(() => inspectHostingBuild(dir, "expected", []), /Symlink/);
});
test("Hosting ignores Finder artifacts even if recreated after preparation", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../firebase.json", import.meta.url)));
  assert.ok(config.hosting.ignore.includes(".DS_Store"));
  assert.ok(config.hosting.ignore.includes("**/.DS_Store"));
});

test("same preparation validates Sandbox and production binding, not only SHA", t => {
  const dir = fixture(t);
  const binding = { environment: "sandbox", projectId: "cleanflow-sandbox-fixture" };
  fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify({ buildId: "expected", ...binding }));
  assert.ok(inspectHostingBuild(dir, "expected", [], binding).length);
  assert.throws(() => inspectHostingBuild(dir, "expected", [], { environment: "production", projectId: "clean-flow-prototipo" }), /environment\/project/);
  fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify({ buildId: "expected", environment: "sandbox", projectId: "clean-flow-prototipo" }));
  assert.throws(() => inspectHostingBuild(dir, "expected", [], binding), /environment\/project/);
});
