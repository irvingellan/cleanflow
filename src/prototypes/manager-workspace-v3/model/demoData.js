import { addDays, hhmm } from "./time.js";

// Every record here is invented. No real client, property, cleaner, address,
// phone number, access code or amount is used. Access codes are DEMO-#### only.

export const DEMO_CLOCK_MINUTES = 10 * 60 + 40; // demo "now": 10:40 AM, Los Angeles

export const clients = [
  { id: "c1", name: "Coastal Key Management" },
  { id: "c2", name: "Sunset Hosting" },
  { id: "c3", name: "Harbor Stay Co." },
  { id: "c4", name: "Bluewater Rentals" },
];

export const cleaners = [
  { id: "marta", name: "Marta", lang: "pt", phone: "(555) 010-0101" },
  { id: "paula", name: "Paula", lang: "pt", phone: "(555) 010-0102" },
  { id: "renata", name: "Renata", lang: "pt", phone: "(555) 010-0103" },
  { id: "sofia", name: "Sofia", lang: "es", phone: "(555) 010-0104" },
  { id: "julia", name: "Júlia", lang: "pt", phone: "(555) 010-0105" },
  { id: "lucia", name: "Lúcia", lang: "es", phone: "(555) 010-0106" },
  { id: "joana", name: "Joana", lang: "pt", phone: "(555) 010-0107" },
  { id: "dani", name: "Dani", lang: "en", phone: "(555) 010-0108" },
  { id: "bia", name: "Bia", lang: "pt", phone: "(555) 010-0109" },
  { id: "nora", name: "Nora", lang: "en", phone: "(555) 010-0110" },
];

const L = (pt, en, es) => ({ pt, en, es });

const turnoverSections = [
  { id: "entry", title: L("Entrada e sala", "Entry and living room", "Entrada y sala"), items: [
    { id: "floor", label: L("Aspirar e passar pano no piso", "Vacuum and mop the floor", "Aspirar y trapear el piso") },
    { id: "sofa", label: L("Sofá, almofadas e mantas arrumados", "Sofa, pillows and throws tidy", "Sofá, cojines y mantas ordenados") },
    { id: "livingPhoto", label: L("Foto da sala pronta", "Photo of the finished living room", "Foto de la sala lista"), photo: true },
  ] },
  { id: "kitchen", title: L("Cozinha", "Kitchen", "Cocina"), items: [
    { id: "dishes", label: L("Louça lavada e guardada", "Dishes washed and put away", "Platos lavados y guardados") },
    { id: "counters", label: L("Bancadas, fogão e micro-ondas limpos", "Counters, stove and microwave clean", "Encimeras, estufa y microondas limpios") },
    { id: "fridge", label: L("Geladeira vazia e limpa", "Fridge empty and clean", "Refrigerador vacío y limpio") },
    { id: "kitchenPhoto", label: L("Foto da cozinha", "Kitchen photo", "Foto de la cocina"), photo: true },
  ] },
  { id: "bath", title: L("Banheiros", "Bathrooms", "Baños"), items: [
    { id: "toilet", label: L("Vaso, pia e box higienizados", "Toilet, sink and shower sanitized", "Inodoro, lavabo y ducha desinfectados") },
    { id: "towels", label: L("Toalhas limpas dobradas", "Clean towels folded", "Toallas limpias dobladas") },
    { id: "restock", label: L("Papel e sabonete repostos", "Paper and soap restocked", "Papel y jabón repuestos") },
    { id: "showerPhoto", label: L("Foto do box", "Shower photo", "Foto de la ducha"), photo: true },
  ] },
  { id: "bedrooms", title: L("Quartos", "Bedrooms", "Recámaras"), items: [
    { id: "linen", label: L("Roupa de cama trocada", "Bed linen changed", "Ropa de cama cambiada") },
    { id: "closet", label: L("Armários e gavetas vazios", "Closets and drawers empty", "Clósets y cajones vacíos") },
    { id: "bedPhoto", label: L("Foto da cama arrumada", "Photo of the made bed", "Foto de la cama tendida"), photo: true },
  ] },
  { id: "exit", title: L("Saída", "Leaving", "Salida"), items: [
    { id: "trash", label: L("Lixo levado para fora", "Trash taken out", "Basura sacada") },
    { id: "locks", label: L("Portas e janelas trancadas", "Doors and windows locked", "Puertas y ventanas cerradas") },
    { id: "key", label: L("Chave devolvida ao cofre", "Key returned to the lockbox", "Llave devuelta a la caja") },
  ] },
];

