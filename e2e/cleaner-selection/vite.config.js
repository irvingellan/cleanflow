import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{
      find: /^.*\bjobService\.js$/,
      replacement: fileURLToPath(new URL("./syntheticContext.js", import.meta.url)),
    }],
  },
  server: { host: "127.0.0.1", port: 4251, strictPort: true },
});
