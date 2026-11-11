import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PWA_ENTRY_BASE_URL;
if (!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error("Run through e2e/pwa-entry/run.mjs against isolated loopback Hosting.");
}

export default defineConfig({
  testDir: ".",
  testMatch: ["entry.spec.js", "startup.spec.js"],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  outputDir: process.env.PWA_ENTRY_OUTPUT_DIR,
  reporter: [["list"], ["json", { outputFile: process.env.PWA_ENTRY_REPORT }]],
  use: { baseURL, locale: "pt-BR", serviceWorkers: "allow", actionTimeout: 10_000 },
  projects: [
    { name: "webkit-mac-1280", testMatch: "startup.spec.js", use: { browserName: "webkit", viewport: { width: 1280, height: 720 } } },
    { name: "webkit-mac-1024", testMatch: "startup.spec.js", use: { browserName: "webkit", viewport: { width: 1024, height: 640 } } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
});
