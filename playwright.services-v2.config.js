import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/services-v2", workers: 1, retries: 0, reporter: "line",
  outputDir: "test-results/services-v2", use: { baseURL: "http://127.0.0.1:4196", browserName: "chromium" },
  webServer: { command: "npx vite --config e2e/services-v2/vite.config.js --host 127.0.0.1 --port 4196 --strictPort --mode e2e", url: "http://127.0.0.1:4196/e2e/services-v2/", reuseExistingServer: false },
});
