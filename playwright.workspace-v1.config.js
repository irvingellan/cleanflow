import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-workspace", testMatch: "workspace-v1.spec.js",
  use: { baseURL: "http://127.0.0.1:5188", browserName: "chromium" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 5188 --strictPort --mode e2e", url: "http://127.0.0.1:5188/workspace-intent-preview.html", reuseExistingServer: false },
});
