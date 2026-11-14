import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "selection.browser.js",
  timeout: 25_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4251", serviceWorkers: "block" },
  outputDir: "../../.tmp/gabi-evidence/cleaner-selection/browser-output",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --mode e2e --config e2e/cleaner-selection/vite.config.js",
    cwd: "../..",
    url: "http://127.0.0.1:4251/e2e/cleaner-selection/index.html",
    reuseExistingServer: false,
  },
});
