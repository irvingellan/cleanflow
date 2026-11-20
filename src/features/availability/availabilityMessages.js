const messages = {
  title: ["Dias em que não posso trabalhar", "Days I cannot work", "Días en los que no puedo trabajar"],
  add: ["Adicionar período", "Add a period", "Añadir período"],
  save: ["Salvar período", "Save period", "Guardar período"],
  cancel: ["Cancelar", "Cancel", "Cancelar"],
  remove: ["Remover", "Remove", "Quitar"],
  from: ["De", "From", "Desde"],
  to: ["Até", "To", "Hasta"],
  partial: ["Parte do dia", "Part of the day", "Parte del día"],
  startTime: ["Hora inicial", "Start time", "Hora inicial"],
  endTime: ["Hora final", "End time", "Hora final"],
  allDay: ["Dia inteiro", "All day", "Todo el día"],
  allDays: ["Dias inteiros", "Full days", "Días completos"],
  empty: ["Nenhum período adicionado.", "No periods added.", "No hay períodos añadidos."],
  loading: ["Carregando períodos…", "Loading periods…", "Cargando períodos…"],
  loadError: ["Não foi possível carregar os períodos.", "Could not load the periods.", "No se pudieron cargar los períodos."],
  retry: ["Tentar de novo", "Try again", "Volver a intentar"],
  actionError: ["Não foi possível salvar a alteração. Tente de novo.", "Could not save the change. Try again.", "No se pudo guardar el cambio. Vuelve a intentarlo."],
  capacity: ["O limite é de 30 períodos. Remova um para adicionar outro.", "You can have up to 30 periods. Remove one to add another.", "El límite es de 30 períodos. Quita uno para añadir otro."],
  dates: ["Confira as datas inicial e final.", "Check the start and end dates.", "Revisa las fechas inicial y final."],
  past: ["O período precisa incluir hoje ou uma data futura.", "The period must include today or a future date.", "El período debe incluir hoy o una fecha futura."],
  duration: ["Escolha um período de até 366 dias.", "Choose a period of up to 366 days.", "Elige un período de hasta 366 días."],
  times: ["Informe as duas horas. A hora final deve ser posterior à inicial.", "Enter both times. The end must be after the start.", "Indica ambas horas. La hora final debe ser posterior a la inicial."],
  added: ["Período adicionado.", "Period added.", "Período añadido."],
  removed: ["Período removido.", "Period removed.", "Período eliminado."],
  conflictOne: ["Você tem 1 serviço neste período. Fale com a gerente.", "You have 1 job in this period. Talk to your manager.", "Tienes 1 servicio en este período. Habla con tu gerente."],
  conflictMany: ["Você tem {count} serviços neste período. Fale com a gerente.", "You have {count} jobs in this period. Talk to your manager.", "Tienes {count} servicios en este período. Habla con tu gerente."],
  unknownOne: ["Você tem 1 serviço sem horário nesse dia. Confira com a gerente.", "You have 1 job without a start time that day. Check with your manager.", "Tienes 1 servicio sin hora ese día. Consulta con tu gerente."],
  unknownMany: ["Você tem {count} serviços sem horário nesse dia. Confira com a gerente.", "You have {count} jobs without a start time that day. Check with your manager.", "Tienes {count} servicios sin hora ese día. Consulta con tu gerente."],
};

export function availabilityMessage(language, key, values = {}) {
  const message = messages[key][{ pt: 0, en: 1, es: 2 }[language] ?? 1];
  return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}
