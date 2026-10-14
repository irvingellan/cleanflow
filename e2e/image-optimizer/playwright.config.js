import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "optimizer.browser.js", timeout: 60_000,
  workers: 1, retries: 0, reporter: "list",
  outputDir: "../../.superpowers/sdd/2026-10-13-checklist-multi-photo-v1/optimizer-browser-results",
  use: { baseURL: "http://127.0.0.1:4207", viewport: { width: 1100, height: 850 } },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --config e2e/image-optimizer/vite.config.js",
    cwd: "../..", url: "http://127.0.0.1:4207/e2e/image-optimizer/index.html", reuseExistingServer: false,
  },
});
