import path from "node:path";
import { defineConfig } from "vite";
import base from "../authenticated-v2/vite.config.js";
const emulator = process.env.CLEANFLOW_WORKSPACE_QA_MODE === "emulator";
export default defineConfig({ ...base, define: { ...base.define, ...(emulator ? {
  "import.meta.env.MODE": '"emulator"',
  "import.meta.env.VITE_CLEANFLOW_ENV": '"emulator"',
  "import.meta.env.VITE_FIREBASE_PROJECT_ID": '"demo-cleanflow"',
} : {}) }, cacheDir: `node_modules/.vite-workspace-v3${emulator ? "-emulator" : ""}`, plugins: [{ name: "workspace-synthetic-boundary", enforce: "pre", resolveId(source) { if (source.startsWith("firebase/")) return path.resolve("e2e/workspace-v3/provider-api.js"); return null; } }, ...base.plugins] });
