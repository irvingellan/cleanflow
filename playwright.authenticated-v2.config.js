import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/authenticated-v2", workers: 1, retries: 0, reporter: "line",
  outputDir: "test-results/authenticated-v2",
  use: { baseURL: "http://127.0.0.1:4220", viewport: { width: 1440, height: 1000 } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: "npx vite --config e2e/authenticated-v2/vite.config.js --host 127.0.0.1 --port 4220 --strictPort", url: "http://127.0.0.1:4220/e2e/authenticated-v2/index.html", reuseExistingServer: false },
});
