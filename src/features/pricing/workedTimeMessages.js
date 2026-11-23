const messages = {
  en: {
    report: "Report my hours", review: "Hours to approve", hours: "Hours", minutes: "Minutes", total: "Total", correct: "Correct hours", cancel: "Cancel",
    waiting: "Waiting for approval", unreported: "Hours not reported", approved: "Approved",
    save: "Save hours", approve: "Approve hours", saving: "Saving…", failed: "Could not save hours. Check the service and try again.",
    touchUp: "Touch-ups default to 2 hours. Confirm any longer duration manually.",
    rounding: "Time rounds to the nearest 5 minutes.", loading: "Loading assignments…",
    unavailable: "The assignments could not be loaded.", empty: "No hourly assignments yet.",
    removeApproval: "Remove approval", agreedRate: "This assignment keeps the cleaner’s agreed rate.",
    pendingGroup: "Hours to approve",
  },
  pt: {
    report: "Informar minhas horas", review: "Horas para aprovar", hours: "Horas", minutes: "Minutos", total: "Total", correct: "Corrigir horas", cancel: "Cancelar",
    waiting: "Aguardando aprovação", unreported: "Horas ainda não informadas", approved: "Aprovadas",
    save: "Salvar horas", approve: "Aprovar horas", saving: "Salvando…", failed: "Não foi possível salvar as horas. Confira o serviço e tente novamente.",
    touchUp: "O retoque tem duração padrão de 2 horas. Confirme manualmente qualquer duração maior.",
    rounding: "O tempo é arredondado para o múltiplo de 5 minutos mais próximo.", loading: "Carregando atribuições…",
    unavailable: "Não foi possível carregar as atribuições.", empty: "Ainda não há atribuições por hora.",
    removeApproval: "Remover aprovação", agreedRate: "Esta atribuição mantém a tarifa combinada com a profissional.",
    pendingGroup: "Horas para aprovar",
  },
  es: {
    report: "Informar mis horas", review: "Horas por aprobar", hours: "Horas", minutes: "Minutos", total: "Total", correct: "Corregir horas", cancel: "Cancelar",
    waiting: "Pendiente de aprobación", unreported: "Horas sin informar", approved: "Aprobadas",
    save: "Guardar horas", approve: "Aprobar horas", saving: "Guardando…", failed: "No se pudieron guardar las horas. Revisa el servicio e inténtalo de nuevo.",
    touchUp: "El retoque dura 2 horas por defecto. Confirma manualmente cualquier duración mayor.",
    rounding: "El tiempo se redondea a los 5 minutos más cercanos.", loading: "Cargando asignaciones…",
    unavailable: "No se pudieron cargar las asignaciones.", empty: "Aún no hay asignaciones por hora.",
    removeApproval: "Quitar aprobación", agreedRate: "Esta asignación mantiene la tarifa acordada con la persona que realiza la limpieza.",
    pendingGroup: "Horas por aprobar",
  },
};

export function workedTimeMessages(language) {
  return messages[String(language || "en").slice(0, 2)] || messages.en;
}
