// Fictitious fixtures for the Pilot feedback harness. Names, properties, codes
// and addresses are invented; no real operational data.
import { addDaysToKey, localDateKey } from "../../src/features/cleaner-hub/cleanerAgendaModel.js";

export const today = localDateKey(new Date());
const nextMonth = (key) => { const [y, m] = key.split("-").map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`; };
const m1 = nextMonth(today); const m2 = nextMonth(m1);

const job = (n, date, start, name, extra = {}) => ({
  id: `ana__job-${n}`, kind: "ASSIGNED", jobId: `job-${n}`, cleanerId: "ana-demo", jobStatus: "ASSIGNED",
  propertyName: name, scheduledDate: date, scheduledStart: start, acknowledged: true, scheduleRevision: 0, ...extra,
});

// "Hoje 1" + 8 future services across three months, like the reported capture.
export function hubEntries() {
  return [
    job(1, today, "11:00", "Casa Jasmim (exemplo)", { checklist: { status: "DRAFT", started: false } }),
    job(2, addDaysToKey(today, 2), "10:00", "Apartamento Ipê (exemplo)", { checklist: { status: "DRAFT", started: true } }),
    job(3, addDaysToKey(today, 5), "09:30", "Chalé Aroeira (exemplo)", { checklist: { status: "NONE" } }),
    job(4, addDaysToKey(today, 9), "12:00", "Casa Jasmim (exemplo)"),
    job(5, addDaysToKey(m1, 3), "10:00", "Loft Cedro (exemplo)"),
    job(6, addDaysToKey(m1, 8), "11:30", "Apartamento Ipê (exemplo)"),
    job(7, addDaysToKey(m1, 19), "09:00", "Casa Jasmim (exemplo)"),
    job(8, addDaysToKey(m2, 1), "10:30", "Chalé Aroeira (exemplo)"),
    job(9, addDaysToKey(m2, 12), "13:00", "Loft Cedro (exemplo)"),
    { id: "ana__offer-1", kind: "OFFER", jobId: "offer-1", cleanerId: "ana-demo", jobStatus: "OFFERED", offerStatus: "PENDING", propertyName: "Casa Bromélia (exemplo)", scheduledDate: addDaysToKey(today, 3), scheduledStart: "10:00", offeredCompensation: 120, offerExpiresAtMs: Date.now() + 2 * 86_400_000 },
  ];
}

export const submittedEntry = job(10, addDaysToKey(today, -0), "08:00", "Casa Submetida (exemplo)", { jobStatus: "IN_PROGRESS", checklist: { status: "READY_FOR_REVIEW", started: true } });

export const fictitiousAccess = {
  state: "available",
  address: "100 Example Lane, Demo City (fictício)",
  items: [
    { kind: "gate", label: "Portão da garagem", value: "0000 · exemplo" },
    { kind: "lockbox", label: "Cofre de chaves", value: "Ao lado da porta lateral · código 0000 (exemplo)" },
    { kind: "parking", value: "Vaga 0 coberta · não usar a vaga da visita (exemplo)" },
    { kind: "wifi", value: "Rede ExemploNet · senha exemplo-0000" },
  ],
  houseInstructions: "Exemplo de instruções da casa:\n• Toalhas usadas vão para o cesto da lavanderia.\n• Repor 2 rolos de papel em cada banheiro.\n• Fechar a porta de vidro do quintal ao sair.\n• Lixo reciclável no contêiner azul.",
};

const cleaner = (id, name) => ({ id, name, active: true });
export const managerCleaners = [cleaner("ana-demo", "Ana Exemplo"), cleaner("bia-demo", "Bia Exemplo"), cleaner("cris-demo", "Cris Exemplo"), cleaner("duda-demo", "Duda Exemplo")];
const stamp = (minutesAgo) => ({ toMillis: () => Date.now() - minutesAgo * 60_000, toDate: () => new Date(Date.now() - minutesAgo * 60_000) });
const offer = (id, cleanerId, name, status, minutesAgo) => ({ id, cleanerId, cleanerName: name, status, offeredCompensation: 120, ...(status !== "PENDING" ? { respondedAt: stamp(minutesAgo) } : {}) });

export const managerScenarios = {
  one: { status: "OFFERED", offers: [offer("o1", "ana-demo", "Ana Exemplo", "INTERESTED", 12), offer("o2", "bia-demo", "Bia Exemplo", "PENDING"), offer("o3", "cris-demo", "Cris Exemplo", "DECLINED", 40)] },
  several: { status: "OFFERED", offers: [offer("o1", "ana-demo", "Ana Exemplo", "INTERESTED", 12), offer("o2", "bia-demo", "Bia Exemplo", "INTERESTED", 5), offer("o3", "cris-demo", "Cris Exemplo", "PENDING")] },
  none: { status: "OFFERED", offers: [offer("o2", "bia-demo", "Bia Exemplo", "PENDING"), offer("o3", "cris-demo", "Cris Exemplo", "DECLINED", 40)] },
};
