import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'integration.browser.js', workers: 1, retries: 0, timeout: 180000,
  reporter: './safeReporter.js', outputDir: '../../.superpowers/sdd/2026-10-13-checklist-multi-photo-v1/integration-browser-results',
  use: { baseURL: 'http://127.0.0.1:5012', serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true } }],
  webServer: { command: 'node node_modules/vite/bin/vite.js --config e2e/multi-photo-integration/vite.config.js', cwd: '../..',
    url: 'http://127.0.0.1:4214/e2e/multi-photo-integration/index.html', reuseExistingServer: false }
});
