import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const fixtures = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({ envDir: false, cacheDir: "node_modules/.vite-shell", define: { __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-shell-pilot") },
  plugins: [react(), { name: "shell-provider-boundary", enforce: "pre", resolveId(source) {
    if (source.endsWith("/services/firebase/client.js")) return path.join(fixtures, "../lifecycle/provider-client.js");
    if (source.startsWith("firebase/")) return path.join(fixtures, "../lifecycle/provider-api.js");
    return null;
  } }],
});
