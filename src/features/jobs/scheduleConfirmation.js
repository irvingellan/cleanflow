import { formatDate } from "../../lib/presentation.js";
import { rosterCleanerIds } from "./offerSlots.js";

const agendaUrl = "https://clean-flow-prototipo.web.app/agenda";
const states = new Set(["PENDING", "CONFIRMED", "DECLINED"]);

export function currentScheduleRevision(job) {
  return Number.isSafeInteger(job?.scheduleRevision) && job.scheduleRevision >= 0
    ? job.scheduleRevision : 0;
}

export function currentScheduleConfirmations(job) {
  const confirmation = job?.scheduleConfirmation;
  if (!confirmation || !Number.isSafeInteger(confirmation.revision) || confirmation.revision < 1
    || confirmation.revision !== currentScheduleRevision(job)
    || !confirmation.byCleaner || typeof confirmation.byCleaner !== "object"
    || Array.isArray(confirmation.byCleaner)) return [];

  const assigned = new Set(rosterCleanerIds(job));
  return Object.entries(confirmation.byCleaner).flatMap(([cleanerId, response]) => (
    cleanerId && states.has(response?.state)
      && ((response.assignmentId === null && job.schemaVersion !== 2)
        || (typeof response.assignmentId === "string" && response.assignmentId))
      && (response.state === "DECLINED" || assigned.has(cleanerId))
      ? [{ cleanerId, assignmentId: response.assignmentId, state: response.state }]
      : []
  ));
}

export function pendingScheduleConfirmationCount(job) {
  return !job.archivedAt && job.operationalStatus === "ASSIGNED"
    ? currentScheduleConfirmations(job).filter(({ state }) => state === "PENDING").length
    : 0;
}

const messages = {
  title: ["Confirmação da nova data", "New date confirmation", "Confirmación de la nueva fecha"],
  awaiting: ["Aguardando confirmação da nova data", "Awaiting confirmation of the new date", "En espera de confirmar la nueva fecha"],
  pendingCount: ["Respostas pendentes: {count}", "Pending responses: {count}", "Respuestas pendientes: {count}"],
  upcomingCount: ["Serviços aguardando confirmação da nova data: {count}", "Jobs awaiting confirmation of the new date: {count}", "Servicios en espera de confirmar la nueva fecha: {count}"],
  PENDING: ["Aguardando resposta", "Awaiting response", "En espera de respuesta"],
  CONFIRMED: ["Confirmou", "Confirmed", "Confirmó"],
  DECLINED: ["Não pode", "Unavailable", "No puede"],
  whatsapp: ["Avisar no WhatsApp", "Notify on WhatsApp", "Avisar por WhatsApp"],
  openDraft: ["Abrir rascunho no WhatsApp", "Open draft in WhatsApp", "Abrir borrador en WhatsApp"],
  manualDraft: ["Revise o rascunho e envie pelo WhatsApp.", "Review the draft and send it in WhatsApp.", "Revisa el borrador y envíalo en WhatsApp."],
  stale: ["O horário mudou desde que você abriu este formulário. Confira a data atual antes de tentar de novo.", "The schedule changed while this form was open. Review the current date before trying again.", "El horario cambió mientras este formulario estaba abierto. Revisa la fecha actual antes de intentarlo de nuevo."],
  readbackError: ["O novo horário foi salvo. As confirmações aparecem quando a conexão voltar.", "The new schedule was saved. Confirmations will appear when the connection returns.", "Se guardó el nuevo horario. Las confirmaciones aparecerán cuando se restablezca la conexión."],
  reviewCurrent: ["Conferir horário atual", "Review current schedule", "Revisar horario actual"],
  replacementPrompt: ["Oferecer a vaga a outra cleaner", "Offer the spot to another cleaner", "Ofrecer la plaza a otra cleaner"],
  replacementCleaner: ["Cleaner para a vaga", "Cleaner for the open spot", "Cleaner para la plaza"],
  replacementPending: ["Oferta de reposição aguardando resposta", "Replacement offer awaiting response", "Oferta de reemplazo en espera de respuesta"],
  replacementInterested: ["Cleaner interessada na vaga", "Cleaner interested in the open spot", "Cleaner interesada en la plaza"],
  replacementDeclined: ["Cleaner recusou a oferta de reposição", "Cleaner declined the replacement offer", "La cleaner rechazó la oferta de reemplazo"],
  replacementAssign: ["Confirmar atribuição", "Confirm assignment", "Confirmar asignación"],
  replacementError: ["A ação da vaga não foi concluída. Confira o serviço e tente novamente.", "The vacancy could not be updated. Review the job and try again.", "No se pudo actualizar la plaza. Revisa el servicio e inténtalo de nuevo."],
  originalOffersActive: ["Ainda há ofertas automáticas aguardando resposta. Aguarde ou revogue as ofertas pendentes antes de oferecer a vaga manualmente.", "Automatic offers are still awaiting responses. Wait or revoke the pending offers before offering the spot manually.", "Aún hay ofertas automáticas en espera. Espera o revoca las ofertas pendientes antes de ofrecer la plaza manualmente."],
  draft: [
    "A data ou o horário do serviço em {property} mudou para {when}. Você pode? Responda em Minha agenda: {agenda}",
    "The date or time for the job at {property} changed to {when}. Can you make it? Reply in My Schedule: {agenda}",
    "La fecha o la hora del servicio en {property} cambió a {when}. ¿Puedes? Responde en Mi agenda: {agenda}",
  ],
};

export function scheduleConfirmationMessage(language, key, values = {}) {
  const template = messages[key][{ pt: 0, en: 1, es: 2 }[language] ?? 1];
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

export function buildScheduleConfirmationDraft(job, { language, propertyName }) {
  const when = [formatDate(job.scheduledDate, null, language), job.scheduledStart].filter(Boolean).join(" · ");
  return scheduleConfirmationMessage(language, "draft", { property: propertyName, when, agenda: agendaUrl });
}
