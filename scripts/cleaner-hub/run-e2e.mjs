import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// Builds the real app for the isolated emulator ports and runs the Cleaner Hub
// integration suite. Production credentials are denied; only demo-cleanflow is used.
const ports = { AUTH: "19280", FIRESTORE: "18280", FUNCTIONS: "15280", STORAGE: "19290" };
const denied = "/nonexistent/cleanflow-cleaner-hub-no-production-credentials.json";
if (existsSync(denied)) throw new Error("Credential-denial path unexpectedly exists.");
const env = {
  ...process.env,
  GOOGLE_APPLICATION_CREDENTIALS: denied,
  GCLOUD_PROJECT: "demo-cleanflow",
  GOOGLE_CLOUD_PROJECT: "demo-cleanflow",
  NOTIFICATION_INBOX_MODE: "enabled",
  VITE_NOTIFICATION_INBOX_MODE: "enabled",
  // Faster server re-check so stalled-stream recovery is observable in one run.
  VITE_CLEANER_HUB_VERIFY_INTERVAL_MS: "5000",
  ...Object.fromEntries(Object.entries(ports).map(([name, port]) => [`VITE_CLEANFLOW_EMULATOR_${name}_PORT`, port])),
};
if (!env.JAVA_HOME && existsSync("/opt/homebrew/opt/openjdk@21/bin/java")) env.JAVA_HOME = "/opt/homebrew/opt/openjdk@21";

function run(command, args, testEnvironment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: testEnvironment });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const extra = process.argv.slice(2).join(" ");
const automaticScenario = "'automatic offer confirms'";
for (const [mode, grep] of [
  ["disabled", `--grep-invert ${automaticScenario}`],
  ["enabled", `--grep ${automaticScenario}`],
]) {
  const testEnvironment = { ...env, AUTOMATIC_OFFERS_MODE: mode, VITE_AUTOMATIC_OFFERS_MODE: mode };
  let code = await run("./node_modules/.bin/vite", ["build", "--mode", "emulator"], testEnvironment);
  if (code !== 0) process.exit(code);
  code = await run("./node_modules/.bin/firebase", [
    "emulators:exec", "--config", "firebase.cleaner-hub-e2e.json", "--project", "demo-cleanflow",
    "--only", "auth,firestore,functions,storage,hosting", "--log-verbosity", "QUIET",
    `./node_modules/.bin/playwright test --config=e2e/cleaner-hub/playwright.config.js ${grep} ${extra ? `--pass-with-no-tests ${extra}` : ""}`,
  ], testEnvironment);
  if (code !== 0) process.exit(code);
}
