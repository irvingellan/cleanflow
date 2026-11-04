// Synthetic pilot-feedback harness: Chromium desktop + WebKit iPhone 13, both themes.
// No emulators, Firebase project or network; see vite.config.js.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PILOT_HARNESS_PORT || 4292);
export default defineConfig({
  testDir: ".",
  testMatch: process.env.PILOT_SPECS ? process.env.PILOT_SPECS.split(",") : ["*.spec.js"],
  timeout: 60_000,
  workers: 2,
  reporter: [["list"]],
  outputDir: "../../test-results/pilot-feedback",
  use: { baseURL: `http://127.0.0.1:${port}`, colorScheme: "light", locale: "pt-BR", timezoneId: "America/Los_Angeles" },
  webServer: {
    command: `npx vite --config e2e/pilot-feedback/vite.config.js --port ${port} --strictPort`,
    cwd: "../..",
    url: `http://127.0.0.1:${port}/?screen=manager`,
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "desktop-dark", use: { browserName: "chromium", viewport: { width: 1440, height: 900 }, colorScheme: "dark" } },
    { name: "mobile-dark", use: { ...devices["iPhone 13"], browserName: "webkit", colorScheme: "dark" } },
  ],
});
