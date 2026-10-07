import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  envDir: false, cacheDir: "node_modules/.vite-services-v2",
  optimizeDeps: { entries: ["e2e/services-v2/index.html"] },
  define: { __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-services-v2") },
  plugins: [react(), {
    name: "network-free-services-provider-boundary", enforce: "pre",
    resolveId(source) {
      if (source.endsWith("/services/firebase/client.js")) return path.resolve("e2e/lifecycle/provider-client.js");
      if (source.startsWith("firebase/")) return path.resolve("e2e/services-v2/provider-api.js");
      return null;
    },
  }],
});
