import { defineConfig } from "@playwright/test";
const port = Number(process.env.CLEANFLOW_CATALOG_QA_PORT || 4190);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./e2e/design-system", workers: 1, retries: 0, reporter: "line",
  outputDir: "test-results/design-system", use: { baseURL, browserName: "chromium" },
  webServer: { command: `npx vite --config e2e/design-system/vite.config.js --host 127.0.0.1 --port ${port} --strictPort --mode e2e`, url: `${baseURL}/design-system/catalog/`, reuseExistingServer: false },
});
