import { defineConfig } from "@playwright/test";
const port = process.env.CLEANFLOW_CATALOG_TEST_PORT || "4190";
export default defineConfig({
  testDir: "./e2e/design-system", workers: 1, retries: 0, reporter: "line",
  outputDir: "test-results/design-system", use: { baseURL: `http://127.0.0.1:${port}`, browserName: "chromium" },
  webServer: { command: `npx vite --config e2e/design-system/vite.config.js --host 127.0.0.1 --port ${port} --strictPort --mode e2e`, url: `http://127.0.0.1:${port}/design-system/catalog/`, reuseExistingServer: false },
});
