import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  envDir: false, publicDir: false, cacheDir: "node_modules/.vite-integrated-v2", plugins: [react(), {
    name: "integrated-memory-only-boundary", enforce: "pre",
    resolveId(source) {
      if (source.endsWith("/services/firebase/client.js")) return path.resolve(here,"../lifecycle/provider-client.js");
      if (source.startsWith("firebase/")) return path.join(here,"provider-api.js");
      return null;
    },
  }], define: { __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-integrated-v2") },
  build: { outDir: "artifacts/integrated-v2-local-build", rolldownOptions: { input: path.join(here,"index.html") } },
});