const touchupSections = [
  { id: "quick", title: L("Retoque rápido", "Quick touch-up", "Retoque rápido"), items: [
    { id: "surfaces", label: L("Superfícies sem pó", "Surfaces dusted", "Superficies sin polvo") },
    { id: "bathQuick", label: L("Banheiro conferido", "Bathroom checked", "Baño revisado") },
    { id: "touchPhoto", label: L("Foto geral do imóvel", "Overall photo of the home", "Foto general"), photo: true },
  ] },
];

const propertyRows = [
  ["harbor", "Harbor House", "Seaside", "c3", 120, "turnover", L("Estacionar na vaga 2. Lixo: portão lateral.", "Park in spot 2. Trash: side gate.", "Estacionar en el lugar 2. Basura: portón lateral."), 3],
  ["juniper", "Juniper Loft", "Bayview", "c2", 95, "turnover", L("Elevador até o 3º andar. Aspirador no armário do corredor.", "Elevator to 3rd floor. Vacuum in hall closet.", "Elevador al 3er piso. Aspiradora en el clóset del pasillo."), 2],
  ["alder", "Alder Court 3", "Bayview", "c1", 110, "turnover", L("Roupa de cama extra no baú do quarto.", "Spare linen in the bedroom chest.", "Ropa de cama extra en el baúl."), 3],
  ["cedar", "Cedar Bungalow", "Northgate", "c2", 130, "turnover", L("Não usar alvejante no piso de madeira.", "No bleach on the wood floor.", "No usar cloro en el piso de madera."), 2],
  ["garden", "Garden Studio B", "Northgate", "c1", 85, "turnover", L("Entrada pelos fundos.", "Use the back entrance.", "Entrada por atrás."), 1],
  ["linden", "Linden Terrace", "Northgate", "c3", 150, "turnover", L("Casa grande: equipe de duas pessoas.", "Large home: two-person team.", "Casa grande: equipo de dos."), 4],
  ["maple", "Maple Studio A", "Bayview", "c2", 80, "turnover", L("Toalhas ficam na lavanderia do prédio.", "Towels are in the building laundry.", "Las toallas están en la lavandería."), 2],
  ["marina", "Marina Flat 4B", "Seaside", "c1", 100, "turnover", L("Vaga de visitante no subsolo.", "Visitor parking in the basement.", "Estacionamiento de visitas en el sótano."), 2],
  ["sunset", "Sunset Duplex", "Seaside", "c3", 160, "turnover", L("Duas unidades: começar pela de cima.", "Two units: start upstairs.", "Dos unidades: empezar arriba."), 5],
  ["willow", "Willow Row 12", "Northgate", "c4", null, "turnover", L("Cliente novo: confirmar instruções.", "New client: confirm instructions.", "Cliente nuevo: confirmar instrucciones."), 1],
  ["birch", "Birch Cottage", "Bayview", "c2", 115, "turnover", L("Jardim não faz parte do serviço.", "Garden is not part of the job.", "El jardín no es parte del servicio."), 2],
  ["dune", "Dune House", "Seaside", "c4", 140, "turnover", L("Areia: aspirar a varanda.", "Sand: vacuum the porch.", "Arena: aspirar el porche."), 3],
  ["pine", "Pine Ridge Cabin", "Old Mill", "c3", 175, "turnover", L("Lareira: não limpar cinzas.", "Fireplace: do not clean ashes.", "Chimenea: no limpiar cenizas."), 2],
  ["ocean", "Ocean Loft 2", "Seaside", "c1", 105, "turnover", L("Chuveiro externo também.", "Outdoor shower too.", "También la ducha exterior."), 3],
  ["light", "Lighthouse Suite", "Seaside", "c3", 90, "turnover", L("Suíte única.", "Single suite.", "Suite única."), 1],
];

