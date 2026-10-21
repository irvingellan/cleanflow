import path from "node:path";
import { defineConfig } from "vite";
import base from "../authenticated-v2/vite.config.js";
const emulator = process.env.CLEANFLOW_WORKSPACE_QA_MODE === "emulator";
// Original source is a read-only local benchmark, never a production entry.
const claudeSource = path.resolve("../../manager-workspace-v3-prototype/Clean Flow Gabriela/src/prototypes/manager-workspace-v3");
export default defineConfig({ ...base, resolve: { alias: { "@claude-v3": claudeSource }, dedupe: ["react", "react-dom"] }, server: { fs: { allow: [path.resolve("."), path.resolve(claudeSource, "../../..") ] } }, define: { ...base.define, ...(emulator ? {
  "import.meta.env.MODE": '"emulator"',
  "import.meta.env.VITE_CLEANFLOW_ENV": '"emulator"',
  "import.meta.env.VITE_FIREBASE_PROJECT_ID": '"demo-cleanflow"',
} : {}) }, cacheDir: `node_modules/.vite-workspace-v3${emulator ? "-emulator" : ""}`, plugins: [{ name: "workspace-synthetic-boundary", enforce: "pre", resolveId(source) { if (source.startsWith("firebase/")) return path.resolve("e2e/workspace-v3/provider-api.js"); return null; } }, ...base.plugins] });
