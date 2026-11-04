// Synthetic in-memory checklist boundary (fictitious data, no provider/network).
const params = new URLSearchParams(globalThis.location?.search || "");
const photoCount = Number(params.get("photos") || 3);
const withRequirements = params.get("requirements") === "1";
const lang = params.get("lang") || "pt";
const requirements = [
  { id: "req-beds", label: lang === "pt" ? "Embaixo das camas e móveis" : "Under beds and furniture", hint: lang === "pt" ? "Pertences esquecidos, lixo ou danos" : "Forgotten belongings, trash or damage" },
  { id: "req-kitchen", label: lang === "pt" ? "Cozinha pronta" : "Kitchen ready", hint: lang === "pt" ? "Pia, fogão e bancada" : "Sink, stove and counter" },
  { id: "req-bath", label: lang === "pt" ? "Banheiros prontos" : "Bathrooms ready" },
  { id: "req-beds-made", label: lang === "pt" ? "Camas arrumadas" : "Beds made" },
  { id: "req-towels", label: lang === "pt" ? "Toalhas e amenities" : "Towels and amenities" },
];
const linked = ["req-beds", "req-beds", "req-kitchen"];
let revision = photoCount;
const checklist = {
  status: "DRAFT", preferredLanguage: lang, propertyName: "Example Cottage (fictício)",
  evidencePolicy: { version: 2, maxPhotos: 20 }, evidenceRevision: revision,
  evidence: Array.from({ length: photoCount }, (_, i) => ({
    evidenceId: `synthetic-photo-${i + 1}`, requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 100,
    ...(withRequirements && linked[i] ? { photoRequirementId: linked[i] } : {}),
  })),
  ...(withRequirements ? { photoRequirements: requirements, photoRequirementsSample: true } : {}),
  sections: [{ id: "living", title: lang === "pt" ? "Sala e quartos" : "Living and bedrooms", items: [{ id: "living-belongings", label: lang === "pt" ? "Verificar sob camas e móveis se há pertences, lixo, danos ou algo incomum" : "Check underneath beds and furniture for belongings, trash, damage, or anything unusual", requiresPhoto: true }] }],
  inventoryItems: [],
};
let draft = { revision: 1, checklistAnswers: { "living-belongings": "DONE" }, inventoryAnswers: {}, issueNotes: "", generalNotes: "" };

const tiny = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#dce5e0"/><text x="160" y="105" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#52645b">Foto fictícia</text></svg>');

export const publicChecklistRequestTimeoutMilliseconds = 15_000;
export const maximumChecklistEvidenceSizeBytes = 5 * 1024 * 1024;
export const acceptedChecklistEvidenceContentTypes = ["image/jpeg", "image/png", "image/webp"];
export class PublicChecklistRequestError extends Error {}
const managerOnly = async () => { throw new Error("Manager checklist service is not part of this harness."); };
export const getChecklistCapability = managerOnly;
export const issueChecklistCapability = managerOnly;
export const revokeChecklistCapability = managerOnly;
export async function getPublicChecklist() { return { checklist: structuredClone(checklist), draft: structuredClone(draft) }; }
export function publicChecklistEvidenceUrl() { return tiny; }
export function validateChecklistEvidenceFile() { return null; }
export async function prepareChecklistEvidenceUploadBody(file) { return file; }
export async function uploadPublicChecklistEvidence({ requirementId, file }) {
  const evidenceId = `synthetic-photo-${checklist.evidence.length + 1}`;
  checklist.evidence.push({ evidenceId, requirementId, contentType: file.type, sizeBytes: file.size });
  checklist.evidenceRevision = ++revision;
  return { evidenceId, evidenceRevision: revision, evidence: structuredClone(checklist.evidence) };
}
export async function removePublicChecklistEvidence({ evidenceId }) {
  checklist.evidence = checklist.evidence.filter((photo) => photo.evidenceId !== evidenceId);
  checklist.evidenceRevision = ++revision;
  return { removed: true, evidenceRevision: revision, evidence: structuredClone(checklist.evidence) };
}
export async function savePublicChecklistDraft({ changes }) { draft = { ...draft, ...changes, revision: draft.revision + 1 }; return { revision: draft.revision, draft: structuredClone(draft) }; }
export async function readyPublicChecklistForReview() { checklist.status = "READY_FOR_REVIEW"; return getPublicChecklist(); }
