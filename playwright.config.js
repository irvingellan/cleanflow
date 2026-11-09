import { defineConfig } from "@playwright/test";
import { managerE2ePorts } from "./e2e/globalSetup.js";

const ports = managerE2ePorts();

export default defineConfig({
  testDir: "./e2e",
  // Nested suites have their own runner and emulator or browser configuration.
  testMatch: /[/\\]e2e[/\\][^/\\]+\.spec\.[jt]s$/,
  globalSetup: "./e2e/globalSetup.js",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "vite --mode e2e --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    env: ports ? {
      VITE_USE_FIREBASE_EMULATORS: "true",
      VITE_CLEANFLOW_EMULATOR_AUTH_PORT: String(ports.auth),
      VITE_CLEANFLOW_EMULATOR_FIRESTORE_PORT: String(ports.firestore),
      VITE_CLEANFLOW_EMULATOR_FUNCTIONS_PORT: String(ports.functions),
    } : undefined,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
