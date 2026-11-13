// Feature strings follow the active application locale.
const messages = {
  en: {
    start: "Service date from", end: "Service date through", apply: "Apply dates",
    invalidPeriod: "Choose a valid start and end date, up to 31 days inclusive.",
    dateRule: "Includes completed, non-archived REAL services by scheduled date. Both dates are included. Week shortcuts follow Pacific time.",
    client: "Client", allClients: "All loaded clients", unnamedClient: "Client unresolved",
    clientScope: "The client filter applies to services loaded for these dates.",
    partial: "Partial results. There are more than {limit} Job records in these dates. Choose shorter date ranges to review the remaining services.",
    emptyPartial: "No eligible services in the loaded records. Shorten the date range to review the other records.",
    attention: "{count} services need attention in this selection.",
    loading: "Loading these service dates…",
    error: "These dates could not be verified. Check your connection and refresh.",
    empty: "No completed REAL services for this selection.",
    loadedCount: "Completed services loaded",
  },
  pt: {
    start: "Data inicial do serviço", end: "Data final do serviço", apply: "Aplicar datas",
    invalidPeriod: "Escolha datas válidas de início e fim, com até 31 dias no total.",
    dateRule: "Inclui serviços REAIS concluídos e não arquivados pela data agendada. O período inclui as duas datas. Os atalhos seguem o horário do Pacífico.",
    client: "Cliente", allClients: "Todos os clientes carregados", unnamedClient: "Cliente não identificado",
    clientScope: "O filtro de cliente se aplica aos serviços carregados para essas datas.",
    partial: "Resultados parciais. Há mais de {limit} registros de serviços nessas datas. Escolha períodos menores para revisar os demais serviços.",
    emptyPartial: "Nenhum serviço elegível nos registros carregados. Reduza o período para revisar os demais registros.",
    attention: "{count} serviços precisam de atenção nesta seleção.",
    loading: "Carregando serviços dessas datas…",
    error: "Não foi possível verificar essas datas. Confira a conexão e atualize.",
    empty: "Nenhum serviço REAL concluído nesta seleção.",
    loadedCount: "Serviços concluídos carregados",
  },
  es: {
    start: "Fecha inicial del servicio", end: "Fecha final del servicio", apply: "Aplicar fechas",
    invalidPeriod: "Elige fechas válidas de inicio y fin, con un máximo de 31 días en total.",
    dateRule: "Incluye servicios REALES completados y sin archivar por fecha programada. El período incluye ambas fechas. Los atajos siguen el horario del Pacífico.",
    client: "Cliente", allClients: "Todos los clientes cargados", unnamedClient: "Cliente sin identificar",
    clientScope: "El filtro de cliente se aplica a los servicios cargados para estas fechas.",
    partial: "Resultados parciales. Hay más de {limit} registros de servicios en estas fechas. Elige períodos más cortos para revisar los demás servicios.",
    emptyPartial: "No hay servicios elegibles en los registros cargados. Acorta el período para revisar los demás registros.",
    attention: "{count} servicios necesitan atención en esta selección.",
    loading: "Cargando los servicios de estas fechas…",
    error: "No se pudieron verificar estas fechas. Comprueba la conexión y actualiza.",
    empty: "No hay servicios REALES completados en esta selección.",
    loadedCount: "Servicios completados cargados",
  },
};

export function periodMessage(language, key, replacements = {}) {
  const value = (messages[language] || messages.en)[key];
  return value.replace(/\{(\w+)\}/g, (_, replacement) => String(replacements[replacement]));
}
