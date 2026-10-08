import { defineConfig } from "@playwright/test";
const experience = process.env.CLEANFLOW_RC_QA_EXPERIENCE;
if (!["current", "v2"].includes(experience)) throw Error("Specify synthetic RC QA experience");
export default defineConfig({
  testDir: "./e2e/authenticated-v2", testMatch: "production-rc.spec.js", workers: 1, retries: 0, reporter: "line",
  outputDir: `test-results/production-rc-${experience}`,
  use: { baseURL: "http://127.0.0.1:4232" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: "npx vite --config e2e/authenticated-v2/vite.config.js --host 127.0.0.1 --port 4232 --strictPort", url: "http://127.0.0.1:4232/e2e/authenticated-v2/index.html", reuseExistingServer: false },
});
