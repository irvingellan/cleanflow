import { defineConfig } from "@playwright/test";

// Real app build on isolated emulators (firebase.cleaner-hub-e2e.json ports).
export default defineConfig({
  testDir: ".",
  testMatch: process.env.DEFINITIVE_UI_SPECS || "*.spec.js",
  timeout: 900_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  outputDir: "../../test-results/definitive-ui/output",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:15281",
    serviceWorkers: "block",
    actionTimeout: 20_000,
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
