import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '..', testMatch: ['node22-integration/runtime.browser.js', 'root-worker-transport.spec.js'],
  workers: 1, retries: 0, timeout: 120000, reporter: './safeReporter.js',
  outputDir: '../../.superpowers/sdd/2026-10-14-functions-node22-migration/browser-results',
  use: { baseURL: 'http://127.0.0.1:5012', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true } },
  ],
});
