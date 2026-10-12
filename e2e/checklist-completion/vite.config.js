import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
export default defineConfig({ root, plugins: [react(), { name: 'synthetic-checklist-boundary', enforce: 'pre', resolveId(id, importer) {
  if (importer?.includes('/features/checklists/') && id.endsWith('checklistCapabilityService.js')) return path.join(root, 'e2e/checklist-completion/adapter.js');
  if (importer?.includes('/features/checklists/') && id.endsWith('publicChecklistLoadDiagnostics.js')) return path.join(root, 'e2e/checklist-completion/diagnostics.js');
} }], resolve: { dedupe: ['react', 'react-dom'] }, server: { host: '127.0.0.1', port: 4194, strictPort: true, fs: { allow: [root] } } });
