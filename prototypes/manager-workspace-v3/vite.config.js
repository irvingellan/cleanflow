// Standalone, synthetic prototype build. Not part of the Production app:
// no Firebase config, no env files, separate entry and output folder.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

export default defineConfig({
  root,
  base: "./",
  envDir: false,
  cacheDir: "node_modules/.vite-manager-workspace-v3",
  define: { __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-manager-workspace-v3") },
  plugins: [react()],
  server: { open: "/prototypes/manager-workspace-v3/index.html" },
  test: {
    environment: "jsdom",
    setupFiles: path.resolve(root, "src/test/setup.js"),
    include: ["src/prototypes/manager-workspace-v3/**/*.test.{js,jsx}"],
  },
  build: {
    outDir: path.resolve(root, "dist-prototypes/manager-workspace-v3"),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(here, "index.html") },
  },
});
