import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // This presentation harness has no credentials, SDK configuration or backend.
  envDir: false,
  cacheDir: "node_modules/.vite-lifecycle",
  optimizeDeps: { entries: ["e2e/lifecycle/job-detail.html"] },
  define: { __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-lifecycle-harness") },
  plugins: [
    react(),
    {
      name: "local-lifecycle-provider-boundary",
      enforce: "pre",
      resolveId(source) {
        if (source.endsWith("/services/firebase/client.js")) {
          return path.join(fixtureDirectory, "provider-client.js");
        }
        if (source.startsWith("firebase/")) {
          return path.join(fixtureDirectory, "provider-api.js");
        }
        return null;
      },
    },
  ],
});
