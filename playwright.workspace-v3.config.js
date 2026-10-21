import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e/workspace-v3", workers: 1, retries: 0, reporter: "line", outputDir: "test-results/workspace-v3",
  use: { baseURL: "http://127.0.0.1:4317", timezoneId: "America/Los_Angeles" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: "npx vite --config e2e/workspace-v3/vite.config.js --host 127.0.0.1 --port 4317 --strictPort", url: "http://127.0.0.1:4317/e2e/workspace-v3/index.html", reuseExistingServer: false },
});
