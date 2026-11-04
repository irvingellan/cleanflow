import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// Builds the real app for the isolated emulator ports and runs the definitive UI
// capture/flow specs against it. Production credentials are denied; only demo-cleanflow.
const ports = { AUTH: "19280", FIRESTORE: "18280", FUNCTIONS: "15280", STORAGE: "19290" };
const denied = "/nonexistent/cleanflow-definitive-ui-no-production-credentials.json";
if (existsSync(denied)) throw new Error("Credential-denial path unexpectedly exists.");
const env = {
  ...process.env,
  GOOGLE_APPLICATION_CREDENTIALS: denied,
  GCLOUD_PROJECT: "demo-cleanflow",
  GOOGLE_CLOUD_PROJECT: "demo-cleanflow",
  NOTIFICATION_INBOX_MODE: "enabled",
  VITE_NOTIFICATION_INBOX_MODE: "enabled",
  AUTOMATIC_OFFERS_MODE: "disabled",
  VITE_AUTOMATIC_OFFERS_MODE: "disabled",
  ...Object.fromEntries(Object.entries(ports).map(([name, port]) => [`VITE_CLEANFLOW_EMULATOR_${name}_PORT`, port])),
};
if (!env.JAVA_HOME && existsSync("/opt/homebrew/opt/openjdk@21/bin/java")) env.JAVA_HOME = "/opt/homebrew/opt/openjdk@21";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

let code = process.env.DEFINITIVE_UI_SKIP_BUILD ? 0 : await run("./node_modules/.bin/vite", ["build", "--mode", "emulator"]);
if (code !== 0) process.exit(code);
code = await run("./node_modules/.bin/firebase", [
  "emulators:exec", "--config", "firebase.cleaner-hub-e2e.json", "--project", "demo-cleanflow",
  "--only", "auth,firestore,functions,storage,hosting", "--log-verbosity", "QUIET",
  `./node_modules/.bin/playwright test --config=e2e/definitive-ui/playwright.config.js ${process.argv.slice(2).join(" ")}`,
]);
process.exit(code);
