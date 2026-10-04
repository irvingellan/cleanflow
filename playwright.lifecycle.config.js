import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4188";

export default defineConfig({
  testDir: "./e2e/lifecycle",
  testMatch: ["job-detail-lifecycle.spec.js", "compact.spec.js"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: "test-results/lifecycle",
  use: { baseURL, browserName: "chromium" },
  webServer: {
    command: "npx vite --config e2e/lifecycle/vite.config.js --host 127.0.0.1 --port 4188 --strictPort --mode e2e",
    url: `${baseURL}/e2e/lifecycle/job-detail.html`,
    reuseExistingServer: false,
  },
});