export function buildProperties() {
  return propertyRows.map(([id, name, area, clientId, payout, type, instructions, version], index) => ({
    id, name, area, clientId, defaultPayout: payout, defaultType: type, instructions,
    accessCode: `DEMO-${String(4821 + index * 37).slice(-4)}`, // fictitious, demo only
    checklistTemplateId: `tpl-${id}`, templateVersion: version,
  }));
}

export function buildTemplates() {
  return Object.fromEntries(propertyRows.map(([id, , , , , , , version]) => [`tpl-${id}`, {
    id: `tpl-${id}`, propertyId: id, version,
    sections: JSON.parse(JSON.stringify(id === "maple" ? [...turnoverSections.slice(0, 3), turnoverSections[4]] : turnoverSections)),
    history: Array.from({ length: version }, (_, i) => ({ version: i + 1, note: i === 0 ? "created" : "edited" })),
  }]));
}

export const touchupTemplate = touchupSections;

export function checklistItems(sections) {
  return sections.flatMap(s => s.items.map(item => ({ ...item, sectionId: s.id })));
}

const at = (date, minutes) => ({ date, min: minutes });

// Builds a checklist snapshot from the property's template, with N items done.
function checklistFor(templates, propertyId, state, { done = 0, photos = 0, missing = [], savedAt, submittedAt, notes, link = "active", reviewedAt } = {}) {
  if (state === "none") return { state, items: {}, photos: [], link: "none", templateVersion: templates[`tpl-${propertyId}`].version };
  const tpl = templates[`tpl-${propertyId}`];
  const all = checklistItems(tpl.sections);
  const items = {};
  all.forEach((item, index) => { items[item.id] = index < done && !missing.includes(item.id); });
  const photoItems = all.filter(i => i.photo && items[i.id]);
  const photoList = [];
  for (let i = 0; i < photos; i += 1) {
    const item = photoItems[i % Math.max(photoItems.length, 1)] || all[0];
    photoList.push({ id: `${propertyId}-p${i + 1}`, itemId: item.id, sectionId: item.sectionId, status: "saved", n: i + 1 });
  }
  return { state, items, photos: photoList, savedAt, submittedAt, reviewedAt, notes: notes || "", link, templateVersion: tpl.version, workDone: state !== "draft" };
}

let sequence = 0;
function job(today, p, dayOffset, start, fields) {
  sequence += 1;
  const date = addDays(today, dayOffset);
  return {
    id: `j${String(sequence).padStart(2, "0")}`, propertyId: p, date, start, durationMin: 180,
    type: "turnover", comp: null, status: "UNASSIGNED", cleanerIds: [], ack: null,
    offers: [], offerLink: null, offerConcept: null, issues: [], notes: "",
    guestOut: start ? hhmm(Math.max(0, (Number(start.slice(0, 2)) - 1) * 60)) : null,
    guestIn: start ? "16:00" : null, activity: [], createdBy: "demo", ...fields,
  };
}

