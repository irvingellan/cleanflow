import { defineConfig } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: '..', testMatch: ['mobile-photo-retry.spec.js', 'root-worker-transport.spec.js'],
  timeout: 30000, expect: { timeout: 15000 }, workers: 2, reporter: 'list', use: { baseURL: 'http://127.0.0.1:4196' },
  webServer: { command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4196 --strictPort', cwd: path.resolve(import.meta.dirname, '../..'), url: 'http://127.0.0.1:4196', reuseExistingServer: false },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
});
