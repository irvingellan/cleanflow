import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "gallery.browser.js", timeout: 30_000, workers: 1, retries: 0, reporter: "list",
  outputDir: "../../.superpowers/sdd/2026-10-13-checklist-multi-photo-v1/gallery-browser-results",
  use: { baseURL: "http://127.0.0.1:4213", viewport: { width: 390, height: 844 } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: "node node_modules/vite/bin/vite.js --config e2e/checklist-gallery/vite.config.js", cwd: "../..",
    url: "http://127.0.0.1:4213/e2e/checklist-gallery/index.html", reuseExistingServer: false } });
