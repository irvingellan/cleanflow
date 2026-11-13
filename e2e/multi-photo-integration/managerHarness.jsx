import React from 'react';
import { createRoot } from 'react-dom/client';
import { TranslationProvider } from '../../src/i18n/translations.js';
import { ChecklistRunDetail } from '../../src/features/checklists/ChecklistRunDetail.jsx';
import '../../src/index.css';
const root = createRoot(document.getElementById('root'));
// Playwright supplies an actual authenticated callable projection and forwards
// explicit image selections to the same real callable. No synthetic API/result.
window.renderAuthorizedManager = (projection) => root.render(<TranslationProvider><ChecklistRunDetail
  job={projection.job} checklistRun={projection.run} onBack={() => {}}
  loadEvidence={async (jobId, requirementId, evidenceId, options) => {
    const result = await window.actualManagerEvidence({ jobId, ...(evidenceId ? { evidenceId } : { requirementId }), variant: options?.variant });
    return new Blob([Uint8Array.from(atob(result.base64), c => c.charCodeAt(0))], { type: result.contentType });
  }}
/></TranslationProvider>);
