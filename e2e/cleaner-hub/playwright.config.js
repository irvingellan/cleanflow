import { defineConfig } from "@playwright/test";

// Isolated Cleaner Hub integration: real Hosting/Auth/Firestore/Functions emulators
// on dedicated ports (see firebase.cleaner-hub-e2e.json). Never targets a cloud project.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.js",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  outputDir: "../../test-results/cleaner-hub",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:15281",
    serviceWorkers: "block",
    viewport: { width: 1280, height: 860 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium-manager+webkit-cleaner", use: { browserName: "chromium" } }],
});
