// Feature strings follow the active application locale; the message to a
// cleaner follows that cleaner's preferred language.
const messages = {
  en: {
    open: "Weekly agenda", title: "Cleaner agenda", eyebrow: "Read only",
    intro: "Each cleaner's services, services still missing a cleaner, and completed services for the weekly payment.",
    thisWeek: "This week", nextWeek: "Next week", lastWeek: "Last week",
    start: "From", end: "Through", apply: "Apply dates", refresh: "Refresh",
    invalidPeriod: "Choose a valid start and end date, up to 31 days inclusive.",
    tabSchedule: "By cleaner", tabUnassigned: "Without cleaner", tabCompleted: "Completed (payment)",
    cleaner: "Cleaner", allCleaners: "All cleaners",
    loading: "Loading these dates…", error: "These dates could not be loaded. Check your connection and refresh.",
    partial: "Partial results: more than {limit} services in these dates. Choose a shorter period.",
    emptySchedule: "No services with a cleaner in these dates.",
    emptyUnassigned: "Every service in these dates has its cleaners.",
    emptyCompleted: "No completed services in these dates.",
    services: "{count} services", serviceOne: "1 service",
    noTime: "No time", unnamedProperty: "House not identified", noAddress: "No address on the property",
    unnamedCleaner: "Cleaner not identified",
    spots: "{filled} of {required} cleaners", openService: "Open service",
    copy: "Copy agenda", copied: "Agenda copied", copyFailed: "Could not copy. Select the text below.",
    whatsapp: "Send on WhatsApp", noPhone: "Add a phone with country code (+1…) to send on WhatsApp.",
    payout: "Payout", payoutUnknown: "Not recorded", shared: "Shared service: split not recorded",
    total: "Total", knownTotal: "Known total", totalIncomplete: "{count} without amount: check before paying",
    privacy: "Messages include date, time, house and address only. Door, gate and lockbox codes are never included.",
    status: { UNASSIGNED: "No cleaner", OFFERED: "Offered", ASSIGNED: "Assigned", IN_PROGRESS: "In progress", COMPLETED: "Completed" },
  },
  pt: {
    open: "Agenda da semana", title: "Agenda das cleaners", eyebrow: "Somente leitura",
    intro: "Os serviços de cada cleaner, os serviços que ainda estão sem cleaner e as limpezas concluídas para o pagamento da semana.",
    thisWeek: "Esta semana", nextWeek: "Próxima semana", lastWeek: "Semana passada",
    start: "De", end: "Até", apply: "Aplicar datas", refresh: "Atualizar",
    invalidPeriod: "Escolha datas válidas de início e fim, com até 31 dias no total.",
    tabSchedule: "Por cleaner", tabUnassigned: "Sem cleaner", tabCompleted: "Concluídas (pagamento)",
    cleaner: "Cleaner", allCleaners: "Todas as cleaners",
    loading: "Carregando essas datas…", error: "Não foi possível carregar essas datas. Confira a conexão e atualize.",
    partial: "Resultados parciais: há mais de {limit} serviços nessas datas. Escolha um período menor.",
    emptySchedule: "Nenhum serviço com cleaner nessas datas.",
    emptyUnassigned: "Todos os serviços dessas datas já têm cleaner.",
    emptyCompleted: "Nenhuma limpeza concluída nessas datas.",
    services: "{count} serviços", serviceOne: "1 serviço",
    noTime: "Sem horário", unnamedProperty: "Casa não identificada", noAddress: "Casa sem endereço cadastrado",
    unnamedCleaner: "Cleaner não identificada",
    spots: "{filled} de {required} cleaners", openService: "Abrir serviço",
    copy: "Copiar agenda", copied: "Agenda copiada", copyFailed: "Não deu para copiar. Selecione o texto abaixo.",
    whatsapp: "Enviar no WhatsApp", noPhone: "Cadastre o telefone com código do país (+1…) para enviar no WhatsApp.",
    payout: "Pagamento", payoutUnknown: "Sem valor", shared: "Serviço dividido: valor por cleaner não registrado",
    total: "Total", knownTotal: "Total conhecido", totalIncomplete: "{count} sem valor: confira antes de pagar",
    privacy: "As mensagens têm só data, horário, casa e endereço. Códigos de porta, portão e cofre nunca entram.",
    status: { UNASSIGNED: "Sem cleaner", OFFERED: "Oferecido", ASSIGNED: "Atribuído", IN_PROGRESS: "Em andamento", COMPLETED: "Concluído" },
  },
  es: {
    open: "Agenda de la semana", title: "Agenda de las cleaners", eyebrow: "Solo lectura",
    intro: "Los servicios de cada cleaner, los servicios que aún no tienen cleaner y las limpiezas completadas para el pago de la semana.",
    thisWeek: "Esta semana", nextWeek: "Próxima semana", lastWeek: "Semana pasada",
    start: "Desde", end: "Hasta", apply: "Aplicar fechas", refresh: "Actualizar",
    invalidPeriod: "Elige fechas válidas de inicio y fin, con un máximo de 31 días en total.",
    tabSchedule: "Por cleaner", tabUnassigned: "Sin cleaner", tabCompleted: "Completadas (pago)",
    cleaner: "Cleaner", allCleaners: "Todas las cleaners",
    loading: "Cargando estas fechas…", error: "No se pudieron cargar estas fechas. Revisa la conexión y actualiza.",
    partial: "Resultados parciales: hay más de {limit} servicios en estas fechas. Elige un período más corto.",
    emptySchedule: "No hay servicios con cleaner en estas fechas.",
    emptyUnassigned: "Todos los servicios de estas fechas ya tienen cleaner.",
    emptyCompleted: "No hay limpiezas completadas en estas fechas.",
    services: "{count} servicios", serviceOne: "1 servicio",
    noTime: "Sin hora", unnamedProperty: "Casa sin identificar", noAddress: "Casa sin dirección registrada",
    unnamedCleaner: "Cleaner sin identificar",
    spots: "{filled} de {required} cleaners", openService: "Abrir servicio",
    copy: "Copiar agenda", copied: "Agenda copiada", copyFailed: "No se pudo copiar. Selecciona el texto de abajo.",
    whatsapp: "Enviar por WhatsApp", noPhone: "Registra el teléfono con código de país (+1…) para enviar por WhatsApp.",
    payout: "Pago", payoutUnknown: "Sin monto", shared: "Servicio compartido: monto por cleaner no registrado",
    total: "Total", knownTotal: "Total conocido", totalIncomplete: "{count} sin monto: revisa antes de pagar",
    privacy: "Los mensajes incluyen solo fecha, hora, casa y dirección. Nunca incluyen códigos de puerta, portón o caja.",
    status: { UNASSIGNED: "Sin cleaner", OFFERED: "Ofrecido", ASSIGNED: "Asignado", IN_PROGRESS: "En curso", COMPLETED: "Completado" },
  },
};

const cleanerMessages = {
  en: { greeting: "Hi {name}!", intro: "Your CleanFlow schedule from {start} to {end}:", closing: "Any questions, just message me." },
  pt: { greeting: "Olá, {name}!", intro: "Sua agenda CleanFlow de {start} a {end}:", closing: "Qualquer dúvida, me chame." },
  es: { greeting: "¡Hola, {name}!", intro: "Tu agenda CleanFlow del {start} al {end}:", closing: "Cualquier duda, escríbeme." },
};

export function agendaText(language, key, replacements = {}) {
  const value = (messages[language] || messages.en)[key] ?? messages.en[key];
  return typeof value === "string"
    ? value.replace(/\{(\w+)\}/g, (_, name) => String(replacements[name] ?? ""))
    : value;
}

export function agendaStatus(language, status) {
  return (messages[language] || messages.en).status[status] || status;
}

export function cleanerMessageCopy(language) {
  return { ...(cleanerMessages[language] || cleanerMessages.en), unnamedProperty: agendaText(language, "unnamedProperty") };
}

export const supportedAgendaLanguage = (value) => (Object.hasOwn(messages, value) ? value : null);
