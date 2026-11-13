import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'integration.browser.js', workers: 1, retries: 0, timeout: 240000,
  reporter: './safeReporter.js', outputDir: '../../.tmp/issue-81/browser-output',
  use: { baseURL: 'http://127.0.0.1:14213', serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true } }],
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode emulator --config e2e/multi-photo-integration/vite.config.js', cwd: '../..',
    url: 'http://127.0.0.1:14214/e2e/multi-photo-integration/index.html', reuseExistingServer: false }
});
