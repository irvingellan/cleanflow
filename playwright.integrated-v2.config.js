import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./e2e/integrated-v2", workers:1, retries:0, reporter:"line",
  outputDir:"test-results/integrated-v2",
  use:{baseURL:"http://127.0.0.1:4210",browserName:"chromium",viewport:{width:1440,height:1000}},
  webServer:{command:"npx vite --config e2e/integrated-v2/vite.config.js --host 127.0.0.1 --port 4210 --strictPort --mode e2e",url:"http://127.0.0.1:4210/e2e/integrated-v2/index.html",reuseExistingServer:true},
});
