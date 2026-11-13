import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [react()], resolve: { alias: [
  { find: /^.*\bchecklistRunService\.js$/, replacement: fileURLToPath(new URL('./actualManagerBridge.js', import.meta.url)) },
  { find: /^.*\bclientReportService\.js$/, replacement: fileURLToPath(new URL('./actualManagerBridge.js', import.meta.url)) },
] }, server: { host: '127.0.0.1', port: 14214, strictPort: true } });
