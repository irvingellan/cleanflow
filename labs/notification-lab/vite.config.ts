import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Offline lab: no proxy, no env injection, no external assets.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
});
