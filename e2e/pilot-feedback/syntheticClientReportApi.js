// Synthetic client report boundary (fictitious data, no provider/network).
const params = new URLSearchParams(globalThis.location?.search || "");
const lang = params.get("lang") || "pt";
const pt = lang === "pt";
const colors = ["#cfe0d6", "#d9e3ec", "#eadfcf", "#e1d9ea", "#d4e6e4", "#e8d6d6", "#dfe6cf", "#d6dbe8"];
const photo = (index) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="${colors[index % colors.length]}"/>`
  + `<text x="240" y="186" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#41524a">${pt ? "Foto fictícia" : "Sample photo"} ${index + 1}</text></svg>`,
);
const photoCount = Number(params.get("photos") || 8);
const evidence = Array.from({ length: photoCount }, (_, i) => ({ evidenceId: `synthetic-photo-${i + 1}` }));
const section = (title, items) => ({ title, items: items.map(([label, answer = "DONE"]) => ({ label, answer })) });

export const report = {
  titleKey: "clientReport.title",
  propertyName: "Casa Jasmim (exemplo)",
  serviceDate: "2026-11-20",
  sections: [
    section(pt ? "Cozinha" : "Kitchen", [[pt ? "Limpar bancadas e pia" : "Clean counters and sink"], [pt ? "Limpar fogão e micro-ondas" : "Clean stove and microwave"], [pt ? "Esvaziar lixo" : "Empty trash"]]),
    section(pt ? "Banheiros" : "Bathrooms", [[pt ? "Higienizar vaso, pia e box" : "Sanitize toilet, sink and shower"], [pt ? "Trocar toalhas" : "Replace towels"], [pt ? "Limpar espelhos" : "Clean mirrors"]]),
    section(pt ? "Quartos" : "Bedrooms", [[pt ? "Trocar roupa de cama" : "Change bed linen"], [pt ? "Verificar embaixo das camas" : "Check under beds"], [pt ? "Varanda" : "Balcony", "NOT_APPLICABLE"]]),
  ],
  inventoryItems: [
    { label: pt ? "Sabonete líquido" : "Hand soap", answer: "NEEDS_RESTOCK" },
    { label: pt ? "Papel higiênico" : "Toilet paper", answer: "LOW" },
    { label: pt ? "Café" : "Coffee", answer: "HIGH" },
  ],
  issueNotes: pt ? "Uma lâmpada do corredor está queimada." : "One hallway bulb is out.",
  generalNotes: pt ? "Casa pronta para os próximos hóspedes." : "House ready for the next guests.",
  managerNote: params.get("note") === "0" ? "" : (pt
    ? "Tudo pronto para a chegada de sexta. Deixamos toalhas extras no armário do corredor."
    : "Everything is ready for Friday's arrival. We left extra towels in the hallway closet."),
  summary: { tasksDone: 8, tasksNotApplicable: 1, tasksTotal: 9, photoCount, restockCount: 2 },
  hasPhoto: photoCount > 0,
  evidence,
};

export const clientReportRequestTimeoutMilliseconds = 15_000;
export class ClientReportRequestError extends Error {}
export async function getPublicClientReport() { return structuredClone(report); }
export function publicClientReportPhotoUrl(_token, evidenceId) {
  return photo(Number(String(evidenceId).split("-").pop()) - 1 || 0);
}

let capability = { state: params.get("report") === "active" ? "ACTIVE" : "NONE", presentation: { managerNote: "", includeCleanerNotes: true } };
export async function getClientReportCapability() { return structuredClone(capability); }
export async function createClientReport(_jobId, { presentation } = {}) {
  capability = { state: "ACTIVE", presentation: presentation || capability.presentation };
  return { created: true, capability: structuredClone(capability), url: `${location.origin}/client-report?t=synthetic-token` };
}
export async function updateClientReport(_jobId, { presentation, markSent } = {}) {
  capability = {
    ...capability,
    ...(presentation ? { presentation } : {}),
    ...(markSent ? { lastSent: { channel: markSent.channel, at: new Date("2026-11-20T15:40:00-08:00").toISOString() } } : {}),
  };
  return structuredClone(capability);
}
export async function revokeClientReport() { capability = { state: "REVOKED" }; return structuredClone(capability); }
