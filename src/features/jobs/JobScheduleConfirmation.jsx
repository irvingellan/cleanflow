import { useId, useState } from "react";
import { copyCleanerReminderMessage } from "./cleanerReminderMessage.js";
import { buildWhatsAppHandoffUrl } from "./whatsappHandoff.js";
import {
  buildScheduleConfirmationDraft, currentScheduleRevision, scheduleConfirmationMessage,
} from "./scheduleConfirmation.js";

export function JobScheduleConfirmation({
  job, responses, cleanerName, cleanerLanguage, cleanerPhone, translate, language,
  replacementOffer, replacementCandidates, canOfferReplacement, onOfferReplacement, onAssignReplacement,
}) {
  const [draftCleanerId, setDraftCleanerId] = useState(null);
  const [copyState, setCopyState] = useState(null);
  const [replacementCleanerId, setReplacementCleanerId] = useState("");
  const [replacementState, setReplacementState] = useState(null);
  const headingId = useId();
  const message = (key, values) => scheduleConfirmationMessage(language, key, values);
  const pending = responses.filter(({ state }) => state === "PENDING").length;
  const maySend = !job.archivedAt && job.operationalStatus === "ASSIGNED";
  const draftRecipient = maySend && responses.find(({ cleanerId, state }) => (
    state === "PENDING" && cleanerId === draftCleanerId
  ));
  const draft = draftRecipient && buildScheduleConfirmationDraft(job, {
    language: cleanerLanguage(draftCleanerId),
    propertyName: job.propertyName || translate("properties.unnamed"),
  });
  const whatsappUrl = draft ? buildWhatsAppHandoffUrl(cleanerPhone(draftCleanerId), draft) : null;
  const replacementBusy = replacementState === "working";

  async function copyDraft() {
    setCopyState("working");
    try {
      await copyCleanerReminderMessage(draft);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
  }

  async function updateReplacement(action) {
    setReplacementState("working");
    try {
      await action();
      setReplacementCleanerId("");
      setReplacementState(null);
    } catch (error) {
      setReplacementState(error?.details?.reason === "automatic-offers-active" ? "automatic-offers-active" : "error");
    }
  }

  return (
    <section className="assignment-roster" aria-labelledby={headingId}>
      <div className="assignment-roster__header"><h3 id={headingId}>{message("title")}</h3></div>
      {pending > 0 && maySend && <p role="status">{message("awaiting")} · {message("pendingCount", { count: pending })}</p>}
      <div className="assignment-roster__list">
        {responses.map(({ cleanerId, state, assignmentId }) => (
          <article key={cleanerId} className="assignment-roster__item">
            <strong>{cleanerName(cleanerId, assignmentId)}</strong>
            <span className="status-badge">{message(state)}</span>
            {maySend && state === "PENDING" && (
              <button type="button" className="button assignment-roster__message-action" onClick={() => {
                setDraftCleanerId(cleanerId);
                setCopyState(null);
              }}>
                {message("whatsapp")}
              </button>
            )}
          </article>
        ))}
      </div>
      {draft && (
        <div className="job-reminder-preview__message">
          <strong>{cleanerName(draftCleanerId, draftRecipient.assignmentId)}</strong>
          <pre>{draft}</pre>
          <p className="form-hint">{message("manualDraft")}</p>
          <div className="button-row">
            {whatsappUrl && (
              <a className="button button--primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                {message("openDraft")}
              </a>
            )}
            <button type="button" className="button" disabled={copyState === "working"} onClick={copyDraft}>
              {translate(copyState === "done" ? "jobs.messageCopied" : "jobs.reminderCopyNow")}
            </button>
            <button type="button" className="button" onClick={() => setDraftCleanerId(null)}>
              {translate("common.cancel")}
            </button>
          </div>
          {!whatsappUrl && <p className="form-hint">{translate("whatsapp.phoneNeeded")}</p>}
          {copyState === "error" && <p className="form-error" role="alert">{translate("jobs.copyMessageError")}</p>}
        </div>
      )}
      {replacementOffer?.status && (
        <p role="status">
          {message({ PENDING: "replacementPending", INTERESTED: "replacementInterested", DECLINED: "replacementDeclined" }[replacementOffer.status])}
          {" · "}{cleanerName(replacementOffer.cleanerId, null)}
        </p>
      )}
      {canOfferReplacement && (
        <form className="cleaning-form" onSubmit={(event) => {
          event.preventDefault();
          if (!replacementBusy && replacementCandidates.some(({ id }) => id === replacementCleanerId)) {
            void updateReplacement(() => onOfferReplacement(replacementCleanerId, currentScheduleRevision(job)));
          }
        }}>
          <label>
            {message("replacementCleaner")}
            <select value={replacementCleanerId} onChange={(event) => setReplacementCleanerId(event.target.value)}>
              <option value="">{translate("common.notProvided")}</option>
              {replacementCandidates.map(({ id }) => <option key={id} value={id}>{cleanerName(id, null)}</option>)}
            </select>
          </label>
          <button type="submit" className="button" disabled={!replacementCleanerId || replacementBusy}>
            {message("replacementPrompt")}
          </button>
        </form>
      )}
      {replacementOffer?.status === "INTERESTED" && onAssignReplacement && (
        <button type="button" className="button button--primary" disabled={replacementBusy}
          onClick={() => void updateReplacement(() => onAssignReplacement(replacementOffer.cleanerId, replacementOffer.id))}>
          {message("replacementAssign")}
        </button>
      )}
      {replacementState === "error" && <p role="alert" className="form-error">{message("replacementError")}</p>}
      {replacementState === "automatic-offers-active" && <p role="alert" className="form-hint">{message("originalOffersActive")}</p>}
    </section>
  );
}
