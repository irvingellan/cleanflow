const messages = {
  en: {
    "cleanerSelection.scheduled": "Already scheduled that day",
    "cleanerSelection.timeNotSet": "Time not set",
    "cleanerSelection.historyOne": "Cleaned here once in recent history · Last: {date}",
    "cleanerSelection.historyMany": "Cleaned here {count} times in recent history · Last: {date}",
    "cleanerSelection.historyLowerBound": "Cleaned here at least {count} times in recent history · Last found: {date}",
    "cleanerSelection.loading": "Checking schedules and recent history…",
    "cleanerSelection.unavailable": "Schedules and recent history could not be checked. You can still select a cleaner.",
    "cleanerSelection.partial": "Search limits reached. Some schedule or recent history details may be missing.",
  },
  pt: {
    "cleanerSelection.scheduled": "Já agendada neste dia",
    "cleanerSelection.timeNotSet": "Horário não informado",
    "cleanerSelection.historyOne": "Limpou esta casa uma vez no histórico recente · Última em {date}",
    "cleanerSelection.historyMany": "Limpou esta casa {count} vezes no histórico recente · Última em {date}",
    "cleanerSelection.historyLowerBound": "Limpou esta casa pelo menos {count} vezes no histórico recente · Última encontrada em {date}",
    "cleanerSelection.loading": "Consultando agenda e histórico recente…",
    "cleanerSelection.unavailable": "Não foi possível consultar agenda e histórico recente. Você ainda pode escolher uma cleaner.",
    "cleanerSelection.partial": "Limite da consulta atingido. A agenda ou o histórico recente podem estar incompletos.",
  },
  es: {
    "cleanerSelection.scheduled": "Ya tiene servicio ese día",
    "cleanerSelection.timeNotSet": "Hora sin indicar",
    "cleanerSelection.historyOne": "Limpió esta casa una vez en el historial reciente · Última vez: {date}",
    "cleanerSelection.historyMany": "Limpió esta casa {count} veces en el historial reciente · Última vez: {date}",
    "cleanerSelection.historyLowerBound": "Limpió esta casa al menos {count} veces en el historial reciente · Última encontrada: {date}",
    "cleanerSelection.loading": "Consultando agenda e historial reciente…",
    "cleanerSelection.unavailable": "No se han podido consultar la agenda y el historial reciente. Aún puedes elegir una cleaner.",
    "cleanerSelection.partial": "Se alcanzó el límite de búsqueda. Pueden faltar datos de la agenda o del historial reciente.",
  },
};

export function cleanerSelectionMessage(language, key, replacements = {}) {
  const message = (messages[language] || messages.en)[key];
  return message.replace(/\{(\w+)\}/g, (_, name) => String(replacements[name] ?? ""));
}
