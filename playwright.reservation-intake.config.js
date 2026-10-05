import { defineConfig } from "@playwright/test";
const baseURL = "http://127.0.0.1:4191";
export default defineConfig({
  testDir: "./e2e/reservation-intake", workers: 1, retries: 0, reporter: "line",
  outputDir: "test-results/reservation-intake", use: { baseURL, browserName: "chromium" },
  webServer: { command: "npx vite --config e2e/lifecycle/vite.config.js --host 127.0.0.1 --port 4191 --strictPort --mode e2e",
    url: `${baseURL}/e2e/reservation-intake/inbox.html`, reuseExistingServer: false },
});
