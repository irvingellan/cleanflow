import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/design-system", workers: 1, retries: 0, reporter: "line",
  outputDir: "test-results/design-system", use: { baseURL: "http://127.0.0.1:4190", browserName: "chromium" },
  webServer: { command: "npx vite --config e2e/design-system/vite.config.js --host 127.0.0.1 --port 4190 --strictPort --mode e2e", url: "http://127.0.0.1:4190/design-system/catalog/", reuseExistingServer: false },
});
