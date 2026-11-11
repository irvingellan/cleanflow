import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const denied = "/nonexistent/cleanflow-manager-e2e-no-credentials.json";
const secretFile = new URL("../functions/.secret.local", import.meta.url);
const fixtures = "DEV_CENTER_DEVELOPER_UIDS=synthetic-e2e-nonmember\nGITHUB_FEEDBACK_TOKEN=synthetic-e2e-disabled\n";
if (existsSync(denied)) throw new Error("Credential-denial path unexpectedly exists.");

// Firebase reads emulator secret overrides from this exact file. Exclusive
// creation keeps an existing local file or another test run safe.
try {
  writeFileSync(secretFile, fixtures, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error.code === "EEXIST") throw new Error("Run manager E2E in a worktree without an existing functions/.secret.local.");
  throw error;
}
try {
  const result = spawnSync("./node_modules/.bin/firebase", [
    "emulators:exec", "--config", "firebase.manager-e2e.json", "--project", "demo-cleanflow",
    "--only", "auth,firestore,functions", "playwright test",
  ], {
    stdio: "inherit",
    env: {
      ...process.env,
      GOOGLE_APPLICATION_CREDENTIALS: denied,
      GCLOUD_PROJECT: "demo-cleanflow",
      GOOGLE_CLOUD_PROJECT: "demo-cleanflow",
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (existsSync(secretFile) && readFileSync(secretFile, "utf8") === fixtures) unlinkSync(secretFile);
}