export function buildDemoState(today) {
  sequence = 0;
  const properties = buildProperties();
  const templates = buildTemplates();
  const byId = Object.fromEntries(properties.map(p => [p.id, p]));
  const fixed = id => ({ mode: "fixed", amount: byId[id].defaultPayout, source: "property" });
  const y = -1;
  const ck = (p, state, opts) => checklistFor(templates, p, state, opts);
  const offer = (cleanerId, sentAt, response = null, respondedAt = null, via = "link") => ({ cleanerId, sentAt, response, respondedAt, via });

  const jobs = [
    // Yesterday
    job(today, "dune", y, "13:00", { status: "IN_PROGRESS", cleanerIds: ["bia"], ack: "confirmed", comp: fixed("dune"), checklist: ck("dune", "none"),
      activity: [{ at: at(addDays(today, y), 13 * 60 + 4), key: "act.started", params: { name: "Bia" } }] }),
    job(today, "harbor", y, "10:00", { status: "COMPLETED", cleanerIds: ["marta"], ack: "confirmed", comp: fixed("harbor"), checklist: ck("harbor", "reviewed", { done: 99, photos: 12, submittedAt: at(addDays(today, y), 12 * 60 + 41), reviewedAt: at(addDays(today, y), 15 * 60) }), completedAt: at(addDays(today, y), 15 * 60 + 2) }),
    job(today, "maple", y, "11:00", { status: "COMPLETED", cleanerIds: ["julia"], ack: "confirmed", comp: fixed("maple"), checklist: ck("maple", "reviewed", { done: 99, photos: 8, submittedAt: at(addDays(today, y), 13 * 60 + 50), reviewedAt: at(addDays(today, y), 16 * 60) }), completedAt: at(addDays(today, y), 16 * 60 + 3) }),
    // Today
    job(today, "light", 0, "06:00", { status: "COMPLETED", cleanerIds: ["sofia"], ack: "confirmed", comp: fixed("light"), checklist: ck("light", "reviewed", { done: 99, photos: 9, submittedAt: at(today, 7 * 60 + 42), reviewedAt: at(today, 8 * 60 + 50) }), completedAt: at(today, 8 * 60 + 55) }),
    job(today, "sunset", 0, "07:00", { status: "IN_PROGRESS", cleanerIds: ["renata"], ack: "confirmed", comp: fixed("sunset"), startedAt: at(today, 7 * 60 + 3),
      checklist: ck("sunset", "submitted", { done: 99, photos: 16, submittedAt: at(today, 9 * 60 + 58), notes: "Tudo certo. Repus 2 rolos de papel." }) }),
    job(today, "ocean", 0, "07:30", { status: "IN_PROGRESS", cleanerIds: ["marta"], ack: "confirmed", comp: fixed("ocean"), startedAt: at(today, 7 * 60 + 34),
      checklist: ck("ocean", "submitted", { done: 99, photos: 13, missing: ["showerPhoto"], submittedAt: at(today, 10 * 60 + 12), notes: "Uma toalha de banho está manchada, separei na lavanderia." }) }),
    job(today, "marina", 0, "08:00", { status: "IN_PROGRESS", cleanerIds: ["sofia"], ack: "confirmed", comp: fixed("marina"), startedAt: at(today, 8 * 60 + 6),
      checklist: ck("marina", "draft", { done: 12, photos: 5, savedAt: at(today, 10 * 60 + 31) }) }),
    job(today, "alder", 0, "09:00", { status: "IN_PROGRESS", cleanerIds: ["paula"], ack: "confirmed", comp: fixed("alder"), startedAt: at(today, 9 * 60 + 2),
      checklist: ck("alder", "draft", { done: 7, photos: 2, savedAt: at(today, 10 * 60 + 2) }),
      issues: [{ id: "i1", title: L("Persiana quebrada no quarto principal", "Broken blind in the main bedroom", "Persiana rota en la recámara principal"), by: "paula", at: at(today, 9 * 60 + 47), status: "open" }] }),
    job(today, "garden", 0, "09:30", { status: "IN_PROGRESS", cleanerIds: ["bia"], ack: "confirmed", comp: fixed("garden"), startedAt: at(today, 9 * 60 + 41),
      checklist: ck("garden", "draft", { done: 4, photos: 1, savedAt: at(today, 9 * 60 + 58), link: "stale" }) }),
    job(today, "harbor", 0, "11:00", { status: "ASSIGNED", cleanerIds: ["marta"], ack: "confirmed", comp: fixed("harbor"), checklist: ck("harbor", "none") }),
    job(today, "cedar", 0, "11:00", { status: "ASSIGNED", cleanerIds: ["lucia"], ack: "confirmed", comp: fixed("cedar"), checklist: ck("cedar", "none") }),
    job(today, "maple", 0, "12:00", { status: "ASSIGNED", cleanerIds: ["joana"], ack: "pending", comp: fixed("maple"), checklist: ck("maple", "none"),
      offers: [offer("joana", at(addDays(today, -2), 19 * 60), "interested", at(addDays(today, -2), 20 * 60 + 5))] }),
    job(today, "pine", 0, "13:00", { status: "ASSIGNED", cleanerIds: ["dani"], ack: "not_notified", comp: fixed("pine"), checklist: ck("pine", "none") }),
    job(today, "juniper", 0, "14:00", { status: "UNASSIGNED", comp: fixed("juniper"), checklist: ck("juniper", "none") }),
    job(today, "birch", 0, "14:00", { status: "OFFERED", comp: fixed("birch"), checklist: ck("birch", "none"), offerLink: "https://demo.cleanflow.invalid/o/BRC-7Q2", offerConcept: "details",
      offers: [offer("nora", at(addDays(today, -1), 21 * 60 + 10), "interested", at(today, 7 * 60 + 58)), offer("paula", at(addDays(today, -1), 21 * 60 + 10), "declined", at(addDays(today, -1), 21 * 60 + 40)), offer("joana", at(addDays(today, -1), 21 * 60 + 10))] }),
    job(today, "linden", 0, "15:00", { status: "ASSIGNED", cleanerIds: ["renata", "nora"], ack: "confirmed", comp: fixed("linden"), checklist: ck("linden", "none") }),
    job(today, "willow", 0, "15:30", { status: "OFFERED", comp: null, checklist: ck("willow", "none"), offerLink: "https://demo.cleanflow.invalid/o/WLW-3K8", offerConcept: "details",
      offers: [offer("julia", at(addDays(today, -1), 20 * 60 + 30)), offer("joana", at(addDays(today, -1), 20 * 60 + 30))] }),
    // Tomorrow
    job(today, "sunset", 1, "09:00", { status: "ASSIGNED", cleanerIds: ["renata"], ack: "confirmed", comp: fixed("sunset"), checklist: ck("sunset", "none") }),
    job(today, "alder", 1, "10:00", { status: "UNASSIGNED", comp: fixed("alder"), checklist: ck("alder", "none") }),
    job(today, "cedar", 1, "11:00", { status: "ASSIGNED", cleanerIds: ["lucia"], ack: "pending", comp: fixed("cedar"), checklist: ck("cedar", "none") }),
    job(today, "garden", 1, "11:00", { status: "OFFERED", comp: fixed("garden"), checklist: ck("garden", "none"), offerLink: "https://demo.cleanflow.invalid/o/GRD-5T1", offerConcept: "details",
      offers: [offer("bia", at(today, 8 * 60 + 15)), offer("dani", at(today, 8 * 60 + 15))] }),
    job(today, "marina", 1, "12:00", { status: "ASSIGNED", cleanerIds: ["sofia"], ack: "confirmed", comp: fixed("marina"), checklist: ck("marina", "none") }),
    job(today, "pine", 1, "13:00", { status: "ASSIGNED", cleanerIds: ["dani"], ack: "confirmed", comp: fixed("pine"), checklist: ck("pine", "none") }),
    job(today, "ocean", 1, "14:00", { status: "ASSIGNED", cleanerIds: ["marta"], ack: "confirmed", comp: fixed("ocean"), checklist: ck("ocean", "none") }),
    job(today, "birch", 1, null, { status: "UNASSIGNED", comp: fixed("birch"), checklist: ck("birch", "none"), type: "cleaning" }),
  ];

  // Later this week and next week: deterministic spread for the dense-list scenario.
  const later = [
    ["harbor", 2, "11:00", "ASSIGNED", ["marta"], "confirmed"], ["juniper", 2, "10:00", "ASSIGNED", ["julia"], "confirmed"], ["linden", 2, "12:00", "OFFERED", [], null],
    ["dune", 3, "13:00", "ASSIGNED", ["bia"], "pending"], ["maple", 3, null, "UNASSIGNED", [], null], ["ocean", 3, "11:00", "ASSIGNED", ["marta"], "confirmed"],
    ["sunset", 4, "09:00", "ASSIGNED", ["renata"], "confirmed"], ["willow", 4, "10:00", "UNASSIGNED", [], null], ["cedar", 4, "11:00", "ASSIGNED", ["lucia"], "confirmed"],
    ["pine", 5, "13:00", "ASSIGNED", ["dani"], "confirmed"], ["garden", 5, "10:30", "ASSIGNED", ["bia"], "confirmed"], ["alder", 5, "11:00", "UNASSIGNED", [], null],
    ["marina", 6, "12:00", "ASSIGNED", ["sofia"], "confirmed"], ["birch", 6, "14:00", "ASSIGNED", ["nora"], "pending"],
    ["harbor", 8, "11:00", "UNASSIGNED", [], null], ["juniper", 9, "10:00", "ASSIGNED", ["julia"], "confirmed"], ["light", 9, "09:00", "UNASSIGNED", [], null], ["sunset", 11, "09:00", "ASSIGNED", ["renata"], "confirmed"],
  ];
  later.forEach(([p, d, start, status, ids, ack]) => {
    const offers = status === "OFFERED" ? [offer("paula", at(today, 9 * 60)), offer("lucia", at(today, 9 * 60))] : [];
    jobs.push(job(today, p, d, start, { status, cleanerIds: ids, ack, comp: fixed(p), checklist: ck(p, "none"), offers,
      offerLink: offers.length ? `https://demo.cleanflow.invalid/o/${p.slice(0, 3).toUpperCase()}-${d}X9` : null, offerConcept: offers.length ? "details" : null }));
  });
  // One touch-up with hourly pay (proposal), to exercise the hourly concept.
  jobs.push(job(today, "juniper", 3, "15:00", { status: "ASSIGNED", cleanerIds: ["paula"], ack: "confirmed", type: "touchup", durationMin: 120,
    comp: { mode: "hourly", rate: 28, estHours: 2, source: "manual" }, checklist: ck("juniper", "none"), proposal: true }));

  const notifications = [
    { id: "n1", type: "offer", jobId: "j15", at: at(today, 7 * 60 + 58), titleKey: "n.offerInterest", params: { name: "Nora", property: "Birch Cottage" }, read: false, delivery: { accepted: true, displayed: "unknown", openedAt: null } },
    { id: "n2", type: "issue", jobId: "j08", at: at(today, 9 * 60 + 47), titleKey: "n.issue", params: { name: "Paula", property: "Alder Court 3" }, read: true, delivery: { accepted: true, displayed: "confirmed", openedAt: at(today, 9 * 60 + 49) } },
    { id: "n3", type: "checklist", jobId: "j05", at: at(today, 9 * 60 + 58), titleKey: "n.checklist", params: { name: "Renata", property: "Sunset Duplex" }, read: false, tappedBeforeRead: true, delivery: { accepted: true, displayed: "confirmed", openedAt: at(today, 10 * 60 + 1) } },
    { id: "n4", type: "checklist", jobId: "j06", at: at(today, 10 * 60 + 12), titleKey: "n.checklist", params: { name: "Marta", property: "Ocean Loft 2" }, read: false, delivery: { accepted: true, displayed: "unknown", openedAt: null } },
    { id: "n5", type: "summary", jobId: null, at: at(today, 7 * 60), titleKey: "n.summary", params: { count: 7 }, read: true, delivery: { accepted: true, displayed: "unknown", openedAt: null } },
    { id: "n6", type: "offer", jobId: "j15", at: at(addDays(today, -1), 21 * 60 + 40), titleKey: "n.offerDeclined", params: { name: "Paula", property: "Birch Cottage" }, read: true, delivery: { accepted: true, displayed: "unknown", openedAt: null } },
    { id: "n7", type: "test", jobId: null, at: at(addDays(today, -1), 18 * 60 + 2), titleKey: "n.test", params: {}, read: true, genericOnDevice: true, delivery: { accepted: true, displayed: "generic", openedAt: null } },
  ];

  return {
    version: 3, today, clock: { date: today, minutes: DEMO_CLOCK_MINUTES },
    properties, templates, jobs, notifications, devices: [
      { id: "d1", labelKey: "dev.thisPhone", owner: "manager", status: "ok", lastTest: at(addDays(today, -1), 18 * 60 + 2) },
      { id: "d2", labelKey: "dev.otherPhone", owner: "second", status: "silent", lastTest: at(addDays(today, -1), 17 * 60 + 40) },
    ],
  };
}
