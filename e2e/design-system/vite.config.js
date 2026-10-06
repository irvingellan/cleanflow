import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  envDir: false,
  cacheDir: "node_modules/.vite-design-system",
  define: { __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-design-system-catalog") },
  plugins: [react()],
});
