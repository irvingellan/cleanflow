import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./e2e/dashboard-v2", workers:1,retries:0,reporter:"line",outputDir:"test-results/dashboard-v2",
  use:{baseURL:"http://127.0.0.1:4213",browserName:"chromium"},
  webServer:{command:"npx vite --config e2e/dashboard-v2/vite.config.js --mode e2e",url:"http://127.0.0.1:4213/e2e/dashboard-v2/",reuseExistingServer:false}});
