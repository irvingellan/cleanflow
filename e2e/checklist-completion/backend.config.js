import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'backend.spec.js', timeout: 180000, workers: 1,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:5002', trace: 'off', screenshot: 'off', serviceWorkers: 'block' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 390, height: 844 } } }] });
