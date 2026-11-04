const messages = {
  "inbox.title": ["Caixa de entrada", "Inbox", "Bandeja de entrada"],
  "inbox.back": ["Voltar", "Back", "Volver"],
  "inbox.unreadCount": ["{count} não lido(s)", "{count} unread", "{count} sin leer"],
  "inbox.filter": ["Filtrar avisos", "Filter notifications", "Filtrar avisos"],
  "inbox.filter.all": ["Todos", "All", "Todos"],
  "inbox.filter.unread": ["Não lidos", "Unread", "Sin leer"],
  "inbox.filter.read": ["Lidos", "Read", "Leídos"],
  "inbox.loading": ["Carregando avisos…", "Loading notifications…", "Cargando avisos…"],
  "inbox.loadError": ["Não foi possível carregar os avisos. Tente atualizar.", "Could not load notifications. Try refreshing.", "No se pudieron cargar los avisos. Intenta actualizar."],
  "inbox.actionError": ["Não foi possível completar a ação. Tente de novo.", "Could not complete the action. Try again.", "No se pudo completar la acción. Intenta de nuevo."],
  "inbox.refresh": ["Atualizar avisos", "Refresh notifications", "Actualizar avisos"],
  "inbox.window": ["Mostrando os 100 avisos mais recentes.", "Showing the 100 most recent notifications.", "Se muestran los 100 avisos más recientes."],
  "inbox.empty": ["Nenhum aviso neste filtro.", "No notifications in this filter.", "No hay avisos en este filtro."],
  "inbox.read": ["Lido", "Read", "Leído"],
  "inbox.unread": ["Não lido", "Unread", "Sin leer"],
  "inbox.targetUnavailable": ["Este item não está mais disponível.", "This item is no longer available.", "Este elemento ya no está disponible."],
  "inbox.open": ["Abrir", "Open", "Abrir"],
  "inbox.markRead": ["Marcar como lido", "Mark as read", "Marcar como leído"],
  "inbox.event.generic": ["Atualização operacional", "Operational update", "Actualización operativa"],
  "inbox.event.CLEANER_INTERESTED": ["Cleaner demonstrou interesse", "Cleaner expressed interest", "Una cleaner expresó interés"],
  "inbox.event.AUTO_ASSIGNMENT_CONFIRMED": ["Atribuição automática confirmada", "Automatic assignment confirmed", "Asignación automática confirmada"],
  "inbox.event.ASSIGNMENT_CONFIRMED": ["Atribuição confirmada", "Assignment confirmed", "Asignación confirmada"],
  "inbox.event.CHECKLIST_READY_FOR_REVIEW": ["Checklist pronto para revisão", "Checklist ready for review", "Checklist listo para revisión"],
  "inbox.event.TOMORROW_19": ["Lembrete de serviços de amanhã", "Reminder for tomorrow's jobs", "Recordatorio de servicios de mañana"],
  "inbox.event.TODAY_07": ["Lembrete de serviços de hoje", "Reminder for today's jobs", "Recordatorio de servicios de hoy"],
  "inbox.event.NEW_OFFER": ["Nova oferta", "New offer", "Nueva oferta"],
  "inbox.event.AUTO_ASSIGNED": ["Serviço confirmado pelo seu aceite", "Job confirmed by your acceptance", "Servicio confirmado por tu aceptación"],
  "inbox.event.ASSIGNED": ["Serviço confirmado", "Job confirmed", "Servicio confirmado"],
  "inbox.event.RESCHEDULED": ["Data ou horário alterado", "Date or time changed", "Cambió la fecha o la hora"],
  "inbox.event.CANCELLED": ["Serviço cancelado", "Job cancelled", "Servicio cancelado"],
  "inbox.event.UNASSIGNED": ["Serviço retirado da sua agenda", "Job removed from your schedule", "Servicio retirado de tu agenda"],
};

export function inboxMessage(language, key, params = {}) {
  const text = (messages[key] || messages["inbox.event.generic"])[{ pt: 0, en: 1, es: 2 }[language] ?? 1];
  return Object.entries(params).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), text);
}
