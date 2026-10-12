// Memory/local synthetic receipts only. No Firebase import or network call.
const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') || 'incomplete';
const lang = params.get('lang') === 'pt' ? 'pt' : 'en';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const records = new Map();
const submissions = new Map();
function seed() {
  const complete = !['incomplete'].includes(scenario);
  return {
    checklist: { status: scenario === 'submitted' ? 'READY_FOR_REVIEW' : 'DRAFT', preferredLanguage: lang,
      propertyName: 'Synthetic Training Property', assignedCleanerName: 'Example Cleaner', scheduledDate: '2026-10-12', scheduledStart: '10:00',
      ...(scenario === 'submitted' ? { readyForReviewAt: '2026-10-12T17:00:00.000Z' } : {}),
      sections: [{ id: 'room', title: lang === 'pt' ? 'Sala' : 'Living room', items: [
        { id: 'floor', label: lang === 'pt' ? 'Limpar o piso' : 'Clean the floor' },
        { id: 'living-belongings', label: lang === 'pt' ? 'Verificar objetos esquecidos' : 'Check forgotten belongings', requiresPhoto: true },
      ] }], inventoryItems: [{ id: 'soap', label: lang === 'pt' ? 'Sabonete' : 'Soap' }], requiredPhotoTypes: [],
      evidence: ['incomplete', 'missing-photo'].includes(scenario) ? [] : [{ requirementId: 'living-belongings', contentType: 'image/png', sizeBytes: 70 }],
    },
    draft: { revision: 0, checklistAnswers: { floor: complete ? 'DONE' : 'UNANSWERED', 'living-belongings': complete ? 'DONE' : 'UNANSWERED' }, inventoryAnswers: { soap: complete ? 'HIGH' : 'UNANSWERED' }, issueNotes: '', generalNotes: '' },
  };
}
function record(token) {
  if (!token.startsWith('synthetic-checklist:')) throw new Error('Synthetic token only');
  if (!records.has(token)) records.set(token, JSON.parse(localStorage.getItem(token) || 'null') || seed());
  return records.get(token);
}
function persist(token) { localStorage.setItem(token, JSON.stringify(record(token))); }
export async function getPublicChecklist(token) { await pause(150); return structuredClone(record(token)); }
export async function savePublicChecklistDraft({ token, baseRevision, changes }) {
  await pause(250);
  const data = record(token);
  if (data.checklist.status !== 'DRAFT') throw { code: 'checklist_unavailable', status: 404 };
  if (baseRevision !== data.draft.revision) throw { status: 409 };
  data.draft = { ...data.draft, ...changes, revision: baseRevision + 1, checklistAnswers: { ...data.draft.checklistAnswers, ...changes.checklistAnswers }, inventoryAnswers: { ...data.draft.inventoryAnswers, ...changes.inventoryAnswers } };
  persist(token);
  return { revision: data.draft.revision, draft: structuredClone(data.draft) };
}
export async function readyPublicChecklistForReview({ token, submissionId, baseRevision }) {
  const data = record(token);
  if (submissions.has(submissionId)) return structuredClone(submissions.get(submissionId));
  await pause(scenario === 'submitting' ? 3000 : 500);
  if (scenario === 'error' && !window.__syntheticFailedOnce) { window.__syntheticFailedOnce = true; throw { code: 'checklist_request_failed' }; }
  const missingChecklistCount = Object.values(data.draft.checklistAnswers).filter(v => v !== 'DONE').length;
  const missingInventoryCount = Object.values(data.draft.inventoryAnswers).filter(v => v === 'UNANSWERED').length;
  const missingPhotoCount = data.checklist.evidence.length ? 0 : 1;
  if (missingChecklistCount || missingInventoryCount || missingPhotoCount) throw { code: 'checklist_requirements_missing', status: 422, requirements: { missingChecklistCount, missingInventoryCount, missingPhotoCount } };
  if (baseRevision !== data.draft.revision) throw { status: 409 };
  data.checklist.status = 'READY_FOR_REVIEW'; data.checklist.readyForReviewAt = new Date().toISOString(); persist(token);
  const response = structuredClone(data); submissions.set(submissionId, response);
  if (scenario === 'uncertain-response' && !window.__syntheticFailedOnce) { window.__syntheticFailedOnce = true; throw { code: 'checklist_request_failed' }; }
  return response;
}
export async function uploadPublicChecklistEvidence({ token, requirementId, file }) {
  await pause(1000);
  const data = record(token);
  if (data.checklist.status !== 'DRAFT' || data.checklist.evidence.length) throw { code: 'checklist_photo_unavailable' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw { code: 'checklist_photo_invalid_type' };
  if (file.size > 5 * 1024 * 1024) throw { code: 'checklist_photo_too_large' };
  data.checklist.evidence = [{ requirementId, contentType: file.type, sizeBytes: file.size }]; persist(token);
  return { evidence: structuredClone(data.checklist.evidence) };
}
export function publicChecklistEvidenceUrl() { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1sAAAAASUVORK5CYII='; }
