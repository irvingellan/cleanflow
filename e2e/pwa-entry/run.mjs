import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Only Hosting runs. All browser requests outside this private loopback origin
// are blocked; tests do not sign in, request push permission, or contact FCM.
const denied = "/nonexistent/cleanflow-pwa-entry-no-production-credentials.json";
if (existsSync(denied)) throw new Error("Credential-denial path unexpectedly exists.");
const root = process.cwd();
const source = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  workingTreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
};
mkdirSync(path.join(root, ".tmp"), { recursive: true });
const evidence = mkdtempSync(path.join(root, ".tmp", "pwa-entry-"));
const tmpdir = mkdtempSync("/tmp/cleanflow-pwa-");
const port = Number(process.env.PWA_ENTRY_PORT || "36281");
if (!Number.isInteger(port) || port < 1024 || port > 65000) throw new Error("Invalid private Hosting port.");
const env = {
  ...process.env,
  GITHUB_SHA: source.head,
  GOOGLE_APPLICATION_CREDENTIALS: denied,
  GCLOUD_PROJECT: "demo-cleanflow",
  GOOGLE_CLOUD_PROJECT: "demo-cleanflow",
  TMPDIR: tmpdir,
  PWA_ENTRY_BASE_URL: `http://127.0.0.1:${port}`,
  PWA_ENTRY_OUTPUT_DIR: path.join(evidence, "browser-output"),
  PWA_ENTRY_REPORT: path.join(evidence, "browser-report.json"),
};
const firebase = JSON.parse(readFileSync("firebase.json", "utf8"));
const buildDirectory = path.join(evidence, "dist");
const config = {
  hosting: { ...firebase.hosting, public: "dist" },
  emulators: {
    hosting: { host: "127.0.0.1", port },
    hub: { host: "127.0.0.1", port: port + 109 },
    logging: { host: "127.0.0.1", port: port + 110 },
    ui: { enabled: false },
    singleProjectMode: false,
  },
};
const configPath = path.join(evidence, "firebase.json");
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
const run = (script, args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script, ...args], { env, stdio: "inherit" });
  child.once("error", reject);
  child.once("close", (code) => resolve(code ?? 1));
});
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
console.log(`PWA entry evidence: ${evidence}`);
let code = await run("node_modules/vite/bin/vite.js", ["build", "--mode", "emulator", "--outDir", buildDirectory]);
if (code === 0) {
  const command = [process.execPath, path.join(root, "node_modules/@playwright/test/cli.js"), "test", "--config=e2e/pwa-entry/playwright.config.js", ...process.argv.slice(2)].map(quote).join(" ");
  code = await run("node_modules/firebase-tools/lib/bin/firebase.js", ["emulators:exec", "--config", configPath, "--project", "demo-cleanflow", "--only", "hosting", "--log-verbosity", "QUIET", command]);
}
writeFileSync(path.join(evidence, "run-status.json"), JSON.stringify({ status: code === 0 ? "PASS" : "FAIL", exitCode: code, source, build: existsSync(path.join(evidence, "dist/version.json")) ? JSON.parse(readFileSync(path.join(evidence, "dist/version.json"), "utf8")) : null, scope: "Local Hosting plus synthetic Chromium mobile and actual WebKit; not physical installation or installed-app migration acceptance", evidence }, null, 2) + "\n");
process.exit(code);
