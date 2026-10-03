import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const scenarios = new Set(["manager-no-checklist", "manager-with-checklist", "offer-assignment", "weekly-close"]);
const usage = `CleanFlow local scenarios (demo-cleanflow emulators only)

Usage: npm run scenario -- <scenario> [--fast|--watch|--record] [--mobile] [--repeat N]

Scenarios: ${[...scenarios].join(", ")}
Examples:
  npm run scenario -- manager-no-checklist --fast
  npm run scenario -- manager-with-checklist --watch --mobile
  npm run scenario -- offer-assignment --record
  npm run scenario -- manager-no-checklist --fast --repeat 3`;

function parseArgs(args) {
  if (args.length === 0 || args.includes("--help")) return null;
  const [scenario, ...options] = args;
  if (!scenarios.has(scenario)) throw new Error(`Unknown scenario: ${scenario}`);
  let mode = "fast";
  let mobile = false;
  let repeat = 1;
  let modeSeen = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (["--fast", "--watch", "--record"].includes(option)) {
      if (modeSeen) throw new Error("Choose only one mode.");
      mode = option.slice(2);
      modeSeen = true;
    } else if (option === "--mobile") {
      mobile = true;
    } else if (option === "--repeat") {
      const value = options[++index];
      if (!/^[1-9]\d*$/.test(value || "") || Number(value) > 100) {
        throw new Error("--repeat must be an integer from 1 to 100.");
      }
      repeat = Number(value);
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }
  return { scenario, mode, mobile, repeat };
}

function redactLocalTokens(line) {
  return line
    .replace(/(\/offer\/)[A-Za-z0-9_-]{20,}/g, "$1[emulator-token]")
    .replace(/(\/checklist\?t=)[A-Za-z0-9_-]{20,}/g, "$1[emulator-token]")
    .replace(/(\/client-report\?t=)[A-Za-z0-9_-]{20,}/g, "$1[emulator-token]")
    .replace(/(\btoken=)[A-Za-z0-9_-]{20,}/g, "$1[emulator-token]");
}

function run(command, args, env, { concise = false } = {}) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, { stdio: concise ? ["inherit", "pipe", "pipe"] : "inherit", env });
    if (concise) {
      const recent = [];
      const collect = (stream) => {
        let pending = "";
        const accept = (line) => {
          const safeLine = redactLocalTokens(line);
          recent.push(safeLine);
          if (recent.length > 100) recent.shift();
          if (/^\[\s*\d+%\]|^FAIL at |^\s*\d+ (passed|failed)\b/.test(safeLine)) {
            console.log(safeLine);
          }
        };
        stream.on("data", (chunk) => {
          pending += chunk.toString();
          const lines = pending.split(/\r?\n/);
          pending = lines.pop();
          lines.forEach(accept);
        });
        stream.on("end", () => { if (pending) accept(pending); });
      };
      collect(child.stdout);
      collect(child.stderr);
      child.on("close", (code) => {
        if (code !== 0) {
          console.error("Scenario/emulator diagnostic tail (local tokens redacted):");
          console.error(recent.join("\n"));
        }
      });
    }
    child.on("error", reject);
    child.on("close", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
}

function summarizeResults(path, expectedRuns, startedAt) {
  if (!existsSync(path) || statSync(path).mtimeMs < startedAt) return;
  const results = JSON.parse(readFileSync(path, "utf8"));
  const durations = [];
  function collect(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const result = test.results?.at(-1);
        if (result) durations.push({ duration: result.duration, status: result.status });
      }
    }
    for (const child of suite.suites || []) collect(child);
  }
  for (const suite of results.suites || []) collect(suite);
  const passed = durations.filter((item) => item.status === "passed").length;
  const failed = durations.length - passed;
  const average = durations.length
    ? (durations.reduce((sum, item) => sum + item.duration, 0) / durations.length / 1000).toFixed(1)
    : "n/a";
  if (expectedRuns > 1) {
    durations.forEach((item, index) => console.log(`Run ${index + 1}/${expectedRuns} ${item.status === "passed" ? "✅" : "❌"}`));
  }
  console.log(`Summary: ${passed} passed, ${failed} failed; average ${average}s`);
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  console.error(usage);
  process.exit(2);
}
if (!options) {
  console.log(usage);
  process.exit(0);
}

// The selected spec, project, and hosts are fixed here. No caller can redirect
// this command to a production Firebase project or arbitrary test file.
const environment = {
  ...process.env,
  SCENARIO_MODE: options.mode,
  SCENARIO_MOBILE: options.mobile ? "1" : "0",
  SCENARIO_RECORD: options.mode === "record" ? "1" : "0",
  SCENARIO_REPEAT: String(options.repeat),
};
// Fail closed if any code accidentally reaches a non-emulated Google service.
// Admin SDK calls to the local emulators work without production ADC.
const deniedCredentialPath = "/nonexistent/cleanflow-scenario-no-production-credentials.json";
if (existsSync(deniedCredentialPath)) {
  throw new Error("Scenario credential-denial path unexpectedly exists.");
}
environment.GOOGLE_APPLICATION_CREDENTIALS = deniedCredentialPath;
environment.GCLOUD_PROJECT = "demo-cleanflow";
environment.GOOGLE_CLOUD_PROJECT = "demo-cleanflow";
if (!environment.JAVA_HOME && existsSync("/opt/homebrew/opt/openjdk@21/bin/java")) {
  environment.JAVA_HOME = "/opt/homebrew/opt/openjdk@21";
}

console.log(`CleanFlow Scenario — ${options.scenario} (${options.mode}${options.mobile ? ", 390px" : ""})`);
const buildCode = await run("npm", ["run", "build:emulators"], environment);
if (buildCode !== 0) process.exit(buildCode);

console.log("[  0%] Starting demo-cleanflow emulators");
const playwrightCommand = [
  "./node_modules/.bin/playwright", "test",
  "--config=playwright.scenario.config.js",
  `${options.scenario}.spec.js`,
  "--workers=1", `--repeat-each=${options.repeat}`,
].join(" ");
const testStartedAt = Date.now();
const exitCode = await run("./node_modules/.bin/firebase", [
  "emulators:exec", "--project", "demo-cleanflow",
  "--only", "auth,firestore,functions,storage,hosting",
  "--log-verbosity", "QUIET", playwrightCommand,
], environment, { concise: true });
summarizeResults(resolve("test-results/scenario-results.json"), options.repeat, testStartedAt);
if (exitCode !== 0) {
  console.error(`Scenario failed. Playwright evidence: ${resolve("test-results/scenarios")}`);
}
process.exit(exitCode);
