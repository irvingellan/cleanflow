// Synthetic security verification only. Never starts/stops a user's emulator.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import net from "node:net";
const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cleanflow-rc-security-"));
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
try {
  const ports = {};
  for (const name of ["firestore", "storage", "hub", "logging"]) ports[name] = await freePort();
  for (const directory of ["node_modules", "functions"]) fs.symlinkSync(path.join(root, directory), path.join(scratch, directory), "dir");
  fs.mkdirSync(path.join(scratch, "security"));
  for (const file of ["firestore.rules", "storage.rules"]) fs.copyFileSync(path.join(root, file), path.join(scratch, file));
  const source = fs.readFileSync(path.join(root, "security/managerAuthorization.test.mjs"), "utf8")
    .replaceAll("8080", String(ports.firestore)).replaceAll("9199", String(ports.storage));
  fs.writeFileSync(path.join(scratch, "security/managerAuthorization.test.mjs"), source);
  fs.writeFileSync(path.join(scratch, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(scratch, "firebase.json"), JSON.stringify({
    firestore: { rules: "firestore.rules" }, storage: { rules: "storage.rules" },
    emulators: { firestore: { host: "127.0.0.1", port: ports.firestore }, storage: { host: "127.0.0.1", port: ports.storage }, hub: { host: "127.0.0.1", port: ports.hub }, logging: { host: "127.0.0.1", port: ports.logging }, ui: { enabled: false }, singleProjectMode: true },
  }));
  const result = spawnSync(path.join(root, "node_modules/.bin/firebase"), ["emulators:exec", "--project", "demo-cleanflow", "--only", "firestore,storage", "node --test --test-concurrency=1 security/managerAuthorization.test.mjs"], { cwd: scratch, stdio: "inherit", timeout: 180_000 });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
