import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'completion.spec.js', timeout: 30000, use: { baseURL: 'http://127.0.0.1:4195' }, reporter: 'list', projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }] });
