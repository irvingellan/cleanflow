import { logger } from "firebase-functions";
import { syncCleanerAgendaForJob } from "../cleanerAgenda.js";
import { recordCleanerJobInboxEvents, recordCleanerOfferInboxEvent } from "../cleanerNotificationEvents.js";
import { isAutomaticOfferJob } from "../firstAcceptWins.js";
import { db } from "../runtime/firebase.js";

function agendaHandler(recordInbox, { deferInitialAutomaticOfferSync = false } = {}) {
  return async (event) => {
    try {
      const context = { organizationId: event.params.orgId, jobId: event.params.jobId };
      const { before, after } = event.data || {};
      // The automatic distribution transaction creates every Offer with a
      // Job update. Its Job trigger reprojects the complete committed batch.
      const jobTriggerOwnsAgenda = deferInitialAutomaticOfferSync
        && before?.exists === false && isAutomaticOfferJob(after?.data());
      await Promise.all([
        jobTriggerOwnsAgenda ? null : syncCleanerAgendaForJob(db, context),
        recordInbox?.(db, {
          ...context, offerId: event.params.offerId, eventId: event.id,
          before, after,
        }),
      ]);
    } catch (error) {
      logger.error("Cleaner agenda sync failed.", { code: error?.code || "unknown" });
      throw error;
    }
  };
}

export const onJobWrite = agendaHandler(recordCleanerJobInboxEvents);
export const onAssignmentWrite = agendaHandler();
export const onOfferWrite = agendaHandler(recordCleanerOfferInboxEvent, { deferInitialAutomaticOfferSync: true });
export const onChecklistRunWrite = agendaHandler();

export async function onChecklistStart(event) {
  if (!["drafts", "evidenceState"].includes(event.params.progressCollection)) return;
  await syncCleanerAgendaForJob(db, { organizationId: event.params.orgId, jobId: event.params.jobId });
}
