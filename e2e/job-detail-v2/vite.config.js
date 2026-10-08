import { defineConfig, mergeConfig } from "vite";
import lifecycle from "../lifecycle/vite.config.js";
export default mergeConfig(lifecycle, defineConfig({ cacheDir: "node_modules/.vite-job-detail-f1", optimizeDeps: { entries: ["e2e/job-detail-v2/index.html"] } }));
