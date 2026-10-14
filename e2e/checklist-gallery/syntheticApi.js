// Synthetic in-memory test boundary. No Firebase/provider/config or real data.
let checklist; let draft; let revision; let uploads = 0;
export function reset({ count = 0, ready = false } = {}) {
  revision = count; uploads = 0;
  checklist = { status: ready ? "READY_FOR_REVIEW" : "DRAFT", preferredLanguage: "en", propertyName: "Synthetic property",
    evidencePolicy: { version: 2, maxPhotos: 20 }, evidenceRevision: revision,
    evidence: Array.from({ length: count }, (_, i) => ({ evidenceId: crypto.randomUUID(), requirementId: i ? "additional" : "living-belongings", contentType: "image/jpeg", sizeBytes: 100 })),
    sections: [{ id: "living", title: "Living room", items: [{ id: "living-belongings", label: "Check belongings", requiresPhoto: true }] }], inventoryItems: [] };
  draft = { revision: 0, checklistAnswers: { "living-belongings": "DONE" }, inventoryAnswers: {}, issueNotes: "", generalNotes: "" };
}
reset();
export const getPublicChecklist = async () => ({ checklist: structuredClone(checklist), draft: structuredClone(draft) });
export const publicChecklistEvidenceUrl = (_token, _purpose, evidenceId) => `/api/synthetic-photo?evidenceId=${evidenceId}`;
export const savePublicChecklistDraft = async ({ changes }) => {
  draft = { ...draft, ...changes, revision: draft.revision + 1 }; return { revision: draft.revision, draft: structuredClone(draft) };
};
export const readyPublicChecklistForReview = async () => { checklist.status = "READY_FOR_REVIEW"; return getPublicChecklist(); };
export async function uploadPublicChecklistEvidence({ requirementId, file, signal }) {
  if (signal.aborted) throw new Error("disposed");
  const evidenceId = crypto.randomUUID(); uploads++;
  const bytes = await file.arrayBuffer();
  if (signal.aborted) throw new Error("disposed");
  checklist.evidence.push({ evidenceId, requirementId, contentType: file.type, sizeBytes: bytes.byteLength }); checklist.evidenceRevision = ++revision;
  return { evidenceId, evidenceRevision: revision, evidence: structuredClone(checklist.evidence) };
}
export async function removePublicChecklistEvidence({ evidenceId }) {
  checklist.evidence = checklist.evidence.filter((p) => p.evidenceId !== evidenceId); checklist.evidenceRevision = ++revision;
  return { removed: true, evidenceRevision: revision, evidence: structuredClone(checklist.evidence) };
}
export function summary() { return { count: checklist.evidence.length, uploads, purposes: checklist.evidence.map((p) => p.requirementId), types: checklist.evidence.map((p) => p.contentType) }; }
