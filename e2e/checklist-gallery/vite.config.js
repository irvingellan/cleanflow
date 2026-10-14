import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({ plugins: [react()], resolve: { alias: [
  { find: /^.*\bchecklistCapabilityService\.js$/, replacement: fileURLToPath(new URL("./syntheticApi.js", import.meta.url)) },
] }, server: { host: "127.0.0.1", port: 4213, strictPort: true } });
