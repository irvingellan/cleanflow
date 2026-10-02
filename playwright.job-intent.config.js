import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/intent", testMatch: "job-detail-intents.spec.js",
  use: { baseURL: "http://127.0.0.1:5189", browserName: "chromium" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 5189 --strictPort --mode e2e", url: "http://127.0.0.1:5189/e2e/intent/job-detail.html", reuseExistingServer: false },
});
