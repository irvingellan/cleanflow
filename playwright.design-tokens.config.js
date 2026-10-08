import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/design-tokens",
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: "test-results/design-tokens",
  use: { baseURL: "http://127.0.0.1:4189", browserName: "chromium" },
  webServer: {
    command: "npx vite --config e2e/lifecycle/vite.config.js --host 127.0.0.1 --port 4189 --strictPort --mode e2e",
    url: "http://127.0.0.1:4189/e2e/lifecycle/compact.html",
    reuseExistingServer: false,
  },
});
