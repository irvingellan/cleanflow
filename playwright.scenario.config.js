import { defineConfig } from "@playwright/test";

const mode = process.env.SCENARIO_MODE || "fast";
const watch = mode === "watch";
const record = mode === "record";
const mobile = process.env.SCENARIO_MOBILE === "1";

export default defineConfig({
  testDir: "./e2e/scenarios",
  globalSetup: "./e2e/globalSetup.js",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  outputDir: "test-results/scenarios",
  reporter: [
    ["dot"],
    ["json", { outputFile: "test-results/scenario-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5002",
    serviceWorkers: "block",
    headless: !watch,
    launchOptions: { slowMo: watch ? 400 : 0 },
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: record ? "on" : "retain-on-failure",
    video: record ? "on" : "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
