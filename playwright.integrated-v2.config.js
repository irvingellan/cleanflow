import { defineConfig } from "@playwright/test";
const port = process.env.CLEANFLOW_INTEGRATED_QA_PORT || "4210";
export default defineConfig({
  testDir:"./e2e/integrated-v2", workers:1, retries:0, reporter:"line",
  outputDir:"test-results/integrated-v2",
  use:{baseURL:`http://127.0.0.1:${port}`,browserName:"chromium",viewport:{width:1440,height:1000}},
  webServer:{command:`npx vite --config e2e/integrated-v2/vite.config.js --host 127.0.0.1 --port ${port} --strictPort --mode e2e`,url:`http://127.0.0.1:${port}/e2e/integrated-v2/index.html`,reuseExistingServer:!process.env.CLEANFLOW_INTEGRATED_QA_PORT},
});
