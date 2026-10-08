import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/job-detail-v2", workers: 1, retries: 0, reporter: "line",
  outputDir: "test-results/job-detail-v2",
  use: { baseURL: "http://127.0.0.1:4201", browserName: "chromium", viewport: { width: 1440, height: 1000 } },
  webServer: { command: "npx vite --config e2e/job-detail-v2/vite.config.js --host 127.0.0.1 --port 4201 --strictPort --mode e2e", url: "http://127.0.0.1:4201/e2e/job-detail-v2/index.html", reuseExistingServer: true },
});
