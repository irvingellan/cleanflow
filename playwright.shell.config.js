import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e/shell", workers: 1, fullyParallel: false, retries: 0, reporter: "line", outputDir: "test-results/shell",
  use: { baseURL: "http://127.0.0.1:4211", browserName: "chromium" },
  webServer: { command: "npx vite --config e2e/shell/vite.config.js --host 127.0.0.1 --port 4211 --strictPort --mode e2e", url: "http://127.0.0.1:4211/e2e/shell/index.html", reuseExistingServer: false },
});
